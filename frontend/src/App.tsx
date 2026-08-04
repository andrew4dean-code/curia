import { useCallback, useEffect, useRef, useState } from 'react';
import './styles/app.css';
import { ApiError, cachedSnapshot, clearPasscode, fetchSnapshot, getPasscode, markQuietWeek, clearQuietWeek } from './lib/api';
import { pullQuotes } from './lib/quotePull';
import type { Snapshot } from './lib/api';
import type { OpenPosition, OptionPosition, Side, Trade, Wheel, WheelSummary } from './lib/types';
import { PasscodeGate } from './components/PasscodeGate';
import { TabBar } from './components/TabBar';
import type { TabId } from './components/TabBar';
import { OfflineBanner } from './components/OfflineBanner';
import { PortfolioTab } from './components/PortfolioTab';
import { OptionsTab } from './components/OptionsTab';
import { LedgerTab } from './components/LedgerTab';
import { SettingsTab } from './components/SettingsTab';
import { AddTradeSheet } from './components/AddTradeSheet';
import { PositionSheet } from './components/PositionSheet';
import { OptionSellSheet } from './components/OptionSellSheet';
import { MarkSheet } from './components/MarkSheet';
import { SettleSheet } from './components/SettleSheet';
import { OptionRecordSheet } from './components/OptionRecordSheet';
import { CompleteWheelSheet, FreshWheelSheet, WheelRecordSheet } from './components/WheelSheets';
import { WheelCeremony } from './components/WheelCeremony';
import type { WheelCeremonyData } from './components/WheelCeremony';
import { SettleCeremony } from './components/SettleCeremony';
import type { SettleData } from './components/SettleCeremony';
import { summarizeWheel } from './lib/wheelMath';
import { computeOpenPositions } from './lib/positions';
import { recentSymbols } from './lib/symbols';
import { matchOpenOption } from './lib/parseConfirmation';
import type { ParsedConfirmation } from './lib/parseConfirmation';
import { PasteSheet } from './components/PasteSheet';
import { deleteWheel } from './lib/api';
import { TradeCeremony } from './components/TradeCeremony';
import type { TicketData } from './components/TradeCeremony';

type Sheet =
  | { kind: 'trade'; trade: Trade | null; prefill?: { side: Side; symbol: string; qty: number } }
  | { kind: 'position'; position: OpenPosition }
  | { kind: 'optionEdit'; option: OptionPosition }
  | { kind: 'sellOption'; expiration: string; prefill?: ParsedConfirmation | null }
  | { kind: 'paste'; problem?: string }
  | { kind: 'mark'; symbol: string }
  | { kind: 'settle'; option: OptionPosition; buyback?: number }
  | { kind: 'record'; option: OptionPosition }
  | { kind: 'freshWheel' }
  | { kind: 'completeWheel'; summary: WheelSummary }
  | { kind: 'wheelRecord'; wheel: Wheel }
  | null;

/** How long .roll-slow stays on the shell after a ceremony, winding every odometer out
 *  before the justAdded highlight clears. It has to outlast the slowest count it wraps:
 *  the hero figure at DURATION_MS.hero x --roll-scale (2200 x 1.8 = 3960ms), or the
 *  highlight drops while the number is still turning. Raise the count and raise this.
 *  A test asserts the relationship, so this cannot drift silently again. */
export const LANDING_MS = 4200;

/** Every wheel's current stage, keyed by wheel id. Compared either side of a ceremony's
 *  refresh to answer one question: did what I just booked move a wheel along? */
export function wheelStages(snap: Snapshot | null): Map<number, string> {
  const stages = new Map<number, string>();
  if (!snap) return stages;
  for (const w of snap.wheels) {
    if (w.closed_at) continue;
    stages.set(w.id, summarizeWheel(w, snap.trades, snap.options, snap.marks).stage);
  }
  return stages;
}

/** What the BOOKING you just made can move: what you hold, what it cost, and where every
 *  wheel stands. Compared either side of the ceremony's refresh to decide whether to land
 *  you on the Portfolio to watch it.
 *
 *  The landing used to switch tabs only when a WHEEL moved, which read "nothing changed" as
 *  "no wheel changed" — so a plain stock buy, which always moves the book value, played its
 *  whole ceremony and then left you on the board that cannot show you the figure it changed.
 *
 *  Deliberately blind to MARKS. Folding live prices in meant any quote landing mid-ceremony
 *  counted as "this booking changed something": refresh() kicks off a background pull, a
 *  ceremony runs for seconds, and a note-only edit that moved nothing could still throw you
 *  off the board because a price ticked while the envelope was closing. Quantities and cost
 *  basis only move when you book something, which is exactly the question being asked. */
export function portfolioFigures(snap: Snapshot | null): string {
  if (!snap) return '';
  const positions = computeOpenPositions(snap.trades, snap.marks);
  const held = positions.map((p) => `${p.symbol}:${p.qty}@${p.avgCost.toFixed(4)}`).join(',');
  const stages = [...wheelStages(snap)].map(([id, st]) => `${id}:${st}`).sort().join(',');
  return `${held}|${stages}`;
}

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(() => (getPasscode() ? cachedSnapshot() : null));
  const [unlocked, setUnlocked] = useState(() => !!getPasscode());
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState<TabId>('portfolio');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [ceremony, setCeremony] = useState<TicketData | null>(null);
  const [wheelCeremony, setWheelCeremony] = useState<WheelCeremonyData | null>(null);
  const [settleCeremony, setSettleCeremony] = useState<SettleData | null>(null);
  const [justAdded, setJustAdded] = useState<{ kind: 'trade' | 'option'; id: number; symbol: string } | null>(null);
  const [strikingTradeId, setStrikingTradeId] = useState<number | null>(null);
  const [strikingOptionId, setStrikingOptionId] = useState<number | null>(null);
  const [landing, setLanding] = useState(false);
  const [cover, setCover] = useState(false);
  const landingTimer = useRef<number | null>(null);
  const strikeTimer = useRef<number | null>(null);
  const coverTimer = useRef<number | null>(null);

  const clearLandingTimer = useCallback(() => {
    if (landingTimer.current !== null) {
      window.clearTimeout(landingTimer.current);
      landingTimer.current = null;
    }
  }, []);

  const clearStrikeTimer = useCallback(() => {
    if (strikeTimer.current !== null) {
      window.clearTimeout(strikeTimer.current);
      strikeTimer.current = null;
    }
    // A trade strike and an option strike share this one timer, so clearing it
    // must also clear both ids — otherwise a superseded strike leaves its row
    // struck forever with no timer left to clear it.
    setStrikingTradeId(null);
    setStrikingOptionId(null);
  }, []);

  const clearCoverTimer = useCallback(() => {
    if (coverTimer.current !== null) {
      window.clearTimeout(coverTimer.current);
      coverTimer.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearLandingTimer();
    clearStrikeTimer();
    clearCoverTimer();
  }, [clearLandingTimer, clearStrikeTimer, clearCoverTimer]);

  /** Re-read the server, and hand back what it said.
   *
   *  Returns the new snapshot so a caller can compare it against what it captured before
   *  — reading it back out of a setSnap updater instead meant doing work inside a function
   *  React expects to be pure, and StrictMode runs those twice.
   *
   *  The quote pull runs BEHIND this, not in front of it. It used to be awaited first, so
   *  every action in the app queued behind a symbol-by-symbol walk of Yahoo. Now the
   *  figures land immediately and prices catch up a moment later, on the rare refresh
   *  where a pull is actually due.
   */
  const refresh = useCallback(async (): Promise<Snapshot | null> => {
    let latest: Snapshot | null = null;
    try {
      latest = await fetchSnapshot();
      setSnap(latest);
      setOffline(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearPasscode();
        setUnlocked(false);
      } else {
        setOffline(true);
      }
      return null;
    }
    void pullQuotes().then((pulled) => {
      // Only re-read when a pull actually ran; otherwise this is the snapshot above.
      if (pulled) void fetchSnapshot().then(setSnap).catch(() => undefined);
    });
    return latest;
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
          setCover(true);
          clearCoverTimer();
          coverTimer.current = window.setTimeout(() => {
            coverTimer.current = null;
            setCover(false);
          }, 900);
        }}
      />
    );
  }
  if (!snap) return <div className="empty">Loading…</div>;

  const onDeleted = async (id?: number) => {
    setSheet(null);
    if (id == null) { await refresh(); return; }
    // A new strike is starting: any pending clear-and-refresh timer from a
    // prior strike is now stale (it would clear this row's strike early and
    // refresh before its 700ms is up), so drop it and start the new one clean.
    clearStrikeTimer();
    setStrikingTradeId(id);
    strikeTimer.current = window.setTimeout(() => {
      strikeTimer.current = null;
      setStrikingTradeId(null);
      void refresh();
    }, 700);
  };

  // Same shape as onDeleted, and deliberately the same timer: a trade strike and
  // an option strike must never run over each other.
  const onOptionDeleted = async (id?: number) => {
    setSheet(null);
    if (id == null) { await refresh(); return; }
    clearStrikeTimer();
    setStrikingOptionId(id);
    strikeTimer.current = window.setTimeout(() => {
      strikeTimer.current = null;
      setStrikingOptionId(null);
      void refresh();
    }, 700);
  };

  const tabProps = {
    snap,
    onRefresh: refresh,
    onEditTrade: (trade: Trade | null) => setSheet({ kind: 'trade', trade }),
    onMark: (symbol: string) => setSheet({ kind: 'mark', symbol }),
    onPosition: (p: OpenPosition) => setSheet({ kind: 'position', position: p }),
    onSettleOption: (option: OptionPosition) => setSheet({ kind: 'settle', option }),
    onEditOption: (option: OptionPosition) => setSheet({ kind: 'optionEdit', option }),
    onSellWeek: (expiration: string) => setSheet({ kind: 'sellOption', expiration }),
    onPasteFill: () => setSheet({ kind: 'paste' }),
    onViewRecord: (option: OptionPosition) => setSheet({ kind: 'record', option }),
    onMarkQuiet: (friday: string) => { void markQuietWeek(friday).then(() => refresh()); },
    onClearQuiet: (friday: string) => { void clearQuietWeek(friday).then(() => refresh()); },
    onFreshWheel: () => setSheet({ kind: 'freshWheel' }),
    onCompleteWheel: (summary: WheelSummary) => setSheet({ kind: 'completeWheel', summary }),
    onAbandonWheel: (wheel: Wheel) => {
      if (window.confirm(`Abandon ${wheel.symbol} Wheel Nº ${wheel.no}? Trades and options stay.`)) {
        void deleteWheel(wheel.id).then(() => refresh());
      }
    },
    onViewWheelRecord: (wheel: Wheel) => setSheet({ kind: 'wheelRecord', wheel }),
    justAdded,
    strikingTradeId,
    strikingOptionId,
    onDeleted,
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

  return (
    <div className={landing ? 'shell roll-slow' : 'shell'}>
      {offline && <OfflineBanner fetchedAt={snap.fetchedAt} />}
      {/* The Options tab supplies its own entrance (the week-card deal-in)
          and must not also get the whole-tab fade — that combination is
          what stacked three entrance animations at once. */}
      <div className={tab === 'options' ? undefined : 'tab-fade'} key={tab}>
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
        <AddTradeSheet trade={sheet.trade} wheels={snap.wheels} trades={snap.trades} options={snap.options} settings={snap.settings} prefill={sheet.prefill} onDone={onTicket} onDeleted={onDeleted} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'position' && (
        <PositionSheet
          position={sheet.position}
          onMark={() => setSheet({ kind: 'mark', symbol: sheet.position.symbol })}
          onClose={() =>
            setSheet({
              kind: 'trade',
              trade: null,
              prefill: { side: 'SELL', symbol: sheet.position.symbol, qty: sheet.position.qty },
            })
          }
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'optionEdit' && (
        <OptionSellSheet option={sheet.option} expiration={sheet.option.expiration} wheels={snap.wheels} trades={snap.trades} options={snap.options} settings={snap.settings} onDone={onTicket} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'record' && (
        <OptionRecordSheet option={sheet.option} onDeleted={onOptionDeleted} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'freshWheel' && (
        <FreshWheelSheet
          suggestions={recentSymbols(snap!.trades, snap!.options, 24)
            .filter((sym) => !snap!.wheels.some((w) => w.symbol === sym && w.closed_at === null))
            .slice(0, 3)}
          onDone={async (c) => { setSheet(null); setWheelCeremony(c); }}
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'completeWheel' && (
        <CompleteWheelSheet
          summary={sheet.summary}
          onDone={async (c) => { setSheet(null); setWheelCeremony(c); }}
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'wheelRecord' && (() => {
        const ws = summarizeWheel(sheet.wheel, snap!.trades, snap!.options, snap!.marks);
        return (
          <WheelRecordSheet
            wheel={sheet.wheel}
            finalTotal={ws.closeToday}
            detailLine={`${sheet.wheel.opened_at} → ${sheet.wheel.closed_at ?? ''} · ${ws.weeks}w · ${ws.callsSold} calls sold`}
            onDone={async () => { setSheet(null); await refresh(); }}
            onCancel={() => setSheet(null)}
          />
        );
      })()}
      {wheelCeremony && (
        <WheelCeremony
          data={wheelCeremony}
          onDone={() => {
            setWheelCeremony(null);
            void refresh();
          }}
        />
      )}
      {sheet?.kind === 'sellOption' && (
        <OptionSellSheet expiration={sheet.expiration} prefill={sheet.prefill} wheels={snap.wheels} trades={snap.trades} options={snap.options} settings={snap.settings} onDone={onTicket} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'paste' && (
        <PasteSheet
          problem={sheet.problem}
          onUse={(p) => {
            if (p.side === 'SOLD') {
              // The confirmation carries its own expiry, so this bypasses the week line.
              setSheet({ kind: 'sellOption', expiration: p.expiration, prefill: p });
              return;
            }
            // A buyback closes something. Which something has to be unambiguous.
            const match = matchOpenOption(p, snap.options);
            if (!match) {
              setSheet({
                kind: 'paste',
                problem:
                  `No single open ${p.symbol} $${p.strike} ${p.optType} expiring ${p.expiration} to close. ` +
                  'Settle it from its week line instead.',
              });
              return;
            }
            setSheet({ kind: 'settle', option: match, buyback: p.premium });
          }}
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'mark' && (
        <MarkSheet
          symbol={sheet.symbol}
          mark={snap.marks.find((m) => m.symbol === sheet.symbol) ?? null}
          onDone={async () => { setSheet(null); await refresh(); }}
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'settle' && (
        <SettleSheet
          option={sheet.option}
          buybackPrefill={sheet.buyback}
          settings={snap.settings}
          onDone={async (c) => { setSheet(null); setSettleCeremony(c); }}
          onDeleted={onOptionDeleted}
          onEdit={() => setSheet({ kind: 'optionEdit', option: sheet.option })}
          onCancel={() => setSheet(null)}
        />
      )}
      {settleCeremony && (
        <SettleCeremony
          data={settleCeremony}
          onDone={() => {
            setSettleCeremony(null);
            void refresh();
          }}
        />
      )}
      {ceremony && (
        <TradeCeremony
          ticket={ceremony}
          onDone={() => {
            setCeremony(null);
            setLanding(true);
            // Where the portfolio stood before this booking was folded in. Captured after
            // the envelope has closed and before the refresh that may move it.
            const before = portfolioFigures(snap);
            void refresh().then((latest) => {
              // Land where the figures that just changed actually live. The dial keeps its
              // own memory of where each hand was left, so arriving on Portfolio makes the
              // arm travel to its new stage rather than already be there — and the book
              // value rolls on arrival for the far commoner case of a plain stock fill.
              // A booking that moved nothing still leaves you where you were.
              //
              // `latest === null` means the refresh FAILED, not that the books are empty.
              // portfolioFigures(null) is '', which no real snapshot can equal, so comparing
              // it would throw you to Portfolio on every dropped connection — to look at
              // pre-booking figures under an offline banner. Learning nothing moves nothing.
              if (latest && portfolioFigures(latest) !== before) setTab('portfolio');
              landingTimer.current = window.setTimeout(() => {
                landingTimer.current = null;
                setLanding(false);
                setJustAdded(null);
              }, LANDING_MS);
            });
          }}
        />
      )}
      <TabBar
        active={tab}
        onChange={(next) => {
          setTab(next);
          // A new tab always starts at its own top, never inheriting the last
          // tab's scroll offset.
          window.scrollTo({ top: 0 });
        }}
      />
      {cover && <div className="book-cover" aria-hidden="true" onAnimationEnd={() => setCover(false)} />}
    </div>
  );
}
