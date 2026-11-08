// Minimal ambient typing for the one Node API the unit tests use (@types/node is not installed).
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}
