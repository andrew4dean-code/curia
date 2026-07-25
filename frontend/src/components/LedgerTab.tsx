import { useState } from 'react';
import { deleteTrade } from '../lib/api';
import type { TabProps } from './PortfolioTab';
import { computeClosedTrades } from '../lib/fifo';
import { computeStats } from '../lib/stats';
import { computeOptionStats, optionRealizedPl } from '../lib/optionsMath';
import { formatMoney, formatPct, formatSignedMoney, formatSignedPct, plColor } from '../lib/format';

export function LedgerTab({ snap, onEditTrade, onRefresh, onViewRecord }: TabProps) {
  const [showEntries, setShowEntries] = useState(false);
  const closed = computeClosedTrades(snap.trades);
  const stats = computeStats(closed);
  const settledOptions = [...snap.options]
    .filter((o) => o.status !== 'OPEN')
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? '') || b.id - a.id);
  const oStats = computeOptionStats(snap.options);

  return (
    <div>
      <h2 className="section-title">Closed trades</h2>
      {closed.length === 0 && <div className="empty">No closed trades yet — your first sell will write history.</div>}
      {[...closed].reverse().map((t, i) => (
        <div className="row" key={`${t.symbol}-${t.closedAt}-${i}`}>
          <div className="row-main">
            <div className="row-sym">{t.symbol}</div>
            <div className="row-sub">
              {t.qty} sh · {formatMoney(t.buyPrice)} → {formatMoney(t.sellPrice)} · {t.openedAt} → {t.closedAt}
            </div>
          </div>
          <div className="row-right">
            <div style={{ color: plColor(t.realizedPl) }}>{formatSignedMoney(t.realizedPl)}</div>
            <div className="row-pl" style={{ color: plColor(t.realizedPl) }}>{formatSignedPct(t.realizedPlPct)}</div>
          </div>
        </div>
      ))}

      {stats.closedCount > 0 && (
        <>
          <h2 className="section-title">The record</h2>
          <div className="stats-grid">
            <div className="stat"><div className="label">Win rate</div><div className="value">{formatPct(stats.winRate)}</div></div>
            <div className="stat"><div className="label">Realized P/L</div><div className="value" style={{ color: plColor(stats.totalRealizedPl) }}>{formatSignedMoney(stats.totalRealizedPl)}</div></div>
            <div className="stat"><div className="label">Avg win</div><div className="value">{formatSignedMoney(stats.avgWin)}</div></div>
            <div className="stat"><div className="label">Avg loss</div><div className="value">{formatSignedMoney(stats.avgLoss)}</div></div>
            <div className="stat"><div className="label">Expectancy</div><div className="value" style={{ color: plColor(stats.expectancy) }}>{formatSignedMoney(stats.expectancy)}</div></div>
            <div className="stat"><div className="label">Closed</div><div className="value">{stats.wins}W · {stats.losses}L</div></div>
          </div>
        </>
      )}

      {settledOptions.length > 0 && (
        <>
          <h2 className="section-title">Premium Record</h2>
          {settledOptions.map((o) => (
            <button type="button" className="row row-tap" key={`opt-${o.id}`} onClick={() => onViewRecord?.(o)}>
              <div className="row-main">
                <div className="row-sym">
                  {o.symbol} ${o.strike} {o.opt_type}{' '}
                  <span className="chip">{o.status.replace('_', ' ')}</span>
                </div>
                <div className="row-sub">
                  {o.contracts}x · {o.opened_at} → {o.closed_at}
                  {o.status === 'ASSIGNED' ? ' · shares booked' : ''}
                </div>
              </div>
              <div className="row-right">
                <div style={{ color: plColor(optionRealizedPl(o) ?? 0) }}>
                  {formatSignedMoney(optionRealizedPl(o) ?? 0)}
                </div>
              </div>
            </button>
          ))}
          <div className="stats-grid">
            <div className="stat"><div className="label">Premium kept</div><div className="value" style={{ color: plColor(oStats.totalKept) }}>{formatSignedMoney(oStats.totalKept)}</div></div>
            <div className="stat"><div className="label">Win rate</div><div className="value">{formatPct(oStats.winRate)}</div></div>
            <div className="stat"><div className="label">Outcomes</div><div className="value">{oStats.expiredCount}E · {oStats.boughtBackCount}B · {oStats.assignedCount}A</div></div>
            <div className="stat"><div className="label">Avg take</div><div className="value">{formatSignedMoney(oStats.avgTake)}</div></div>
          </div>
        </>
      )}

      <div className="link-row">
        <button onClick={() => setShowEntries(!showEntries)}>
          {showEntries ? 'Hide entries' : `All entries (${snap.trades.length})`}
        </button>
      </div>

      {showEntries && (
        <>
          {[...snap.trades].sort((a, b) => b.executed_at.localeCompare(a.executed_at) || b.id - a.id).map((t) => (
            <div className="row" key={t.id}>
              <div className="row-main">
                <div className="row-sym">{t.symbol} <span style={{ color: t.side === 'BUY' ? 'var(--pl-up)' : 'var(--maroon)', fontSize: 12 }}>{t.side}</span></div>
                <div className="row-sub">{t.qty} sh @ {formatMoney(t.price)} · {t.executed_at}{t.note ? ` · ${t.note}` : ''}</div>
              </div>
              <div className="row-right">
                <button className="row-action" onClick={() => onEditTrade(t)}>
                  edit
                </button>
                <button
                  className="row-action"
                  onClick={() => {
                    if (window.confirm(`Delete this ${t.symbol} ${t.side.toLowerCase()}? This can't be undone.`)) {
                      void deleteTrade(t.id).then(() => onRefresh());
                    }
                  }}
                >
                  delete
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
