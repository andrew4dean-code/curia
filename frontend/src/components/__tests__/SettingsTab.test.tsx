import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsTab } from '../SettingsTab';
import type { Snapshot } from '../../lib/api';

const snap: Snapshot = { trades: [], marks: [], options: [], wheels: [], quietWeeks: [], fetchedAt: new Date().toISOString() };
const cbs = { onRefresh: vi.fn(), onEditTrade: vi.fn(), onMark: vi.fn(), onSettleOption: vi.fn(), onEditOption: vi.fn() };

describe('SettingsTab', () => {
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
