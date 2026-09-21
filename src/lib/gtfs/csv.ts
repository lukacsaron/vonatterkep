/**
 * RFC 4180 CSV -> array of objects keyed by the header row. Handles quoted
 * fields, embedded commas and newlines, doubled quotes and a UTF-8 BOM, which
 * is everything GTFS text files use.
 */
export function parseCsv(input: string): Record<string, string>[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map(h => h.trim());
  return body
    .filter(r => r.some(cell => cell !== ''))
    .map(r => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}
