import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

describe('App re-lock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('returns to the gate and clears the key when refresh gets a 401', async () => {
    localStorage.setItem('curia-passcode', 'stale-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText('Passcode')).toBeInTheDocument());
    expect(localStorage.getItem('curia-passcode')).toBeNull();
  });
});
