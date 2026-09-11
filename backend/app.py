
"""FastAPI backend using real Open-Meteo environmental data."""

from pathlib import Path
import sqlite3

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from districts import NER_DISTRICTS, find_district
from real_data import get_live_reading, get_history, get_forecast
from model import predict_risk


app = FastAPI(
    title="NER Landslide Early Warning System - Real Data",
    version="2.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)


# =========================================================
# DATABASE
# =========================================================

BASE_DIR = Path(__file__).resolve().parent
DB_FILE = BASE_DIR / "reports.db"


def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            report_type TEXT NOT NULL,
            description TEXT,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL
        )
    """)

    conn.commit()
    conn.close()


init_db()


# =========================================================
# DATA MODELS
# =========================================================

class ManualReading(BaseModel):
    rainfall_1h_mm: float = Field(0, ge=0, le=200)
    rainfall_24h_mm: float = Field(0, ge=0, le=800)
    rainfall_72h_mm: float = Field(0, ge=0, le=1500)

    soil_moisture_pct: float = Field(30, ge=0, le=100)
    slope_deg: float = Field(20, ge=0, le=90)
    soil_type: int = Field(0, ge=0, le=2)

    vegetation_cover_pct: float = Field(50, ge=0, le=100)
    seismic_activity: float = Field(0, ge=0, le=10)
    elevation_m: float = Field(500, ge=0, le=9000)

    historical_landslide_freq: int = Field(2, ge=0, le=50)


class CitizenReport(BaseModel):
    name: str = Field("Anonymous", max_length=100)
    report_type: str = Field(..., max_length=50)
    description: str = Field("", max_length=500)

    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "data_source": "Open-Meteo",
        "model_source": "real-world training dataset"
    }


# =========================================================
# DISTRICTS
# =========================================================

@app.get("/api/districts")
def districts():
    return NER_DISTRICTS


# =========================================================
# RISK ASSESSMENT
# =========================================================

def _assess(d):
    reading = get_live_reading(d)
    risk = predict_risk(reading)

    return {
        "district_id": d["id"],
        "name": d["name"],
        "state": d["state"],
        "lat": d["lat"],
        "lon": d["lon"],
        "reading": reading,
        "risk": risk
    }


# =========================================================
# LIVE RISK DATA
# =========================================================

@app.get("/api/live")
def live():
    results = [
        _assess(d)
        for d in NER_DISTRICTS
    ]

    results.sort(
        key=lambda r: -r["risk"]["risk_score"]
    )

    return {
        "count": len(results),
        "stations": results
    }


# =========================================================
# LIVE DATA FOR ONE DISTRICT
# =========================================================

@app.get("/api/live/{district_id}")
def live_one(district_id: str):
    d = find_district(district_id)

    if not d:
        raise HTTPException(
            status_code=404,
            detail="Unknown district id"
        )

    return _assess(d)


# =========================================================
# HISTORICAL DATA
# =========================================================

@app.get("/api/history/{district_id}")
def history(
    district_id: str,
    hours: int = 24
):
    d = find_district(district_id)

    if not d:
        raise HTTPException(
            status_code=404,
            detail="Unknown district id"
        )

    safe_hours = max(
        6,
        min(hours, 168)
    )

    return {
        "district_id": district_id,
        "hours": safe_hours,
        "points": get_history(
            d,
            safe_hours
        )
    }


# =========================================================
# FORECAST
# =========================================================

@app.get("/api/forecast/{district_id}")
def forecast(district_id: str):
    d = find_district(district_id)

    if not d:
        raise HTTPException(
            status_code=404,
            detail="Unknown district id"
        )

    current = get_live_reading(d)
    f = get_forecast(d)

    future = current.copy()

    if f["6h_mm"]:
        future["rainfall_1h_mm"] = f["6h_mm"] / 6
    else:
        future["rainfall_1h_mm"] = current["rainfall_1h_mm"]

    future["rainfall_24h_mm"] = (
        current["rainfall_24h_mm"]
        + f["24h_mm"]
    )

    future["rainfall_72h_mm"] = (
        current["rainfall_72h_mm"]
        + f["24h_mm"]
    )

    if f.get("forecast_soil_moisture_pct") is not None:
        future["soil_moisture_pct"] = (
            f["forecast_soil_moisture_pct"]
        )

    return {
        "district_id": d["id"],
        "name": d["name"],
        "state": d["state"],

        "current_rainfall": {
            "1h_mm": current["rainfall_1h_mm"],
            "24h_mm": current["rainfall_24h_mm"],
            "72h_mm": current["rainfall_72h_mm"]
        },

        "forecast": {
            "6h_mm": f["6h_mm"],
            "12h_mm": f["12h_mm"],
            "24h_mm": f["24h_mm"]
        },

        "forecast_soil_moisture_pct":
            future["soil_moisture_pct"],

        "risk": predict_risk(future),

        "forecast_type":
            f["forecast_type"]
    }


# =========================================================
# ALERTS
# =========================================================

@app.get("/api/alerts")
def alerts():
    results = [
        _assess(d)
        for d in NER_DISTRICTS
    ]

    flagged = [
        r
        for r in results
        if r["risk"]["risk_level"]
        in ("High", "Critical")
    ]

    flagged.sort(
        key=lambda r: -r["risk"]["risk_score"]
    )

    return {
        "count": len(flagged),
        "alerts": flagged
    }


# =========================================================
# AI PREDICTION / WHAT-IF SIMULATOR
# =========================================================

@app.post("/api/predict")
def predict(reading: ManualReading):
    result = predict_risk(
        reading.model_dump()
    )

    return {
        "input": reading.model_dump(),
        "risk": result
    }


# =========================================================
# CITIZEN REPORT - CREATE
# =========================================================

@app.post("/api/reports")
def create_report(report: CitizenReport):

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute(
        """
        INSERT INTO reports (
            name,
            report_type,
            description,
            latitude,
            longitude
        )
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            report.name,
            report.report_type,
            report.description,
            report.latitude,
            report.longitude
        )
    )

    report_id = cursor.lastrowid

    conn.commit()
    conn.close()

    return {
        "message": "Citizen report submitted successfully",
        "report": {
            "id": report_id,
            **report.model_dump()
        }
    }


# =========================================================
# CITIZEN REPORT - GET ALL
# =========================================================

@app.get("/api/reports")
def reports():

    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row

    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT
            id,
            name,
            report_type,
            description,
            latitude,
            longitude
        FROM reports
        ORDER BY id DESC
        """
    )

    rows = cursor.fetchall()

    conn.close()

    return {
        "reports": [
            dict(row)
            for row in rows
        ]
    }

