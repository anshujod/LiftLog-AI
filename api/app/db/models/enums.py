import enum

from sqlalchemy import Enum as SAEnum


class LoadType(enum.StrEnum):
    BARBELL_TOTAL = "barbell_total"
    DUMBBELL_PER_HAND = "dumbbell_per_hand"
    MACHINE_TOTAL = "machine_total"
    BODYWEIGHT = "bodyweight"
    BODYWEIGHT_ADDED = "bodyweight_added"
    ASSISTED = "assisted"


class ProgressionMetric(enum.StrEnum):
    E1RM = "e1rm"
    TOP_WEIGHT = "top_weight"
    VOLUME = "volume"
    REPS_AT_LOAD = "reps_at_load"


class UnitPref(enum.StrEnum):
    KG = "kg"
    LB = "lb"


def _values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]


load_type_enum = SAEnum(LoadType, name="load_type", create_type=False, values_callable=_values)
progression_metric_enum = SAEnum(
    ProgressionMetric, name="progression_metric", create_type=False, values_callable=_values
)
unit_pref_enum = SAEnum(UnitPref, name="unit_pref", create_type=False, values_callable=_values)
