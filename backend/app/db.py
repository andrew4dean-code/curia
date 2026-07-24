import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base


def _url() -> str:
    url = os.environ.get("DATABASE_URL", "sqlite:///./curia.db")
    # Railway hands out postgres:// URLs; SQLAlchemy+psycopg3 wants postgresql+psycopg://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


_URL = _url()
engine = create_engine(
    _URL,
    connect_args={"check_same_thread": False} if _URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(engine)
