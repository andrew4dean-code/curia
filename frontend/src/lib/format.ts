/** Exported so the Odometer can rebuild a figure mid-count through the very same
 *  formatter it will land on — no hand-rolled comma logic, no drift at t=1. */
export const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Plain currency, no sign forcing. e.g. 12500.5 -> "$12,500.50" */
export function formatMoney(value: number): string {
  return usd.format(value);
}

/** Signed P&L money. Uses real minus (−) / plus (+); ± for exact zero. */
export function formatSignedMoney(value: number): string {
  const abs = usd.format(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return `±${abs}`;
}

/** Whole-number percent with % suffix and sign. e.g. 12.5 -> "+12.5%" */
export function formatSignedPct(value: number): string {
  const abs = `${Math.abs(value).toFixed(1)}%`;
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return `±${abs}`;
}

/** Plain whole-number percent with % suffix, no sign. e.g. 66.7 -> "66.7%" */
export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** P&L semantic CSS variable name for color. */
export function plColor(value: number): string {
  if (value > 0) return 'var(--pl-up)';
  if (value < 0) return 'var(--pl-down)';
  return 'var(--pl-flat)';
}
