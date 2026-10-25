const FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"],
  [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"],
];
const UNICODE: Record<string, number> = Object.fromEntries(FRACTIONS.map(([v, s]) => [s, v]));

/** 1.5 -> "1½", 0.333 -> "⅓", 2.4 -> "2.4" */
export function formatQuantity(q: number | null | undefined): string {
  if (q === null || q === undefined) return "";
  const whole = Math.floor(q + 1e-9);
  const frac = q - whole;
  if (frac < 0.02) return String(whole);
  if (frac > 0.98) return String(whole + 1);
  const match = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.02);
  if (match) return whole ? `${whole}${match[1]}` : match[1];
  return String(Math.round(q * 100) / 100);
}

/** "1 1/2", "1½", "½", "1.5", "3" -> number; "" -> null; garbage -> NaN */
export function parseQuantity(input: string): number | null {
  let s = input.trim();
  if (!s) return null;
  let total = 0;
  for (const [ch, v] of Object.entries(UNICODE)) {
    if (s.includes(ch)) {
      total += v;
      s = s.replace(ch, " ");
    }
  }
  for (const part of s.trim().split(/\s+/).filter(Boolean)) {
    if (part.includes("/")) {
      const [n, d] = part.split("/").map(Number);
      if (!d || Number.isNaN(n)) return NaN;
      total += n / d;
    } else {
      const n = Number(part);
      if (Number.isNaN(n)) return NaN;
      total += n;
    }
  }
  return total;
}

const PLURAL_UNITS = new Set(["cup", "pint", "quart", "gallon", "pinch", "dash", "clove", "can", "jar",
  "package", "stick", "slice", "piece", "bunch", "sprig", "head", "stalk", "handful", "sheet", "fillet"]);

export function formatUnit(unit: string | null, quantity: number | null): string {
  if (!unit) return "";
  if (quantity !== null && quantity > 1 && PLURAL_UNITS.has(unit)) {
    return /(ch|sh|s)$/.test(unit) ? `${unit}es` : `${unit}s`;
  }
  return unit;
}

export function formatMinutes(m: number | null | undefined): string {
  if (!m) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
