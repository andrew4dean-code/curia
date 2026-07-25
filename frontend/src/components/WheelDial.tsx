import type { WheelStage } from '../lib/types';

const ORDER: WheelStage[] = ['SELL_PUT', 'ASSIGNED', 'SELLING_CALLS', 'CALLED_AWAY'];

// The hand is drawn pointing DOWN; each station is a clockwise rotation from there.
// Cumulative angles keep the transition winding clockwise, never snapping back.
const HAND_ANGLE: Record<WheelStage, number> = {
  SELL_PUT: 180,
  ASSIGNED: 270,
  SELLING_CALLS: 360,
  CALLED_AWAY: 450,
  COMPLETED: 540,
};

const STATIONS = [
  { stage: 'SELL_PUT' as WheelStage, label: 'SELL PUT', x: 105, y: 20, rotate: 0 },
  { stage: 'ASSIGNED' as WheelStage, label: 'ASSIGNED', x: 190, y: 105, rotate: 90 },
  { stage: 'SELLING_CALLS' as WheelStage, label: 'SELLING CALLS', x: 105, y: 198, rotate: 0 },
  { stage: 'CALLED_AWAY' as WheelStage, label: 'CALLED AWAY', x: 20, y: 105, rotate: -90 },
];

export function WheelDial({
  stage,
  callsSold,
  no,
  weeks,
}: {
  stage: WheelStage;
  callsSold: number;
  no: number;
  weeks: number;
}) {
  const idx = stage === 'COMPLETED' ? ORDER.length : ORDER.indexOf(stage);
  const spokes = Math.min(callsSold, 12);

  return (
    <svg
      className="wheel-dial"
      width="220"
      height="220"
      viewBox="0 0 210 210"
      role="img"
      aria-label={`Wheel ${no}, week ${weeks}, stage ${stage.replace('_', ' ').toLowerCase()}, ${callsSold} calls sold`}
    >
      <circle cx="105" cy="105" r="96" fill="none" stroke="var(--rule)" strokeWidth="2" />
      <circle cx="105" cy="105" r="78" fill="none" stroke="var(--rule)" strokeWidth="1" />
      <g stroke="var(--rule)" strokeWidth="1">
        <line x1="105" y1="9" x2="105" y2="27" />
        <line x1="201" y1="105" x2="183" y2="105" />
        <line x1="105" y1="201" x2="105" y2="183" />
        <line x1="9" y1="105" x2="27" y2="105" />
      </g>
      <g stroke="var(--gold)" strokeWidth="2" opacity="0.85">
        {Array.from({ length: spokes }, (_, i) => {
          const a = ((i * (360 / 12) + 15) * Math.PI) / 180;
          return (
            <line
              key={i}
              data-testid="dial-spoke"
              x1={105 + 28 * Math.sin(a)}
              y1={105 - 28 * Math.cos(a)}
              x2={105 + 70 * Math.sin(a)}
              y2={105 - 70 * Math.cos(a)}
            />
          );
        })}
      </g>
      <g fontFamily="var(--font-mono)" fontSize="9" textAnchor="middle" letterSpacing="0.08em">
        {STATIONS.map((s, i) => {
          const passed = i < idx;
          const current = i === idx;
          return (
            <text
              key={s.stage}
              x={s.x}
              y={s.y}
              transform={s.rotate ? `rotate(${s.rotate} ${s.x} ${s.y})` : undefined}
              fill={passed ? 'var(--pl-green)' : current ? 'var(--maroon)' : 'var(--ink-soft)'}
              fontWeight={current ? 700 : 400}
              data-station={s.stage}
              data-state={passed ? 'passed' : current ? 'current' : 'ahead'}
            >
              {s.label}
              {passed ? ' ✓' : ''}
            </text>
          );
        })}
      </g>
      <line
        className="wheel-hand"
        x1="105"
        y1="105"
        x2="105"
        y2="168"
        stroke="var(--maroon)"
        strokeWidth="4"
        strokeLinecap="round"
        style={{
          transform: `rotate(${HAND_ANGLE[stage] - 360}deg)`,
          transformOrigin: '105px 105px',
          transition: 'transform 2.2s var(--roll-ease)',
        }}
      />
      <circle cx="105" cy="105" r="26" fill="var(--maroon)" />
      <text x="105" y="101" fontFamily="var(--font-display)" fontSize="11" fill="var(--parchment)" textAnchor="middle">
        Nº {no}
      </text>
      <text x="105" y="115" fontFamily="var(--font-display)" fontSize="10" fill="var(--parchment)" textAnchor="middle">
        wk {weeks}
      </text>
    </svg>
  );
}
