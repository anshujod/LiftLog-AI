"""workout templates

Revision ID: 0002_workout_templates
Revises: 0001_initial_schema
Create Date: 2026-09-06

"""

from __future__ import annotations

from alembic import op

revision = "0002_workout_templates"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE workout_templates (
          id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name         text NOT NULL,
          notes        text,
          created_at   timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX workout_templates_user_idx ON workout_templates (user_id)")

    op.execute(
        """
        CREATE TABLE template_exercises (
          id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          template_id uuid NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
          exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
          position    smallint NOT NULL,
          target_sets smallint CHECK (target_sets IS NULL OR target_sets > 0),
          notes       text,
          UNIQUE (template_id, position)
        )
        """
    )
    op.execute("CREATE INDEX template_exercises_template_idx ON template_exercises (template_id)")
    op.execute("CREATE INDEX template_exercises_exercise_idx ON template_exercises (exercise_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS template_exercises")
    op.execute("DROP TABLE IF EXISTS workout_templates")
