"""weekly summary cache

Revision ID: 0004_weekly_summaries
Revises: 0003_dashboard_indexes
Create Date: 2026-09-08

Stores one generated week-in-review per user per ISO week so the summary —
including its AI-written observation — is not regenerated on every read.
"""

from __future__ import annotations

from alembic import op

revision = "0004_weekly_summaries"
down_revision = "0003_dashboard_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE weekly_summaries (
          id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          iso_year     smallint NOT NULL,
          iso_week     smallint NOT NULL,
          summary_json jsonb NOT NULL,
          created_at   timestamptz NOT NULL DEFAULT now(),
          UNIQUE (user_id, iso_year, iso_week)
        )
        """
    )
    op.execute("CREATE INDEX weekly_summaries_user_idx ON weekly_summaries (user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS weekly_summaries")
