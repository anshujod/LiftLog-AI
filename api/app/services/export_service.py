import csv
import io
from datetime import UTC, datetime
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.db.models import User
from app.repositories import export_repository

ExportFormat = Literal["json", "csv"]

EXPORT_VERSION = 1


def build_export(db: Session, user: User) -> dict[str, Any]:
    muscle_groups = export_repository.list_muscle_groups(db)
    exercises = export_repository.get_visible_exercises(db, user.id)
    workouts = export_repository.get_full_history(db, user.id)

    return {
        "version": EXPORT_VERSION,
        "exported_at": datetime.now(UTC).isoformat(),
        "user": {
            "email": user.email,
            "unit_preference": user.unit_preference.value,
            "bodyweight_g": user.bodyweight_g,
        },
        "muscle_groups": [
            {"slug": g.slug, "name": g.name, "display_order": g.display_order}
            for g in muscle_groups
        ],
        "exercises": [
            {
                "id": str(e.id),
                "name": e.name,
                "muscle_group_slug": e.muscle_group.slug,
                "load_type": e.load_type.value,
                "progression_metric": e.progression_metric.value,
                "default_increment_g": e.default_increment_g,
                "is_custom": e.user_id is not None,
                "is_active": e.is_active,
            }
            for e in exercises
        ],
        "workouts": [
            {
                "id": str(w.id),
                "performed_on": w.performed_on.isoformat(),
                "started_at": w.started_at.isoformat() if w.started_at else None,
                "ended_at": w.ended_at.isoformat() if w.ended_at else None,
                "title": w.title,
                "notes": w.notes,
                "exercises": [
                    {
                        "position": we.position,
                        "exercise_id": str(we.exercise_id),
                        "exercise_name": we.exercise.name,
                        "notes": we.notes,
                        "sets": [
                            {
                                "set_number": s.set_number,
                                "load_g": s.load_g,
                                "reps": s.reps,
                                "is_warmup": s.is_warmup,
                                "rpe": float(s.rpe) if s.rpe is not None else None,
                                "notes": s.notes,
                            }
                            for s in sorted(we.sets, key=lambda s: s.set_number)
                        ],
                    }
                    for we in sorted(w.workout_exercises, key=lambda we: we.position)
                ],
            }
            for w in workouts
        ],
    }


def to_csv(payload: dict[str, Any]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "workout_id",
            "performed_on",
            "workout_title",
            "exercise_name",
            "muscle_group_slug",
            "load_type",
            "position",
            "set_number",
            "load_g",
            "reps",
            "is_warmup",
            "rpe",
            "set_notes",
        ]
    )
    exercise_lookup = {e["id"]: e for e in payload["exercises"]}
    for workout in payload["workouts"]:
        for we in workout["exercises"]:
            meta = exercise_lookup.get(we["exercise_id"], {})
            for s in we["sets"]:
                writer.writerow(
                    [
                        workout["id"],
                        workout["performed_on"],
                        workout["title"] or "",
                        we["exercise_name"],
                        meta.get("muscle_group_slug", ""),
                        meta.get("load_type", ""),
                        we["position"],
                        s["set_number"],
                        s["load_g"],
                        s["reps"],
                        str(s["is_warmup"]).lower(),
                        s["rpe"] if s["rpe"] is not None else "",
                        s["notes"] or "",
                    ]
                )
    return buf.getvalue()
