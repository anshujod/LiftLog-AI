from app.analytics.units import format_load, g_to_kg, g_to_lb, kg_to_g, lb_to_g


def test_kg_to_g_exact() -> None:
    assert kg_to_g(62.5) == 62500


def test_kg_to_g_rounds_to_nearest_gram() -> None:
    assert kg_to_g(62.5001) == 62500


def test_lb_to_g_conversion() -> None:
    assert lb_to_g(45) == 20412


def test_g_to_kg_rounds_to_one_decimal() -> None:
    assert g_to_kg(62534) == 62.5


def test_g_to_lb_rounds_to_one_decimal() -> None:
    assert g_to_lb(20000) == 44.1


def test_round_trip_kg() -> None:
    assert g_to_kg(kg_to_g(100.0)) == 100.0


def test_format_load_kg() -> None:
    assert format_load(62500, "kg") == "62.5 kg"


def test_format_load_lb() -> None:
    assert format_load(20412, "lb") == "45.0 lb"


def test_format_load_zero() -> None:
    assert format_load(0, "kg") == "0.0 kg"
