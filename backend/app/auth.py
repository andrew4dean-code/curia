import asyncio
import hashlib
import hmac
import os
import time

from fastapi import Header, HTTPException

# In-memory guess throttle (single-user, single-process app). After
# _FREE_GUESSES consecutive failures, wrong-key attempts are rejected fast
# with 429 until the lockout expires — escalating up to _MAX_LOCKOUT_S.
# A correct key ALWAYS passes (the owner is never locked out) and resets
# the counter.
_FREE_GUESSES = 5
_MAX_LOCKOUT_S = 300.0
_throttle = {"fails": 0, "locked_until": 0.0}


def _reset_throttle() -> None:
    _throttle["fails"] = 0
    _throttle["locked_until"] = 0.0


async def require_key(x_curia_key: str = Header(default="")) -> None:
    expected = os.environ.get("CURIA_PASSCODE_SHA256", "")
    given = hashlib.sha256(x_curia_key.encode()).hexdigest()
    if expected and hmac.compare_digest(given, expected):
        _reset_throttle()
        return
    now = time.monotonic()
    if now < _throttle["locked_until"]:
        raise HTTPException(status_code=429, detail="too many attempts — wait a bit")
    _throttle["fails"] += 1
    if _throttle["fails"] >= _FREE_GUESSES:
        overflow = _throttle["fails"] - _FREE_GUESSES
        _throttle["locked_until"] = now + min(_MAX_LOCKOUT_S, float(2 ** min(overflow + 2, 9)))
    await asyncio.sleep(float(os.environ.get("CURIA_AUTH_DELAY", "1.0")))
    raise HTTPException(status_code=401, detail="wrong passcode")
