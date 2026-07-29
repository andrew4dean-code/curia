import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsTab } from '../SettingsTab';
import type { Snapshot } from '../../lib/api';
import { RELEASES } from '../../lib/releases';

const snap: Snapshot = { trades: [], marks: [], options: [], wheels: [], quietWeeks: [], fetchedAt: new Date().toISOString() };
const cbs = { onRefresh: vi.fn(), onEditTrade: vi.fn(), onMark: vi.fn(), onSettleOption: vi.fn(), onEditOption: vi.fn() };

/* The version the app prints and the version the package declares are two facts that
   must never disagree, and nothing in a build would notice if they did — the number is
   cosmetic to every other part of the system. So it is asserted here, along with the
   ordering the release list relies on to mean "newest first". */
describe('release manifest', () => {
  const semver = (v: string) => v.split('.').map(Number);

  it('leads with the version this build actually is', () => {
    expect(RELEASES[0].version).toBe(__APP_VERSION__);
  });

  it('is ordered newest first, with no repeats', () => {
    const seen = new Set<string>();
    for (const r of RELEASES) {
      expect(seen.has(r.version), `${r.version} listed twice`).toBe(false);
      seen.add(r.version);
      expect(r.notes.length, `${r.version} has no notes`).toBeGreaterThan(0);
      expect(r.date, `${r.version} date must be ISO yyyy-mm-dd`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (let i = 1; i < RELEASES.length; i++) {
      const [aM, aN, aP] = semver(RELEASES[i - 1].version);
      const [bM, bN, bP] = semver(RELEASES[i].version);
      const newer = aM !== bM ? aM > bM : aN !== bN ? aN > bN : aP > bP;
      expect(newer, `${RELEASES[i - 1].version} should sort above ${RELEASES[i].version}`).toBe(true);
    }
  });
});

describe('SettingsTab', () => {
  it('names the version it is running and lists what changed', () => {
    render(<SettingsTab snap={snap} {...cbs} />);
    expect(screen.getByTestId('app-version')).toHaveTextContent(`Curia v${__APP_VERSION__}`);
    const list = screen.getByTestId('release-list');
    expect(list.querySelectorAll('.release')).toHaveLength(RELEASES.length);
    expect(list.querySelector('.release')).toHaveAttribute('data-version', RELEASES[0].version);
    expect(list).toHaveTextContent(RELEASES[0].notes[0]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows the build stamp', () => {
    render(<SettingsTab snap={snap} {...cbs} />);
    expect(screen.getByText(/Pressed /)).toBeInTheDocument();
  });

  it('update now clears caches but keeps the passcode, then reloads', async () => {
    localStorage.setItem('curia-passcode', '8800');
    localStorage.setItem('curia-cache-v3', '{"trades":[]}');
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { ...navigator, onLine: true, serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) } });
    const cacheDelete = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue(['workbox-x']), delete: cacheDelete });
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<SettingsTab snap={snap} {...cbs} />);
    fireEvent.click(screen.getByRole('button', { name: /Update now/ }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(localStorage.getItem('curia-cache-v3')).toBeNull();
    expect(localStorage.getItem('curia-passcode')).toBe('8800');
    expect(unregister).toHaveBeenCalled();
    expect(cacheDelete).toHaveBeenCalledWith('workbox-x');
  });

  it('refuses to update while offline and changes nothing', () => {
    localStorage.setItem('curia-cache-v3', '{"trades":[]}');
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<SettingsTab snap={snap} {...cbs} />);
    fireEvent.click(screen.getByRole('button', { name: /Update now/ }));
    expect(screen.getByText(/offline — updating needs a connection/)).toBeInTheDocument();
    expect(localStorage.getItem('curia-cache-v3')).not.toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows a friendly error for a bad backup file', async () => {
    render(<SettingsTab snap={snap} {...cbs} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bad = new File(['not json {'], 'backup.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [bad] } });
    await waitFor(() => expect(screen.getByText(/isn't a Curia backup/)).toBeInTheDocument());
  });
});
