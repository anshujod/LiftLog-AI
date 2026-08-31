"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-09-01

"""

from __future__ import annotations

from alembic import op

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")

    op.execute(
        """
        CREATE TYPE load_type AS ENUM (
          'barbell_total', 'dumbbell_per_hand', 'machine_total',
          'bodyweight', 'bodyweight_added', 'assisted'
        )
        """
    )
    op.execute(
        """
        CREATE TYPE progression_metric AS ENUM (
          'e1rm', 'top_weight', 'volume', 'reps_at_load'
        )
        """
    )
    op.execute("CREATE TYPE unit_pref AS ENUM ('kg', 'lb')")

    op.execute(
        """
        CREATE TABLE users (
          id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          email           citext UNIQUE NOT NULL,
          password_hash   text NOT NULL,
          unit_preference unit_pref NOT NULL DEFAULT 'kg',
          bodyweight_g    integer,
          created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE muscle_groups (
          id            smallserial PRIMARY KEY,
          slug          text UNIQUE NOT NULL,
          name          text NOT NULL,
          display_order smallint NOT NULL DEFAULT 0
        )
        """
    )

    op.execute(
        """
        CREATE TABLE exercises (
          id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id             uuid REFERENCES users(id) ON DELETE CASCADE,
          muscle_group_id     smallint NOT NULL REFERENCES muscle_groups(id),
          name                text NOT NULL,
          load_type           load_type NOT NULL,
          progression_metric  progression_metric NOT NULL DEFAULT 'e1rm',
          default_increment_g integer NOT NULL DEFAULT 2500,
          is_active           boolean NOT NULL DEFAULT true,
          created_at          timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX exercises_user_name_uq
          ON exercises (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'), lower(name))
        """
    )

    op.execute(
        """
        CREATE TABLE workouts (
          id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          performed_on date NOT NULL,
          started_at   timestamptz,
          ended_at     timestamptz,
          title        text,
          notes        text,
          created_at   timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX workouts_user_date_idx ON workouts (user_id, performed_on DESC)")

    op.execute(
        """
        CREATE TABLE workout_exercises (
          id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          workout_id  uuid NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
          exercise_id uuid NOT NULL REFERENCES exercises(id),
          position    smallint NOT NULL,
          notes       text,
          UNIQUE (workout_id, position)
        )
        """
    )
    op.execute("CREATE INDEX we_exercise_idx ON workout_exercises (exercise_id)")

    op.execute(
        """
        CREATE TABLE sets (
          id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          workout_exercise_id uuid NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
          set_number          smallint NOT NULL,
          load_g              integer NOT NULL,
          reps                smallint NOT NULL CHECK (reps > 0),
          is_warmup           boolean NOT NULL DEFAULT false,
          rpe                 numeric(3,1) CHECK (rpe BETWEEN 1 AND 10),
          notes               text,
          created_at          timestamptz NOT NULL DEFAULT now(),
          UNIQUE (workout_exercise_id, set_number)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sets")
    op.execute("DROP TABLE IF EXISTS workout_exercises")
    op.execute("DROP TABLE IF EXISTS workouts")
    op.execute("DROP TABLE IF EXISTS exercises")
    op.execute("DROP TABLE IF EXISTS muscle_groups")
    op.execute("DROP TABLE IF EXISTS users")
    op.execute("DROP TYPE IF EXISTS unit_pref")
    op.execute("DROP TYPE IF EXISTS progression_metric")
    op.execute("DROP TYPE IF EXISTS load_type")
