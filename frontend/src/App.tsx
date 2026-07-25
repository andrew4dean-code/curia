import { useCallback, useEffect, useRef, useState } from 'react';
import './styles/app.css';
import { ApiError, cachedSnapshot, clearPasscode, fetchSnapshot, getPasscode, refreshMarks } from './lib/api';
import type { Snapshot } from './lib/api';
import type { OptionPosition, Trade } from './lib/types';
import { PasscodeGate } from './components/PasscodeGate';
import { TabBar } from './components/TabBar';
import type { TabId } from './components/TabBar';
import { OfflineBanner } from './components/OfflineBanner';
import { PortfolioTab } from './components/PortfolioTab';
import { OptionsTab } from './components/OptionsTab';
import { LedgerTab } from './components/LedgerTab';
import { SettingsTab } from './components/SettingsTab';
import { AddTradeSheet } from './components/AddTradeSheet';
import { OptionSellSheet } from './components/OptionSellSheet';
import { MarkSheet } from './components/MarkSheet';
import { SettleSheet } from './components/SettleSheet';
import { OptionRecordSheet } from './components/OptionRecordSheet';
import { TradeCeremony } from './components/TradeCeremony';
import type { TicketData } from './components/TradeCeremony';

type Sheet =
  | { kind: 'trade'; trade: Trade | null }
  | { kind: 'optionEdit'; option: OptionPosition }
  | { kind: 'sellOption'; expiration: string }
  | { kind: 'mark'; symbol: string }
  | { kind: 'settle'; option: OptionPosition }
  | { kind: 'record'; option: OptionPosition }
  | null;

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(() => (getPasscode() ? cachedSnapshot() : null));
  const [unlocked, setUnlocked] = useState(() => !!getPasscode());
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState<TabId>('portfolio');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [ceremony, setCeremony] = useState<TicketData | null>(null);
  const [justAdded, setJustAdded] = useState<{ kind: 'trade' | 'option'; id: number; symbol: string } | null>(null);
  const [landing, setLanding] = useState(false);
  const landingTimer = useRef<number | null>(null);

  const clearLandingTimer = useCallback(() => {
    if (landingTimer.current !== null) {
      window.clearTimeout(landingTimer.current);
      landingTimer.current = null;
    }
  }, []);

  useEffect(() => clearLandingTimer, [clearLandingTimer]);

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
    onSellWeek: (expiration: string) => setSheet({ kind: 'sellOption', expiration }),
    onViewRecord: (option: OptionPosition) => setSheet({ kind: 'record', option }),
    justAdded,
  };

  const onTicket = async (ticket: TicketData) => {
    setSheet(null);
    setJustAdded({ kind: ticket.title === 'OPTION TICKET' ? 'option' : 'trade', id: ticket.no, symbol: ticket.symbol });
    // A new ceremony is starting: any pending landing-reset timer from a prior
    // ceremony is now stale (it would clear this ceremony's landing/justAdded
    // mid-animation), so drop it and start the new landing clean.
    clearLandingTimer();
    setLanding(false);
    setCeremony(ticket);
  };
  const onDeleted = async () => { setSheet(null); await refresh(); };

  return (
    <div className={landing ? 'shell roll-slow' : 'shell'}>
      {offline && <OfflineBanner fetchedAt={snap.fetchedAt} />}
      <div className="tab-fade" key={tab}>
        {tab === 'portfolio' && <PortfolioTab {...tabProps} />}
        {tab === 'options' && <OptionsTab {...tabProps} />}
        {tab === 'ledger' && <LedgerTab {...tabProps} />}
        {tab === 'settings' && <SettingsTab {...tabProps} />}
      </div>
      {!offline && (tab === 'portfolio' || tab === 'ledger') && (
        <button className="fab" aria-label="Add trade" onClick={() => setSheet({ kind: 'trade', trade: null })}>
          +
        </button>
      )}
      {sheet?.kind === 'trade' && (
        <AddTradeSheet trade={sheet.trade} onDone={onTicket} onDeleted={onDeleted} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'optionEdit' && (
        <OptionSellSheet option={sheet.option} expiration={sheet.option.expiration} onDone={onTicket} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'record' && (
        <OptionRecordSheet option={sheet.option} onDone={async () => { setSheet(null); await refresh(); }} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'sellOption' && (
        <OptionSellSheet expiration={sheet.expiration} onDone={onTicket} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'mark' && (
        <MarkSheet symbol={sheet.symbol} onDone={async () => { setSheet(null); await refresh(); }} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'settle' && (
        <SettleSheet option={sheet.option} onDone={async () => { setSheet(null); await refresh(); }} onEdit={() => setSheet({ kind: 'optionEdit', option: sheet.option })} onCancel={() => setSheet(null)} />
      )}
      {ceremony && (
        <TradeCeremony
          ticket={ceremony}
          onDone={() => {
            setCeremony(null);
            setLanding(true);
            void refresh().then(() => {
              landingTimer.current = window.setTimeout(() => {
                landingTimer.current = null;
                setLanding(false);
                setJustAdded(null);
              }, 3000);
            });
          }}
        />
      )}
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
