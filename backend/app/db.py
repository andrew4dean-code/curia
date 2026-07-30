import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateColumn

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


def ensure_columns() -> None:
    """Add columns the models have grown that the live tables have not.

    create_all makes missing TABLES and nothing else, so every schema change until now got
    away with it by happening to be a new table. Add a field to trades or options and the
    column appears on a fresh local database and never on the one in production, which is
    the only database that already has the old table. Then reads of it 500 on a deploy that
    passed every test.

    Deliberately additive only. Renames, drops and type changes need a decision about the
    data already in the column, and a migration that silently guesses at one is worse than
    a deploy that stops. Those still want a real migration written by hand.

    A column's Python-side default is copied into a server DEFAULT for this statement, so
    the rows already in the table get the value the model promises rather than NULL. It is
    not left on the column afterwards on Postgres — new rows get their value from the ORM,
    the same as every other row this app writes.
    """
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    for table in Base.metadata.sorted_tables:
        if table.name not in tables:
            continue  # create_all's job, not this one's
        have = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in have:
                continue
            ddl = str(CreateColumn(column).compile(engine))
            default = getattr(column.default, "arg", None)
            if default is not None and not callable(default):
                literal = f"'{default}'" if isinstance(default, str) else repr(default)
                ddl = f"{ddl} DEFAULT {literal}"
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {ddl}"))


def init_db() -> None:
    Base.metadata.create_all(engine)
    ensure_columns()
