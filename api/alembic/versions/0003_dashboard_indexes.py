"""dashboard query indexes

Revision ID: 0003_dashboard_indexes
Revises: 0002_workout_templates
Create Date: 2026-09-06

Adds only the indexes justified by the dashboard and last-session query
plans against a ~150-workout fixture (see seeds/demo_data.py):

- workouts_user_finished_idx: get_finished_workouts_for_user and
  get_all_sets_for_user both filter on user_id + ended_at IS NOT NULL and
  order by performed_on DESC. The existing workouts_user_date_idx cannot
  skip unfinished rows, so EXPLAIN showed a filter over every workout
  including in-progress ones. The partial index lets Postgres seek only
  finished workouts in date order.
- we_exercise_workout_idx: get_last_completed_session_sets and
  list_finished_workout_ids_for_exercise join workouts to
  workout_exercises on workout_id while filtering exercise_id. The
  existing single-column we_exercise_idx forced a bitmap heap scan
  followed by a join filter; the composite index resolves
  (exercise_id, workout_id) directly from the index.

Deliberately not added: an index on sets(workout_exercise_id) is already
covered by the UNIQUE (workout_exercise_id, set_number) constraint, and a
separate index on workouts(ended_at) alone is less selective than the
partial composite above.
"""

from __future__ import annotations

from alembic import op

revision = "0003_dashboard_indexes"
down_revision = "0002_workout_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS workouts_user_finished_idx
          ON workouts (user_id, performed_on DESC)
          WHERE ended_at IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS we_exercise_workout_idx
          ON workout_exercises (exercise_id, workout_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS we_exercise_workout_idx")
    op.execute("DROP INDEX IF EXISTS workouts_user_finished_idx")
