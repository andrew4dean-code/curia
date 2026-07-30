"""create_all makes tables. It does not make columns.

Every schema change so far has been a new table, so the gap never showed: the settings
table appeared on deploy and nobody noticed that adding a COLUMN to trades or options
would not. It fails only in production, and only because production is the one database
that already has the old table in it. A local run starts empty and passes.
"""
import sqlalchemy as sa

from app.db import ensure_columns, engine, init_db
from app.models import Base, Option, Settings, Trade


def _columns(table: str) -> set:
    return {c["name"] for c in sa.inspect(engine).get_columns(table)}


def _drop_column(table: str, column: str) -> None:
    """Stand in for an old database: one the models have since grown past."""
    with engine.begin() as conn:
        conn.execute(sa.text(f"ALTER TABLE {table} DROP COLUMN {column}"))


def test_adds_a_column_the_models_grew_since_the_table_was_made():
    Base.metadata.drop_all(engine)
    init_db()
    _drop_column("settings", "tax_rate_pct")
    assert "tax_rate_pct" not in _columns("settings")

    init_db()

    assert "tax_rate_pct" in _columns("settings")


def test_the_added_column_carries_the_default_to_existing_rows():
    Base.metadata.drop_all(engine)
    init_db()
    with engine.begin() as conn:
        conn.execute(sa.insert(Trade).values(
            symbol="GLD", side="BUY", qty=100, price=50, fees=2.5,
            executed_at="2026-07-01", note="", created_at="x", updated_at="x"))
    _drop_column("trades", "fees")

    init_db()

    with engine.begin() as conn:
        assert conn.execute(sa.text("SELECT fees FROM trades")).scalar() == 0.0


def test_running_twice_changes_nothing():
    Base.metadata.drop_all(engine)
    init_db()
    before = _columns("options")
    ensure_columns()
    ensure_columns()
    assert _columns("options") == before


def test_a_table_that_does_not_exist_yet_is_left_to_create_all():
    Base.metadata.drop_all(engine)
    ensure_columns()  # must not raise on a database with no tables at all
    init_db()
    assert _columns("options") >= {c.name for c in Option.__table__.columns}
    assert _columns("settings") >= {c.name for c in Settings.__table__.columns}
