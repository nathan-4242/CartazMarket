export const units = ["KG", "UNIDADE", "CADA", "LITRO", "GRAMA", "PACOTE", "CAIXA", "FARDO"] as const;
export type Unit = (typeof units)[number];

export function parsePrice(input: string) {
  const value = input.trim().replace(/^R\$\s*/, "");
  const match = /^(\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(value);
  if (!match?.[1]) return null;

  const digits = match[1].replace(/\./g, "").replace(/^0+(?=\d)/, "");
  if (digits.length > 12) return null;
  return {
    symbol: "R$",
    whole: digits.replace(/\B(?=(\d{3})+(?!\d))/g, "."),
    cents: (match[2] ?? "").padEnd(2, "0"),
  };
}

export function priceLayout(whole: string, unit: Unit, scale = 1) {
  const desired = 114 * scale;
  const relativeWidth = whole.length * 0.67 + 1.64;
  const size = Math.min(desired, 336 / relativeWidth);
  const symbolWidth = size * 0.65;
  const wholeWidth = whole.length * size * 0.67;
  const sideWidth = size * 0.99;
  const unitSize = Math.min(size * 0.22, sideWidth / (unit.length * 0.76));

  return {
    size, symbolWidth, wholeWidth, sideWidth, unitSize,
    width: symbolWidth + wholeWidth + sideWidth,
  };
}
