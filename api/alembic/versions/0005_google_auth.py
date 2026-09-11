"""google auth

Revision ID: 0005_google_auth
Revises: 0004_weekly_summaries
Create Date: 2026-09-11

Adds Sign in with Google: a unique google_sub per user and nullable
password_hash so Google-only accounts can exist. Existing password users
keep their hashes; auto-linking fills google_sub on first Google sign-in.
"""

from __future__ import annotations

from alembic import op

revision = "0005_google_auth"
down_revision = "0004_weekly_summaries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN google_sub TEXT")
    op.execute("CREATE UNIQUE INDEX users_google_sub_uq ON users (google_sub)")
    op.execute("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL")


def downgrade() -> None:
    # Google-only accounts cannot survive the downgrade: remove them before
    # restoring NOT NULL so the down migration stays reversible in dev.
    op.execute("DELETE FROM users WHERE password_hash IS NULL")
    op.execute("DROP INDEX IF EXISTS users_google_sub_uq")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS google_sub")
    op.execute("ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL")
