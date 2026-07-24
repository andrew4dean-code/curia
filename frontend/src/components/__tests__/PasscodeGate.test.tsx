import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasscodeGate } from '../PasscodeGate';

function typeAndSubmit() {
  fireEvent.change(screen.getByLabelText('Passcode'), { target: { value: 'guess' } });
  fireEvent.click(screen.getByRole('button', { name: /unlock/i }));
}

describe('PasscodeGate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('clears the key and says wrong passcode on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    render(<PasscodeGate onUnlocked={vi.fn()} />);
    typeAndSubmit();
    await waitFor(() => expect(screen.getByText(/Wrong passcode/)).toBeInTheDocument());
    expect(localStorage.getItem('curia-passcode')).toBeNull();
  });

  it('keeps the key and blames the connection on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    render(<PasscodeGate onUnlocked={vi.fn()} />);
    typeAndSubmit();
    await waitFor(() => expect(screen.getByText(/reach Curia/)).toBeInTheDocument());
    expect(localStorage.getItem('curia-passcode')).toBe('guess');
  });
});
