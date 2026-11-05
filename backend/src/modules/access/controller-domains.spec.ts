import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ACCESS_ACTIONS, isAccessDomain } from './access-domains.js';

/**
 * Default deny depends on every controller declaring its domain: an
 * institutional account is refused on a controller without `@Domain`, but a
 * forgotten domain on a new farm controller would also silently stay closed
 * (or, worse, be added in a hurry with the wrong one). This scan of the
 * sources fails as soon as a `@Controller(` class lacks a class-level
 * `@Domain(...)`, or uses an unknown domain or action.
 */
const SRC = join(process.cwd(), 'src');

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** Decorator lines stacked right above each `@Controller(` up to its class. */
function controllerBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /@Controller\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const classAt = source.indexOf('export class', m.index);
    // Walk back over the decorator stack (lines starting with `@` or
    // continuation lines of a multi-line decorator).
    const before = source.slice(0, m.index);
    const prevClassEnd = Math.max(
      before.lastIndexOf('\n}'),
      before.lastIndexOf(';\n'),
    );
    blocks.push(source.slice(prevClassEnd + 1, classAt));
  }
  return blocks;
}

describe('every controller declares an access domain', () => {
  const files = controllerFiles(SRC).filter((f) =>
    readFileSync(f, 'utf8').includes('@Controller('),
  );

  it('finds the controllers', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it.each(files.map((f) => [relative(SRC, f), f]))(
    '%s has @Domain on each @Controller class',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      for (const block of controllerBlocks(source)) {
        const domain = /@Domain\('([A-Z_]+)'\)/.exec(block);
        expect(domain, block).not.toBeNull();
        expect(isAccessDomain(domain?.[1])).toBe(true);
      }
    },
  );

  it('uses only known domains and actions on routes', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const [, d] of source.matchAll(/@Domain\('([A-Z_]+)'\)/g)) {
        expect(isAccessDomain(d), `${file}: ${d}`).toBe(true);
      }
      for (const [, a] of source.matchAll(/@Action\('([A-Z_]+)'\)/g)) {
        expect(
          (ACCESS_ACTIONS as readonly string[]).includes(a),
          `${file}: ${a}`,
        ).toBe(true);
      }
    }
  });
});
