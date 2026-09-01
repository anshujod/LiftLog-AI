import uuid
from datetime import timedelta

from fastapi.testclient import TestClient
from jose import jwt

from app.core.security import _create_token
from app.main import app


def _register(client: TestClient, email: str, password: str = "supersecurepw") -> dict:
    resp = client.post("/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()


def test_register_login_refresh_round_trip() -> None:
    with TestClient(app) as client:
        email = f"user-{uuid.uuid4()}@example.com"
        tokens = _register(client, email)
        assert "access_token" in tokens
        assert "refresh_token" in tokens

        login_resp = client.post("/auth/login", json={"email": email, "password": "supersecurepw"})
        assert login_resp.status_code == 200
        login_tokens = login_resp.json()

        me_resp = client.get(
            "/me", headers={"Authorization": f"Bearer {login_tokens['access_token']}"}
        )
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == email

        refresh_resp = client.post(
            "/auth/refresh", json={"refresh_token": login_tokens["refresh_token"]}
        )
        assert refresh_resp.status_code == 200
        assert "access_token" in refresh_resp.json()


def test_register_duplicate_email_rejected() -> None:
    with TestClient(app) as client:
        email = f"dup-{uuid.uuid4()}@example.com"
        _register(client, email)
        second = client.post("/auth/register", json={"email": email, "password": "supersecurepw"})
        assert second.status_code == 409


def test_login_wrong_password_and_unknown_email_share_message() -> None:
    with TestClient(app) as client:
        unknown_resp = client.post(
            "/auth/login",
            json={"email": f"unknown-{uuid.uuid4()}@example.com", "password": "whatever123"},
        )
        assert unknown_resp.status_code == 401
        unknown_message = unknown_resp.json()["error"]["message"]

        email = f"known-{uuid.uuid4()}@example.com"
        _register(client, email)
        wrong_pw_resp = client.post(
            "/auth/login", json={"email": email, "password": "the-wrong-password"}
        )
        assert wrong_pw_resp.status_code == 401
        assert wrong_pw_resp.json()["error"]["message"] == unknown_message


def test_missing_token_rejected() -> None:
    with TestClient(app) as client:
        resp = client.get("/me")
        assert resp.status_code == 401


def test_expired_access_token_rejected() -> None:
    with TestClient(app) as client:
        email = f"expired-{uuid.uuid4()}@example.com"
        tokens = _register(client, email)
        user_id = uuid.UUID(jwt.get_unverified_claims(tokens["access_token"])["sub"])

        expired_token = _create_token(user_id, timedelta(minutes=-5), "access")
        resp = client.get("/me", headers={"Authorization": f"Bearer {expired_token}"})
        assert resp.status_code == 401


def test_refresh_token_rejected_on_access_only_route() -> None:
    with TestClient(app) as client:
        email = f"swap-{uuid.uuid4()}@example.com"
        tokens = _register(client, email)

        resp = client.get("/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"})
        assert resp.status_code == 401
