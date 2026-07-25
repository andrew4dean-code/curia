import { useCallback, useEffect, useState } from 'react';
import './styles/app.css';
import { ApiError, cachedSnapshot, clearPasscode, fetchSnapshot, getPasscode, refreshMarks } from './lib/api';
import type { Snapshot } from './lib/api';
import type { OptionPosition, Trade } from './lib/types';
import { PasscodeGate } from './components/PasscodeGate';
import { TabBar } from './components/TabBar';
import type { TabId } from './components/TabBar';
import { OfflineBanner } from './components/OfflineBanner';
import { PortfolioTab } from './components/PortfolioTab';
import { LedgerTab } from './components/LedgerTab';
import { AddTradeSheet } from './components/AddTradeSheet';
import { MarkSheet } from './components/MarkSheet';
import { SettleSheet } from './components/SettleSheet';

type Sheet =
  | { kind: 'trade'; trade: Trade | null }
  | { kind: 'optionEdit'; option: OptionPosition }
  | { kind: 'mark'; symbol: string }
  | { kind: 'settle'; option: OptionPosition }
  | null;

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(() => (getPasscode() ? cachedSnapshot() : null));
  const [unlocked, setUnlocked] = useState(() => !!getPasscode());
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState<TabId>('portfolio');
  const [sheet, setSheet] = useState<Sheet>(null);

  const refresh = useCallback(async () => {
    try {
      // best-effort quote pull first, so the snapshot below carries fresh auto-marks;
      // a Stooq outage or offline phone must never block the snapshot itself
      await refreshMarks().catch(() => undefined);
      setSnap(await fetchSnapshot());
      setOffline(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearPasscode();
        setUnlocked(false);
      } else {
        setOffline(true);
      }
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
    onSettleOption: (option: OptionPosition) => setSheet({ kind: 'settle', option }),
    onEditOption: (option: OptionPosition) => setSheet({ kind: 'optionEdit', option }),
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
      {sheet?.kind === 'optionEdit' && (
        <AddTradeSheet trade={null} option={sheet.option} onDone={async () => { setSheet(null); await refresh(); }} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'mark' && (
        <MarkSheet symbol={sheet.symbol} onDone={async () => { setSheet(null); await refresh(); }} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'settle' && (
        <SettleSheet option={sheet.option} onDone={async () => { setSheet(null); await refresh(); }} onEdit={() => setSheet({ kind: 'optionEdit', option: sheet.option })} onCancel={() => setSheet(null)} />
      )}
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
