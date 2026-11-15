"""Run the hindcast pipeline end to end (ML-01 to ML-09). Raw downloads are cached in data/raw/ml/."""
from __future__ import annotations

from ml.datasets import build_daily_weather, build_rad_daily, build_space_weather
from ml.evaluation import baselines, c1_donki, inspect_rad, report
from ml.export import forecasts
from ml.models import a1_pressure, a2_temperature, b1_dose
from ml.sources import donki, rad, rems, sunspots, waypoints


def main() -> None:
    rems.fetch()
    waypoints.fetch()
    sunspots.fetch()
    rad.fetch_all_dose(range(2012, 2027))
    for kind in donki.TYPES:  # needs NASA_API_KEY only for chunks not cached yet
        donki.load(kind)
    build_daily_weather.main()
    build_rad_daily.main()
    baselines.main()
    a1_pressure.main()
    a2_temperature.main()
    b1_dose.main()
    build_space_weather.main()
    c1_donki.main()
    forecasts.main()
    inspect_rad.main()
    report.main()


if __name__ == "__main__":
    main()
