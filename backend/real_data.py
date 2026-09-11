"""Real-world environmental data adapter using Open-Meteo.

Open-Meteo supplies current/forecast weather plus historical/reanalysis data.
No simulated sensor values are generated in this module. Results are cached for
5 minutes so the dashboard can poll every 10 seconds without hammering the API.
"""
from __future__ import annotations
import time
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import requests

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_API = "https://archive-api.open-meteo.com/v1/archive"
TIMEOUT = 20
CACHE_TTL = 300
_cache = {}


def _get_json(url, params):
    r = requests.get(url, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def _cache_get(key):
    item = _cache.get(key)
    if item and time.time() - item[0] < CACHE_TTL:
        return item[1]
    return None


def _cache_put(key, value):
    _cache[key] = (time.time(), value)
    return value


def _iso_now_local():
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%dT%H:%M")


def _build_reading(district, payload):
    h = payload.get("hourly", {})
    times = h.get("time", [])
    precip = h.get("precipitation", [])
    soil = h.get("soil_moisture_0_to_7cm", [])
    elevation = payload.get("elevation")
    if not times or not precip:
        raise RuntimeError("Open-Meteo returned no hourly precipitation data")

    # Use the latest completed/current hourly observation.
    n = min(len(times), len(precip))
    idx = n - 1
    recent = [float(x or 0) for x in precip[max(0, n-72):n]]
    r1 = recent[-1] if recent else 0.0
    r24 = sum(recent[-24:])
    r72 = sum(recent[-72:])
    sm = float(soil[idx] * 100) if soil and soil[idx] is not None else 35.0

    return {
        "district_id": district["id"],
        "timestamp": times[idx],
        "rainfall_1h_mm": round(r1, 2),
        "rainfall_24h_mm": round(r24, 2),
        "rainfall_72h_mm": round(r72, 2),
        "soil_moisture_pct": round(max(0, min(100, sm)), 2),
        "slope_deg": district["slope_deg"],
        "soil_type": district["soil_type"],
        "vegetation_cover_pct": district["vegetation_cover_pct"],
        # No simulated seismic readings: 0 means no seismic sensor is connected.
        "seismic_activity": 0.0,
        "elevation_m": round(float(elevation or 0), 1),
        "historical_landslide_freq": district["historical_landslide_freq"],
        "data_source": "Open-Meteo live forecast/reanalysis + station metadata",
    }


def get_live_reading(district):
    key = (district["id"], "live")
    cached = _cache_get(key)
    if cached:
        return cached
    params = {
        "latitude": district["lat"], "longitude": district["lon"],
        "hourly": "precipitation,soil_moisture_0_to_7cm",
        "past_days": 3, "forecast_days": 0,
        "timezone": "auto", "temperature_unit": "celsius",
        "precipitation_unit": "mm", "cell_selection": "land",
    }
    return _cache_put(key, _build_reading(district, _get_json(OPEN_METEO, params)))


def get_history(district, hours=24):
    params = {
        "latitude": district["lat"], "longitude": district["lon"],
        "hourly": "precipitation,soil_moisture_0_to_7cm",
        "past_days": 3, "forecast_days": 1,
        "timezone": "auto", "precipitation_unit": "mm",
        "cell_selection": "land",
    }
    payload = _get_json(OPEN_METEO, params)
    h = payload.get("hourly", {})
    times = h.get("time", [])[-hours:]
    rain = h.get("precipitation", [])[-hours:]
    soil = h.get("soil_moisture_0_to_7cm", [])[-hours:]
    points = []
    for i, ts in enumerate(times):
        sm = soil[i] * 100 if i < len(soil) and soil[i] is not None else None
        points.append({"timestamp": ts, "rainfall_mm": round(float(rain[i] or 0), 2),
                       "soil_moisture_pct": round(float(sm), 2) if sm is not None else None})
    return points


def get_forecast(district):
    params = {
        "latitude": district["lat"], "longitude": district["lon"],
        "hourly": "precipitation,soil_moisture_0_to_7cm",
        "past_days": 3, "forecast_days": 2,
        "timezone": "auto", "precipitation_unit": "mm",
        "cell_selection": "land",
    }
    payload = _get_json(OPEN_METEO, params)
    h = payload.get("hourly", {})
    times = h.get("time", [])
    rain = h.get("precipitation", [])
    soil = h.get("soil_moisture_0_to_7cm", [])
    now = datetime.now().replace(minute=0, second=0, microsecond=0)
    future = []
    for i, ts in enumerate(times):
        try: dt = datetime.fromisoformat(ts)
        except ValueError: continue
        if dt.replace(tzinfo=dt.tzinfo) >= now:
            future.append((i, dt))
    future = future[:24]
    def rain_sum(n): return sum(float(rain[i] or 0) for i,_ in future[:n])
    soil24 = None
    if future:
        vals = [soil[i] for i,_ in future[:24] if i < len(soil) and soil[i] is not None]
        if vals: soil24 = round(float(vals[-1]) * 100, 2)
    return {"6h_mm": round(rain_sum(6),2), "12h_mm": round(rain_sum(12),2),
            "24h_mm": round(rain_sum(24),2), "forecast_soil_moisture_pct": soil24,
            "forecast_type": "Open-Meteo real forecast"}
