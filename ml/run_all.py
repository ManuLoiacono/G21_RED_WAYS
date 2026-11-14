"""Run the weather hindcast pipeline end to end (ML-01 to ML-06). Raw downloads are cached in data/raw/ml/."""
from __future__ import annotations

from ml.datasets import build_daily_weather
from ml.evaluation import baselines, report
from ml.export import forecasts
from ml.models import a1_pressure, a2_temperature
from ml.sources import rems, waypoints


def main() -> None:
    rems.fetch()
    waypoints.fetch()
    build_daily_weather.main()
    baselines.main()
    a1_pressure.main()
    a2_temperature.main()
    forecasts.main()
    report.main()


if __name__ == "__main__":
    main()
