import pytest


@pytest.fixture(scope="session", autouse=True)
def test_db_url() -> str:
    """Analytics tests are pure functions — override the parent's DB-provisioning
    fixture so this suite never touches Postgres."""
    return ""
