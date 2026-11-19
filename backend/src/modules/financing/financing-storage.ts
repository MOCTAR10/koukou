import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  hasImageSignature,
  uploadsRoot,
  type UploadedImageFile,
} from '../farms/farms.service.js';

/** Largest document (financing documents, consent template and scans). */
export const FINANCING_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** Mime whitelist → stored extension and canonical mime. */
const ACCEPTED: Readonly<Record<string, { ext: string; mime: string }>> = {
  'application/pdf': { ext: 'pdf', mime: 'application/pdf' },
  'image/jpeg': { ext: 'jpg', mime: 'image/jpeg' },
  'image/jpg': { ext: 'jpg', mime: 'image/jpeg' },
  'image/png': { ext: 'png', mime: 'image/png' },
  'image/webp': { ext: 'webp', mime: 'image/webp' },
};

/** Files of a farm's financing (never served statically). */
export function financingDir(farmId: string): string {
  return join(uploadsRoot(), 'financing', farmId);
}

/** Consent templates of the bank. */
export function templatesDir(): string {
  return join(uploadsRoot(), 'financing', 'templates');
}

export interface ValidatedFile {
  buffer: Buffer;
  mime: string;
  ext: string;
  sha256: string;
  originalName: string;
}

/**
 * Checks an uploaded document: present, not empty, ≤ 10 MiB, mime in the
 * whitelist (PDF, JPEG, PNG, WebP) and the bytes agree with it (`%PDF-` or the
 * image's own signature). The declared type comes from the client.
 */
export function validateUpload(file: UploadedImageFile | undefined): ValidatedFile {
  if (!file) {
    throw new BadRequestException('Aucun fichier reçu (champ « file »).');
  }
  const accepted = ACCEPTED[file.mimetype];
  if (!accepted) {
    throw new BadRequestException(
      'Format non supporté. Utilisez un fichier PDF, JPEG, PNG ou WebP.',
    );
  }
  if (file.size === 0 || file.buffer.length === 0) {
    throw new BadRequestException('Le fichier est vide.');
  }
  if (file.size > FINANCING_FILE_MAX_BYTES || file.buffer.length > FINANCING_FILE_MAX_BYTES) {
    throw new BadRequestException('Un fichier ne doit pas dépasser 10 Mo.');
  }
  const genuine =
    accepted.ext === 'pdf'
      ? file.buffer.subarray(0, 5).toString('latin1') === '%PDF-'
      : hasImageSignature(file.buffer, accepted.ext);
  if (!genuine) {
    throw new BadRequestException(
      'Le contenu du fichier ne correspond pas à son format (PDF, JPEG, PNG ou WebP).',
    );
  }
  return {
    buffer: file.buffer,
    mime: accepted.mime,
    ext: accepted.ext,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    originalName: (file.originalname || `document.${accepted.ext}`)
      .replace(/[\\/\r\n"]/g, '_')
      .slice(0, 255),
  };
}

/** Writes the bytes under a random name; returns the stored name. */
export async function storeFile(dir: string, file: ValidatedFile): Promise<string> {
  const storedName = `${randomUUID()}.${file.ext}`;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, storedName), file.buffer);
  return storedName;
}

/** Rollback of a stored file (never throws). */
export async function discardFile(dir: string, storedName: string): Promise<void> {
  await unlink(join(dir, storedName)).catch(() => undefined);
}

export async function readStored(dir: string, storedName: string): Promise<Buffer> {
  const buffer = await readFile(join(dir, storedName)).catch(() => null);
  if (!buffer) throw new NotFoundException('Fichier introuvable sur le serveur.');
  return buffer;
}

/** Parses a JSON-array multipart field of strings. */
export function parseJsonStrings(raw: string, field: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException(`Le champ « ${field} » doit être une liste JSON.`);
  }
  if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== 'string')) {
    throw new BadRequestException(`Le champ « ${field} » doit être une liste de textes.`);
  }
  return parsed.map((x: string) => x.trim()).filter(Boolean);
}
