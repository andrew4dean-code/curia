/** Tap a symbol you have used before instead of typing it again.
 *
 *  Lives beside every symbol field rather than inside one, because the three sheets that
 *  ask for a symbol each own their own input and their own state; this only ever hands a
 *  string back. The row disappears entirely when there is nothing to offer — an empty
 *  strip of chrome under a field is worse than no strip.
 */
export function SymbolChips({
  symbols,
  active,
  onPick,
  idPrefix,
}: {
  symbols: string[];
  /** The symbol currently in the field, so the chip matching it reads as chosen. */
  active?: string;
  onPick: (symbol: string) => void;
  idPrefix: string;
}) {
  if (symbols.length === 0) return null;
  const current = (active ?? '').trim().toUpperCase();
  return (
    <div className="symbol-chips" data-testid={`${idPrefix}-symbol-chips`}>
      {symbols.map((s) => (
        <button
          key={s}
          type="button"
          className={`symbol-chip${s === current ? ' on' : ''}`}
          aria-pressed={s === current}
          onClick={() => onPick(s)}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
