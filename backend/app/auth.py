import hashlib
import hmac
import os
import time

from fastapi import Header, HTTPException


def require_key(x_curia_key: str = Header(default="")) -> None:
    expected = os.environ.get("CURIA_PASSCODE_SHA256", "")
    given = hashlib.sha256(x_curia_key.encode()).hexdigest()
    if not expected or not hmac.compare_digest(given, expected):
        time.sleep(float(os.environ.get("CURIA_AUTH_DELAY", "1.0")))
        raise HTTPException(status_code=401, detail="wrong passcode")
