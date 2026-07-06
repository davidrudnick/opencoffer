export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

export function escapeCsvField(value: string | number | boolean | null | undefined) {
  if (value == null) return "";
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function parseCsv(input: string): ParsedCsv {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(stripTrailingCr(field));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || record.length > 0) {
    record.push(stripTrailingCr(field));
    records.push(record);
  }

  const nonEmptyRecords = records.filter((r) => r.some((cell) => cell.length > 0));
  const [headers = [], ...rows] = nonEmptyRecords;
  return { headers, rows };
}

function stripTrailingCr(value: string) {
  return value.endsWith("\r") ? value.slice(0, -1) : value;
}
