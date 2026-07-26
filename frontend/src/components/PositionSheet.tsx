import type { OpenPosition } from '../lib/types';
import { formatMoney } from '../lib/format';

export function PositionSheet({
  position,
  onMark,
  onClose,
  onCancel,
}: {
  position: OpenPosition;
  onMark: () => void;
  onClose: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{position.symbol}</h2>
        <div className="row-sub" style={{ marginBottom: 16 }}>
          {position.qty} sh · avg {formatMoney(position.avgCost)}
        </div>
        <button type="button" className="btn" onClick={onClose}>
          Close it out
        </button>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onMark}>
            Update price
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
