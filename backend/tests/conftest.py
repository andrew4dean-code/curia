import hashlib
import os

os.environ["CURIA_PASSCODE_SHA256"] = hashlib.sha256(b"test-pass").hexdigest()
os.environ["CURIA_AUTH_DELAY"] = "0"
os.environ["DATABASE_URL"] = "sqlite:///./test_curia.db"

import pytest
from fastapi.testclient import TestClient

from app.db import engine
from app.models import Base
from app.main import app

HEADERS = {"X-Curia-Key": "test-pass"}


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c
