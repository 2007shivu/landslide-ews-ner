"""Build a real-world training table from NASA COOLR + Open-Meteo.

The script downloads landslide event points from NASA COOLR, keeps events near
the NER, joins 72 hours of Open-Meteo historical precipitation/soil moisture,
and creates comparison windows that were not catalogued as events. The latter
are *catalog-negative* controls, not proof that no landslide occurred.
"""
from __future__ import annotations
import argparse, math, random, re
from datetime import date, datetime, timedelta
from pathlib import Path
import requests
import pandas as pd
from districts import NER_DISTRICTS

COOLR = "https://maps.nccs.nasa.gov/mapping/rest/services/COOLR/COOLR_Events_Point/FeatureServer/0/query"
EARTHDATA_COOLR = "https://gis.earthdata.nasa.gov/gis05/rest/services/Landslides/COOLR_Events_Points/FeatureServer/0/query"
GLC_CSV = "https://data.nasa.gov/docs/legacy/Global_Landslide_Catalog_Export/Global_Landslide_Catalog_Export_rows.csv"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
OUT = Path(__file__).resolve().parent / "data" / "real_training_data.csv"
FEATURES = ["rainfall_1h_mm","rainfall_24h_mm","rainfall_72h_mm","soil_moisture_pct","slope_deg","soil_type","vegetation_cover_pct","seismic_activity","elevation_m","historical_landslide_freq"]


def nearest_district(lat, lon):
    return min(NER_DISTRICTS, key=lambda d: (d["lat"]-lat)**2 + (d["lon"]-lon)**2)


def event_date(attrs):
    candidates = ["event_date","eventDate","eventdate","date","Date","EVENT_DATE","event_time","Event_Date"]
    for key in candidates:
        val = attrs.get(key)
        if val:
            m = re.search(r"(20\d{2})[-/](\d{1,2})[-/](\d{1,2})", str(val))
            if m:
                return date(int(m.group(1)),int(m.group(2)),int(m.group(3)))
    for val in attrs.values():
        if isinstance(val, str):
            m = re.search(r"(20\d{2})[-/](\d{1,2})[-/](\d{1,2})", val)
            if m:
                return date(int(m.group(1)),int(m.group(2)),int(m.group(3)))
    return None


def _get_json(url, params, label):
    """GET JSON with useful diagnostics instead of crashing on non-JSON replies."""
    r = requests.get(
        url,
        params=params,
        timeout=90,
        headers={"User-Agent": "NER-Landslide-EWS/1.0"},
    )
    if not r.ok:
        raise RuntimeError(
            f"{label} returned HTTP {r.status_code}. "
            f"Response starts with: {r.text[:250]!r}"
        )
    try:
        return r.json()
    except ValueError as exc:
        raise RuntimeError(
            f"{label} did not return JSON. HTTP {r.status_code}; "
            f"Content-Type={r.headers.get('content-type')!r}; "
            f"Response starts with: {r.text[:250]!r}"
        ) from exc


def _norm_col(name):
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def fetch_glc_csv(max_events):
    """Fallback to NASA's public Global Landslide Catalog CSV.

    NASA publishes this catalog as a public CSV. It is older than COOLR, but
    it is still a genuine NASA landslide inventory and is preferable to
    silently fabricating training labels.
    """
    print("Trying NASA Global Landslide Catalog CSV fallback...")
    try:
        df = pd.read_csv(GLC_CSV, low_memory=False)
    except Exception as exc:
        raise RuntimeError(f"NASA Global Landslide Catalog CSV failed: {exc}") from exc

    cols = {_norm_col(c): c for c in df.columns}
    lat_col = next((cols[k] for k in ("latitude", "lat") if k in cols), None)
    lon_col = next((cols[k] for k in ("longitude", "lon", "lng") if k in cols), None)
    date_col = next((cols[k] for k in ("eventdate", "date", "event_date", "landslideeventdate") if k in cols), None)
    title_col = next((cols[k] for k in ("eventtitle", "title", "locationdescription") if k in cols), None)
    if not (lat_col and lon_col and date_col):
        raise RuntimeError(f"Could not identify latitude/longitude/date columns in NASA GLC CSV. Columns: {list(df.columns)}")

    out = []
    for _, row in df.iterrows():
        try:
            lat, lon = float(row[lat_col]), float(row[lon_col])
            d = pd.to_datetime(row[date_col], errors="coerce")
            if pd.isna(d) or not (21 <= lat <= 29 and 87 <= lon <= 97):
                continue
            out.append({"lat": lat, "lon": lon, "date": d.date().isoformat(),
                        "title": str(row[title_col])[:200] if title_col else "NASA GLC event"})
        except (TypeError, ValueError, OverflowError):
            continue

    seen, unique = set(), []
    for r in out:
        k = (round(r["lat"], 3), round(r["lon"], 3), r["date"])
        if k not in seen:
            seen.add(k); unique.append(r)
    print(f"NASA GLC fallback found {len(unique)} NER events.")
    return unique[:max_events]


def fetch_events(max_events):
    """Fetch real NASA landslide events in the NER bounding box.

    Current COOLR/NCCS is tried first, followed by the Earthdata GIS endpoint
    and finally NASA's public GLC CSV. No synthetic event records are made.
    """
    bbox = "87,21,97,29"
    common = {
        "where": "1=1", "outFields": "*", "returnGeometry": "true",
        "geometry": bbox, "geometryType": "esriGeometryEnvelope",
        "inSR": "4326", "spatialRel": "esriSpatialRelIntersects",
        "resultRecordCount": min(2000, max(2000, max_events)),
    }
    endpoints = [
        ("NASA NCCS COOLR", COOLR),
        ("NASA Earthdata GIS COOLR", EARTHDATA_COOLR),
    ]
    last_error = None
    for label, url in endpoints:
        try:
            data = _get_json(url, {**common, "f": "geojson"}, label)
            if data.get("error"):
                raise RuntimeError(f"{label} API error: {data['error']}")
            feats = data.get("features") or []
            rows = []
            for f in feats:
                geom = f.get("geometry") or {}
                props = f.get("properties") or f.get("attributes") or {}
                coords = geom.get("coordinates") or []
                lon = lat = None
                if isinstance(coords, (list, tuple)) and len(coords) >= 2:
                    try: lon, lat = float(coords[0]), float(coords[1])
                    except (TypeError, ValueError): pass
                if lat is None or lon is None:
                    try:
                        lat = float(geom.get("y") or props.get("latitude") or props.get("lat"))
                        lon = float(geom.get("x") or props.get("longitude") or props.get("lon"))
                    except (TypeError, ValueError): continue
                if not (21 <= lat <= 29 and 87 <= lon <= 97): continue
                d = event_date(props)
                if d is None: continue
                title = props.get("event_title") or props.get("title") or props.get("event_name") or props.get("ev_title") or ""
                rows.append({"lat": lat, "lon": lon, "date": d.isoformat(), "title": str(title)[:200]})
            if rows:
                seen, out = set(), []
                for r in rows:
                    k = (round(r["lat"], 3), round(r["lon"], 3), r["date"])
                    if k not in seen: seen.add(k); out.append(r)
                print(f"{label}: found {len(out)} NER events.")
                return out[:max_events]
            last_error = RuntimeError(f"{label} returned no NER events.")
        except Exception as exc:
            last_error = exc
            print(f"{label} failed: {exc}")

    try:
        return fetch_glc_csv(max_events)
    except Exception as exc:
        raise SystemExit(f"NASA landslide data could not be loaded. Last error: {exc}") from exc


def weather_features(lat, lon, day):
    start=day-timedelta(days=3); end=day
    params={"latitude":lat,"longitude":lon,"start_date":start.isoformat(),"end_date":end.isoformat(),
            "hourly":"precipitation,soil_moisture_0_to_7cm","timezone":"auto","precipitation_unit":"mm","cell_selection":"land"}
    p=requests.get(ARCHIVE,params=params,timeout=60).json(); h=p.get("hourly",{})
    rain=[float(x or 0) for x in h.get("precipitation",[])]
    soil=h.get("soil_moisture_0_to_7cm",[])
    if len(rain)<24: raise RuntimeError("insufficient historical weather")
    r1=rain[-1]; r24=sum(rain[-24:]); r72=sum(rain[-72:])
    vals=[x for x in soil[-24:] if x is not None]
    sm=(float(vals[-1])*100) if vals else 35.0
    return r1,r24,r72,max(0,min(100,sm)),float(p.get("elevation") or 0)


def make_row(lat,lon,day,label):
    d=nearest_district(lat,lon)
    r1,r24,r72,sm,elev=weather_features(lat,lon,day)
    return {"date":day.isoformat(),"latitude":lat,"longitude":lon,**dict(zip(FEATURES,[r1,r24,r72,sm,d["slope_deg"],d["soil_type"],d["vegetation_cover_pct"],0.0,elev,d["historical_landslide_freq"]])),"risk_level":label}


def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--max-events",type=int,default=250); ap.add_argument("--seed",type=int,default=42); args=ap.parse_args()
    random.seed(args.seed); events=fetch_events(args.max_events)
    if not events: raise SystemExit("No NASA COOLR events were returned. Check internet access and the COOLR service.")
    rows=[]
    for n,e in enumerate(events,1):
        try:
            day=date.fromisoformat(e["date"]); rows.append(make_row(e["lat"],e["lon"],day,"High"))
            # catalog-negative control from the same location, separated from the event date
            offset=random.choice([30,45,60,90,120,180]); neg=day-timedelta(days=offset)
            rows.append(make_row(e["lat"],e["lon"],neg,"Low"))
            print(f"{n}/{len(events)} events processed")
        except Exception as exc:
            print(f"skip {e}: {exc}")
    if len(rows)<20: raise SystemExit("Too few usable rows. Increase --max-events or check the data services.")
    df=pd.DataFrame(rows); OUT.parent.mkdir(exist_ok=True); df.to_csv(OUT,index=False)
    print(f"Saved {len(df)} rows to {OUT}")

if __name__=="__main__": main()
