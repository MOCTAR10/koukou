/**
 * Minimal RFC 4180 CSV reader (no dependency): quoted fields, doubled quotes,
 * delimiters and line breaks inside quotes, CRLF/LF, UTF-8 BOM. The delimiter
 * (`,` or `;`, the French Excel default) is taken from the header line.
 */

export class CsvError extends Error {}

/** `,` or `;`, whichever appears more often outside quotes on the first line. */
export function detectDelimiter(text: string): ',' | ';' {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch === ',') commas++;
    else if (!quoted && ch === ';') semicolons++;
  }
  return semicolons > commas ? ';' : ',';
}

/**
 * Rows of `text`, each a list of raw cells (not trimmed). Blank lines are
 * dropped. @throws CsvError on an unterminated quoted field.
 */
export function parseCsv(
  text: string,
  delimiter: ',' | ';' = detectDelimiter(text),
): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const endRow = () => {
    row.push(cell);
    cell = '';
    if (!row.every((c) => c.trim() === '')) rows.push(row);
    row = [];
  };
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
      i++;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
      i++;
    } else if (ch === '\r' || ch === '\n') {
      endRow();
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1;
    } else {
      cell += ch;
      i++;
    }
  }
  if (quoted) {
    throw new CsvError('Fichier CSV invalide : guillemet non fermé.');
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}
