from typing import Literal

Unit = Literal["kg", "lb"]

_G_PER_KG = 1000.0
_G_PER_LB = 453.59237


def kg_to_g(kg: float) -> int:
    return round(kg * _G_PER_KG)


def lb_to_g(lb: float) -> int:
    return round(lb * _G_PER_LB)


def g_to_kg(load_g: int) -> float:
    return round(load_g / _G_PER_KG, 1)


def g_to_lb(load_g: int) -> float:
    return round(load_g / _G_PER_LB, 1)


def format_load(load_g: int, unit: Unit) -> str:
    value = g_to_kg(load_g) if unit == "kg" else g_to_lb(load_g)
    return f"{value:.1f} {unit}"
