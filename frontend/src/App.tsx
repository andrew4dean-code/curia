import { useCallback, useEffect, useState } from 'react';
import './styles/app.css';
import { cachedSnapshot, fetchSnapshot, getPasscode, refreshMarks } from './lib/api';
import type { Snapshot } from './lib/api';
import type { Trade } from './lib/types';
import { PasscodeGate } from './components/PasscodeGate';
import { TabBar } from './components/TabBar';
import type { TabId } from './components/TabBar';
import { OfflineBanner } from './components/OfflineBanner';
import { PortfolioTab } from './components/PortfolioTab';
import { LedgerTab } from './components/LedgerTab';
import { AddTradeSheet } from './components/AddTradeSheet';
import { MarkSheet } from './components/MarkSheet';

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(() => (getPasscode() ? cachedSnapshot() : null));
  const [unlocked, setUnlocked] = useState(() => !!getPasscode());
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState<TabId>('portfolio');
  const [sheet, setSheet] = useState<{ kind: 'trade'; trade: Trade | null } | { kind: 'mark'; symbol: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      // best-effort quote pull first, so the snapshot below carries fresh auto-marks;
      // a Stooq outage or offline phone must never block the snapshot itself
      await refreshMarks().catch(() => undefined);
      setSnap(await fetchSnapshot());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    if (unlocked) void refresh();
  }, [unlocked, refresh]);

  if (!unlocked) {
    return (
      <PasscodeGate
        onUnlocked={(s) => {
          setSnap(s);
          setUnlocked(true);
        }}
      />
    );
  }
  if (!snap) return <div className="empty">Loading…</div>;

  const tabProps = {
    snap,
    onRefresh: refresh,
    onEditTrade: (trade: Trade | null) => setSheet({ kind: 'trade', trade }),
    onMark: (symbol: string) => setSheet({ kind: 'mark', symbol }),
  };

  return (
    <div className="shell">
      {offline && <OfflineBanner fetchedAt={snap.fetchedAt} />}
      {tab === 'portfolio' ? <PortfolioTab {...tabProps} /> : <LedgerTab {...tabProps} />}
      {!offline && (
        <button className="fab" aria-label="Add trade" onClick={() => setSheet({ kind: 'trade', trade: null })}>
          +
        </button>
      )}
      {sheet?.kind === 'trade' && (
        <AddTradeSheet trade={sheet.trade} onDone={async () => { setSheet(null); await refresh(); }} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'mark' && (
        <MarkSheet symbol={sheet.symbol} onDone={async () => { setSheet(null); await refresh(); }} onCancel={() => setSheet(null)} />
      )}
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
