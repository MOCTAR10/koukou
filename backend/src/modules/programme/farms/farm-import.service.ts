import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthUser } from '../../../common/decorators/current-user.decorator.js';
import { GpsSource } from '../../../common/enums/gps-source.enum.js';
import { ProgramListType } from '../../../common/enums/program-list-type.enum.js';
import { normalizePhone } from '../../../common/utils/phone.js';
import { AccessScopeKind } from '../../../common/enums/access-scope-kind.enum.js';
import { ScopeResolver } from '../../access/scope-resolver.service.js';
import type { Program } from '../entities/program.entity.js';
import { Localite } from '../entities/localite.entity.js';
import { Province } from '../entities/province.entity.js';
import type { RefItem } from '../entities/ref-item.entity.js';
import { ProgrammeService } from '../programme.service.js';
import { RefListsService } from '../ref-lists.service.js';
import { CsvError, parseCsv } from './csv.js';
import {
  mapCsvTable,
  mapJsonRows,
  parseCount,
  parseDecimal,
  type ImportFormat,
  type MappedImport,
  type RawFarmRow,
} from './import-mapping.js';
import {
  ProgrammeFarmsService,
  type DuplicateCandidate,
  type RegistryEntry,
  type ResolvedEntry,
} from './programme-farms.service.js';
import {
  matchByCodeOrName,
  matchListItem,
  normalizeAmiRef,
  normalizeFarmName,
} from './registry-rules.js';

export const IMPORT_MAX_ROWS = 5000;
const PHONE_PATTERN = /^\+?\d{6,15}$/;

export type ImportOutcome = 'CREEE' | 'A_CREER' | 'DEJA_PRESENTE' | 'REJETEE';

export interface ImportLine {
  readonly line: number;
  readonly name: string | null;
  readonly outcome: ImportOutcome;
  readonly farmId?: string | null;
  readonly code?: string | null;
  readonly reason?: string;
  readonly duplicates?: DuplicateCandidate[];
}

export interface ImportReport {
  readonly dryRun: boolean;
  readonly format: ImportFormat;
  readonly read: number;
  /** Created (or, in a dry run, that would be created). */
  readonly created: number;
  /** Already in the registry (same AMI reference, or same name in the same province). */
  readonly matched: number;
  readonly rejected: number;
  readonly unknownColumns: string[];
  readonly lines: ImportLine[];
}

export interface UploadedCsvFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Normalized name without spaces: « agri vert » = « agrivert ». */
function sameNameKey(normalizedName: string): string {
  return normalizedName.replace(/ /g, '');
}

/** UTF-8 (BOM tolerated), else Windows-1252/Latin-1 as Excel often saves. */
export function decodeCsv(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return buffer.toString('latin1');
  }
}

interface ImportContext {
  readonly provinces: (Province & { localites: Localite[] })[];
  readonly cohorts: RefItem[];
  readonly statuses: RefItem[];
  readonly defaultStatus: RefItem;
}

/**
 * Import of the farm list (POUFA list `numero,nom,province` or the full
 * format). Idempotent: a row matching a registry farm (same AMI reference,
 * else same normalized name in the same province) is reported as already
 * present, never created twice. A probable duplicate that is not an exact
 * match is rejected unless `confirmDuplicate`. A dry run (the default)
 * writes nothing; a real run writes every creatable row in one transaction.
 */
@Injectable()
export class FarmImportService {
  constructor(
    private readonly programme: ProgrammeService,
    private readonly lists: RefListsService,
    private readonly registry: ProgrammeFarmsService,
    private readonly scope: ScopeResolver,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async import(
    user: AuthUser,
    input: {
      file?: UploadedCsvFile;
      rows?: Record<string, unknown>[];
      dryRun?: boolean;
      confirmDuplicate?: boolean;
      /** A real run inside the caller's transaction (data recovery). */
      em?: EntityManager;
    },
  ): Promise<ImportReport> {
    if (this.scope.isInstitution(user)) {
      // A bulk import may touch any province: national scope only.
      const access = await this.scope.requireAccess(user);
      if (access.scopeKind !== AccessScopeKind.ALL) {
        throw new ForbiddenException(
          "L'import de fermes est réservé aux profils de périmètre national.",
        );
      }
    }
    const mapped = this.read(input);
    if (mapped.error) throw new BadRequestException(mapped.error);
    if (mapped.rows.length > IMPORT_MAX_ROWS) {
      throw new BadRequestException(
        `${IMPORT_MAX_ROWS} lignes au maximum par import (${mapped.rows.length} reçues).`,
      );
    }
    const dryRun = input.dryRun !== false;
    const program = await this.programme.current();
    const ctx = await this.context(program);
    const run = (em: EntityManager) =>
      this.process(
        em,
        program,
        ctx,
        mapped,
        user,
        dryRun,
        input.confirmDuplicate === true,
      );
    const inTransaction = async (em: EntityManager) => {
      await this.registry.lockRegistry(em, program.id);
      return run(em);
    };
    if (dryRun) return run(this.dataSource.manager);
    return input.em
      ? inTransaction(input.em)
      : this.dataSource.transaction(inTransaction);
  }

  private read(input: {
    file?: UploadedCsvFile;
    rows?: Record<string, unknown>[];
  }): MappedImport {
    if (input.file) {
      try {
        return mapCsvTable(parseCsv(decodeCsv(input.file.buffer)));
      } catch (e) {
        if (e instanceof CsvError) throw new BadRequestException(e.message);
        throw e;
      }
    }
    if (input.rows) return mapJsonRows(input.rows);
    throw new BadRequestException(
      'Envoyez un fichier CSV (champ « file ») ou des lignes JSON (« rows »).',
    );
  }

  private async context(program: Program): Promise<ImportContext> {
    const provinces = (await this.dataSource.getRepository(Province).find({
      where: { programId: program.id },
      relations: { localites: true },
      order: { sort: 'ASC' },
    })) as (Province & { localites: Localite[] })[];
    for (const p of provinces)
      p.localites = p.localites.filter((l) => l.active);
    const statuses = await this.registry.statusItems();
    return {
      provinces,
      cohorts: await this.lists.list(ProgramListType.COHORTE),
      statuses,
      defaultStatus: this.registry.defaultStatus(statuses),
    };
  }

  private async process(
    em: EntityManager,
    program: Program,
    ctx: ImportContext,
    mapped: MappedImport,
    user: AuthUser,
    dryRun: boolean,
    confirmDuplicate: boolean,
  ): Promise<ImportReport> {
    const pool: RegistryEntry[] = await this.registry.loadEntries(
      em,
      program.id,
    );
    const provinces = new Map(
      ctx.provinces.map((p) => [p.id, { code: p.code, name: p.name }]),
    );
    const lines: ImportLine[] = [];
    for (const { line, values } of mapped.rows) {
      const name = values.name ?? null;
      const resolved = this.resolve(values, ctx);
      if (typeof resolved === 'string') {
        lines.push({ line, name, outcome: 'REJETEE', reason: resolved });
        continue;
      }
      const entry: RegistryEntry = {
        id: null,
        code: null,
        name: resolved.name,
        normalizedName: normalizeFarmName(resolved.name),
        provinceId: resolved.province.id,
        localiteId: resolved.localite?.id ?? null,
        phone: resolved.exploitantPhone,
        exploitantName: resolved.exploitantName,
        latitude: resolved.gps?.latitude ?? null,
        longitude: resolved.gps?.longitude ?? null,
        amiRef: resolved.amiRef,
        line,
      };
      const existing = this.exactMatch(entry, pool);
      if (existing) {
        lines.push({
          line,
          name,
          outcome: 'DEJA_PRESENTE',
          farmId: existing.id,
          code: existing.code,
          ...(existing.id === null
            ? {
                reason: `Déjà présente plus haut dans le fichier (ligne ${existing.line}).`,
              }
            : {}),
        });
        continue;
      }
      if (resolved.amiRef && pool.some((p) => p.amiRef === resolved.amiRef)) {
        const holder = pool.find((p) => p.amiRef === resolved.amiRef)!;
        lines.push({
          line,
          name,
          outcome: 'REJETEE',
          reason: `La référence AMI « ${resolved.amiRef} » est déjà attribuée à ${holder.code ?? `la ligne ${holder.line}`} « ${holder.name} ».`,
        });
        continue;
      }
      const duplicates = this.registry.scoreAgainst(entry, pool, provinces);
      if (duplicates.length > 0 && !confirmDuplicate) {
        lines.push({
          line,
          name,
          outcome: 'REJETEE',
          reason: `Doublon probable de ${duplicates
            .map(
              (d) =>
                `${d.code ?? `la ligne ${d.line}`} « ${d.name} » (${d.reasons.join(', ')})`,
            )
            .join(
              ' ; ',
            )}. Relancez avec confirmDuplicate pour la créer quand même.`,
          duplicates,
        });
        continue;
      }
      if (dryRun) {
        pool.push(entry);
        lines.push({ line, name, outcome: 'A_CREER' });
        continue;
      }
      const farm = await this.registry.insertEntry(
        em,
        program,
        resolved,
        user.id,
        duplicates,
        resolved.gps ? 'Position importée' : null,
      );
      pool.push({ ...entry, id: farm.id, code: farm.code });
      lines.push({
        line,
        name,
        outcome: 'CREEE',
        farmId: farm.id,
        code: farm.code,
      });
    }
    const count = (...o: ImportOutcome[]) =>
      lines.filter((l) => o.includes(l.outcome)).length;
    return {
      dryRun,
      format: mapped.format,
      read: mapped.rows.length,
      created: count('CREEE', 'A_CREER'),
      matched: count('DEJA_PRESENTE'),
      rejected: count('REJETEE'),
      unknownColumns: mapped.unknownColumns,
      lines,
    };
  }

  /**
   * Idempotency key: the AMI reference when the row has one, else the
   * normalized name in the same province (with no conflicting AMI reference).
   */
  private exactMatch(
    entry: RegistryEntry,
    pool: readonly RegistryEntry[],
  ): RegistryEntry | null {
    const key = sameNameKey(entry.normalizedName);
    if (entry.amiRef) {
      const byAmi = pool.find((p) => p.amiRef === entry.amiRef);
      if (byAmi) {
        return byAmi.provinceId === entry.provinceId &&
          sameNameKey(byAmi.normalizedName) === key
          ? byAmi
          : null;
      }
    }
    return (
      pool.find(
        (p) =>
          p.provinceId === entry.provinceId &&
          sameNameKey(p.normalizedName) === key &&
          (!entry.amiRef || !p.amiRef || p.amiRef === entry.amiRef),
      ) ?? null
    );
  }

  /** Validated entry, or the French reason of the rejection. */
  private resolve(
    values: RawFarmRow,
    ctx: ImportContext,
  ): ResolvedEntry | string {
    const errors: string[] = [];
    const name = values.name?.trim();
    if (!name) errors.push('Nom manquant.');
    else if (name.length > 200)
      errors.push('Nom trop long (200 caractères au maximum).');
    let province: (Province & { localites: Localite[] }) | null = null;
    if (!values.province) errors.push('Province manquante.');
    else {
      province = matchByCodeOrName(values.province, ctx.provinces);
      if (!province) errors.push(`Province inconnue : « ${values.province} ».`);
    }
    let localite: Localite | null = null;
    if (values.localite && province) {
      localite = matchByCodeOrName(values.localite, province.localites);
      if (!localite) {
        errors.push(
          `Localité inconnue dans la province ${province.name} : « ${values.localite} ».`,
        );
      }
    }
    let phone: string | null = null;
    if (values.exploitantPhone) {
      phone = normalizePhone(values.exploitantPhone);
      if (!PHONE_PATTERN.test(phone)) {
        errors.push(`Téléphone invalide : « ${values.exploitantPhone} ».`);
      }
    }
    let cohort: string | null = null;
    if (values.cohort) {
      cohort = matchListItem(values.cohort, ctx.cohorts)?.code ?? null;
      if (!cohort) errors.push(`Cohorte inconnue : « ${values.cohort} ».`);
    }
    let status = ctx.defaultStatus;
    if (values.status) {
      const found = matchListItem(values.status, ctx.statuses);
      if (found) status = found;
      else errors.push(`Statut inconnu : « ${values.status} ».`);
    }
    const capacity = parseCount(values.capacityPlaces);
    if (Number.isNaN(capacity)) {
      errors.push(
        `Capacité invalide : « ${values.capacityPlaces} » (nombre entier de places attendu).`,
      );
    }
    const lat = parseDecimal(values.latitude);
    const lng = parseDecimal(values.longitude);
    if ((lat === undefined) !== (lng === undefined)) {
      errors.push(
        'Coordonnées GPS incomplètes : latitude et longitude vont ensemble.',
      );
    } else if (lat !== undefined && lng !== undefined) {
      if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        errors.push(`Latitude invalide : « ${values.latitude} ».`);
      }
      if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        errors.push(`Longitude invalide : « ${values.longitude} ».`);
      }
    }
    const amiRef = normalizeAmiRef(values.amiRef);
    if (amiRef && amiRef.length > 64) {
      errors.push('Référence AMI trop longue (64 caractères au maximum).');
    }
    if (errors.length > 0 || !province || !name) return errors.join(' ');
    return {
      name,
      province,
      localite,
      exploitantName: values.exploitantName?.trim().slice(0, 160) || null,
      exploitantPhone: phone,
      amiRef,
      cohort,
      capacityPlaces: capacity ?? null,
      status,
      gps:
        lat !== undefined && lng !== undefined
          ? {
              latitude: lat,
              longitude: lng,
              capturedAt: new Date(),
              source: GpsSource.IMPORT,
              accuracyM: null,
            }
          : null,
    };
  }
}
