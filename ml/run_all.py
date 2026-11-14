"""Run the hindcast pipeline end to end (ML-01 to ML-08). Raw downloads are cached in data/raw/ml/."""
from __future__ import annotations

from ml.datasets import build_daily_weather, build_rad_daily
from ml.evaluation import baselines, inspect_rad, report
from ml.export import forecasts
from ml.models import a1_pressure, a2_temperature, b1_dose
from ml.sources import rad, rems, sunspots, waypoints


def main() -> None:
    rems.fetch()
    waypoints.fetch()
    sunspots.fetch()
    rad.fetch_all_dose(range(2012, 2027))
    build_daily_weather.main()
    build_rad_daily.main()
    baselines.main()
    a1_pressure.main()
    a2_temperature.main()
    b1_dose.main()
    forecasts.main()
    inspect_rad.main()
    report.main()


if __name__ == "__main__":
    main()
