export interface TickerItem {
  symbol: string;
  price: number;
  up: boolean;
}

export function TickerTape({ items }: { items: TickerItem[] }) {
  const doubled = [...items, ...items];
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
