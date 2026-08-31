import os
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from alembic import command

API_DIR = Path(__file__).resolve().parent.parent
DB_HOST_URL = "postgresql+psycopg://liftlog:liftlog@localhost:5434"
TEST_DB_NAME = "liftlog_test"
TEST_DB_URL = f"{DB_HOST_URL}/{TEST_DB_NAME}"

os.environ.setdefault("DATABASE_URL", TEST_DB_URL)
os.environ.setdefault("AUTH_SECRET", "test-secret")


@pytest.fixture(scope="session", autouse=True)
def test_db_url() -> str:
    admin_engine = create_engine(f"{DB_HOST_URL}/postgres", isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}" WITH (FORCE)'))
        conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    admin_engine.dispose()

    alembic_cfg = Config(str(API_DIR / "alembic.ini"))
    alembic_cfg.set_main_option("sqlalchemy.url", TEST_DB_URL)
    alembic_cfg.attributes["configure_logger"] = False
    command.upgrade(alembic_cfg, "head")

    from seeds.seed import run_seed

    engine = create_engine(TEST_DB_URL)
    session_factory = sessionmaker(bind=engine)
    with session_factory() as session:
        run_seed(session)
        session.commit()
    engine.dispose()

    return TEST_DB_URL


@pytest.fixture
def db_session(test_db_url: str):
    engine = create_engine(test_db_url)
    session_factory = sessionmaker(bind=engine)
    session: Session = session_factory()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
