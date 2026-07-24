import type { Snapshot } from '../lib/api';
import type { Trade } from '../lib/types';

export interface TabProps {
  snap: Snapshot;
  onRefresh: () => Promise<void>;
  onEditTrade: (t: Trade | null) => void;
  onMark: (symbol: string) => void;
}

export function PortfolioTab(_props: TabProps) {
  return <div className="empty">Portfolio — Task 7</div>;
}
