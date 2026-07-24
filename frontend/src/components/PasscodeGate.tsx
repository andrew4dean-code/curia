import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, clearPasscode, fetchSnapshot, setPasscode } from '../lib/api';
import type { Snapshot } from '../lib/api';

export function PasscodeGate({ onUnlocked }: { onUnlocked: (snap: Snapshot) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setPasscode(value);
    try {
      onUnlocked(await fetchSnapshot());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearPasscode();
        setError('Wrong passcode — try again.');
      } else {
        setError("Can't reach Curia — check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="gate" onSubmit={submit}>
      <h1>Curia</h1>
      <p className="hero-sub">Enter your passcode</p>
      <div className="field" style={{ marginTop: 20 }}>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Passcode"
        />
      </div>
      <button className="btn" disabled={busy || !value}>
        {busy ? 'Checking…' : 'Unlock'}
      </button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
