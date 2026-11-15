import { parse } from "csv-parse/sync";

export type CatalogCsvRow = {
  externalKey: string;
  name: string;
  unit: string;
  amount: string;
  rowNumber: number;
};

const MAX_ROWS = 50_000;
const MAX_ERRORS = 20;
const headerAliases = {
  externalKey: ["external_key", "sku", "ean", "gtin", "barcode", "codigo", "codigo_produto", "codigobarras"],
  name: ["name", "nome", "descricao", "produto", "descricao_produto"],
  unit: ["unit", "unidade", "un", "medida"],
  amount: ["price", "preco", "valor", "preco_atual", "preco_venda"],
} as const;

function countUnquoted(value: string, needle: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === needle) {
      count += 1;
    }
  }
  return count;
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function mapHeaders(headers: string[]): Record<keyof typeof headerAliases, number> {
  const normalized = headers.map(normalizeHeader);
  const result = {} as Record<keyof typeof headerAliases, number>;
  const errors: string[] = [];

  for (const [field, aliases] of Object.entries(headerAliases) as [keyof typeof headerAliases, readonly string[]][]) {
    const candidates = normalized
      .map((header, index) => aliases.includes(header) ? index : -1)
      .filter((index) => index >= 0);

    if (candidates.length !== 1) {
      errors.push(candidates.length === 0
        ? `Coluna obrigatória ausente: ${field}.`
        : `Mais de uma coluna corresponde ao campo: ${field}.`);
    } else {
      result[field] = candidates[0]!;
    }
  }

  if (errors.length) {
    throw new CsvValidationError(errors);
  }
  return result;
}

function normalizeAmount(rawValue: string, delimiter: string): string | null {
  let value = rawValue.trim().replace(/\bBRL\b/gi, "").replace(/R\$/gi, "").replace(/\s/g, "");
  if (delimiter === ";" && value.includes(",")) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (value.includes(",") && value.includes(".")) {
    value = value.lastIndexOf(",") > value.lastIndexOf(".")
      ? value.replace(/\./g, "").replace(",", ".")
      : value.replace(/,/g, "");
  } else if (value.includes(",")) {
    value = value.replace(",", ".");
  }

  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)) {
    return null;
  }
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export class CsvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super("O CSV contém dados inválidos.");
    this.name = "CsvValidationError";
  }
}

export function parseCatalogCsv(content: string): CatalogCsvRow[] {
  if (!content.trim()) {
    throw new CsvValidationError(["O arquivo CSV está vazio."]);
  }

  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = countUnquoted(firstLine, ";") > countUnquoted(firstLine, ",") ? ";" : ",";

  let parsedRows: string[][];
  try {
    parsedRows = parse(content, {
      bom: true,
      delimiter,
      max_record_size: 16_384,
      relax_column_count: false,
      skip_empty_lines: true,
      trim: true,
    }) as string[][];
  } catch {
    throw new CsvValidationError(["Não foi possível interpretar o CSV. Verifique o separador, as aspas e o número de colunas."]);
  }

  const [headers, ...records] = parsedRows;
  if (!headers?.length || records.length === 0) {
    throw new CsvValidationError(["O CSV precisa ter uma linha de cabeçalho e ao menos um produto."]);
  }
  if (records.length > MAX_ROWS) {
    throw new CsvValidationError([`O limite do piloto é ${MAX_ROWS.toLocaleString("pt-BR")} produtos por importação.`]);
  }

  const columns = mapHeaders(headers);
  const seenKeys = new Set<string>();
  const issues: string[] = [];
  const rows: CatalogCsvRow[] = [];

  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const externalKey = record[columns.externalKey]?.trim() ?? "";
    const name = record[columns.name]?.trim() ?? "";
    const unit = record[columns.unit]?.trim().toUpperCase() ?? "";
    const amount = normalizeAmount(record[columns.amount] ?? "", delimiter);

    const isDuplicate = Boolean(externalKey && seenKeys.has(externalKey));
    if (!externalKey || externalKey.length > 128) {
      issues.push(`Linha ${rowNumber}: código do produto vazio ou maior que 128 caracteres.`);
    } else if (isDuplicate) {
      issues.push(`Linha ${rowNumber}: código duplicado no mesmo arquivo (${externalKey}).`);
    } else {
      seenKeys.add(externalKey);
    }

    if (!name || name.length > 500) {
      issues.push(`Linha ${rowNumber}: nome vazio ou maior que 500 caracteres.`);
    }
    if (!unit || unit.length > 16) {
      issues.push(`Linha ${rowNumber}: unidade vazia ou maior que 16 caracteres.`);
    }
    if (amount === null) {
      issues.push(`Linha ${rowNumber}: preço inválido. Use no máximo duas casas decimais e não informe valores negativos.`);
    }

    if (externalKey && !isDuplicate && name && unit && amount !== null) {
      rows.push({ externalKey, name, unit, amount, rowNumber });
    }
    if (issues.length >= MAX_ERRORS) {
      return;
    }
  });

  if (issues.length) {
    throw new CsvValidationError(issues.slice(0, MAX_ERRORS));
  }
  return rows;
}
