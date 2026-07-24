import { agoLabel } from '../lib/time';

export function OfflineBanner({ fetchedAt }: { fetchedAt: string }) {
  return <div className="offline">Offline — showing data from {agoLabel(fetchedAt)}</div>;
}
