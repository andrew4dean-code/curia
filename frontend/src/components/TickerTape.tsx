export interface TickerItem {
  symbol: string;
  price: number;
  up: boolean;
}

/** How many entries one half of the tape must carry before it is wider than the screen.
 *
 *  `ticker-scroll` translates the track by -50%, which is only seamless while ONE half
 *  already fills the container: the second half is what slides in behind the first. With
 *  one or two priced holdings a half was ~110-220px against a 375-640px tape, so the
 *  track crept left leaving a widening black band, reached two thirds empty, and snapped
 *  back in a single frame. Six entries clear 640px, the widest the shell ever gets. */
const MIN_PER_HALF = 6;

export function TickerTape({ items }: { items: TickerItem[] }) {
  const reps = items.length ? Math.ceil(MIN_PER_HALF / items.length) : 1;
  const half = Array.from({ length: reps }, () => items).flat();
  const doubled = [...half, ...half];
  return (
    <div className="ticker">
      <div className="ticker-track">
        {doubled.map((it, i) => (
          <span className="tk" key={i}>
            {it.symbol} <b>{it.price.toFixed(2)}</b>{' '}
            <span className={it.up ? 'up' : 'dn'}>{it.up ? '▲' : '▼'}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
