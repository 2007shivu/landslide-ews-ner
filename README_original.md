# AI-Based Landslide Early Warning & Risk Monitoring System — NER

A full-stack prototype that monitors landslide-prone districts across India's
North Eastern Region (Assam, Meghalaya, Mizoram, Manipur, Nagaland, Sikkim,
Tripura, Arunachal Pradesh), scores real-time risk with a trained machine
learning model, and raises alerts on a live dashboard.

```
landslide-ews/
├── backend/
│   ├── app.py              FastAPI server (REST API)
│   ├── model.py            Loads model.pkl, runs predictions + explanations
│   ├── train_model.py      Generates training data & trains the classifier
│   ├── data_simulator.py   15 NER district profiles + live sensor simulator
│   ├── model.pkl           Trained RandomForest (already included, pre-trained)
│   └── requirements.txt
├── frontend/
│   ├── index.html          Dashboard markup
│   ├── style.css           Visual design
│   ├── script.js           Map, polling, charts, what-if simulator
│   └── config.js           Points the UI at your backend URL
└── README.md
```

## 1. How it works

**Sensors → Features → Model → Risk level → Alerts**

1. `data_simulator.py` represents a network of ground stations — one per
   district — each reporting rainfall (1h / 24h / 72h), soil moisture,
   slope angle, soil drainage type, vegetation cover, seismic micro-tremor
   activity, elevation, and historical landslide frequency. Readings evolve
   with a random walk between polls (with occasional rain "bursts") so the
   system behaves like a real live feed rather than static demo data.
2. `train_model.py` builds a large synthetic dataset from the known
   geotechnical drivers of slope failure (antecedent rainfall is the
   strongest predictor, followed by slope angle and soil saturation),
   encodes them into a weighted risk function with noise, and trains a
   **RandomForestClassifier** to learn the risk boundary from the raw
   features — achieving ~83% test accuracy across 4 classes.
3. `model.py` loads the trained model and, for every reading, returns a
   `risk_level` (Low / Moderate / High / Critical), a continuous 0–100
   `risk_score`, class probabilities, and the top 3 contributing factors
   for that specific reading (for explainability).
4. `app.py` exposes this over a REST API that the dashboard polls every
   10 seconds.
5. The **dashboard** (`frontend/`) shows every station on a map colour-coded
   by risk, a ranked list of stations, a detail panel with live telemetry
   and a 24h trend chart for the selected station, a banner for active
   High/Critical alerts, and a **what-if simulator** to manually test how
   changing rainfall/soil/slope values shifts the predicted risk — handy
   for a live demo or viva.

## 2. Setup & run

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# model.pkl is already included, but you can retrain it any time:
python train_model.py

uvicorn app:app --reload --port 8000
```

The API is now live at `http://127.0.0.1:8000`. Interactive API docs
(Swagger UI) are auto-generated at `http://127.0.0.1:8000/docs`.

### Frontend

The frontend is plain HTML/CSS/JS — no build step. Just serve the folder:

```bash
cd frontend
python3 -m http.server 5500
```

Open `http://127.0.0.1:5500` in your browser. If your backend runs on a
different host/port, edit `frontend/config.js`.

> Keep both servers running at the same time (backend on 8000, frontend on
> 5500) — the dashboard is a client that calls the API.

## 3. API reference

| Method | Endpoint                     | Description                                   |
|--------|-------------------------------|------------------------------------------------|
| GET    | `/api/districts`              | Static list of 15 monitored districts          |
| GET    | `/api/live`                   | Live reading + risk for every station          |
| GET    | `/api/live/{district_id}`     | Live reading + risk for one station            |
| GET    | `/api/history/{district_id}`  | Hourly rainfall/soil-moisture trend (`?hours=`)|
| GET    | `/api/alerts`                 | Stations currently at High/Critical risk       |
| POST   | `/api/predict`                | What-if prediction from manual sensor values   |

## 4. Extending this into a production system

This project is built to be extended, which is worth mentioning in a demo:

- **Real sensors**: replace `data_simulator.get_live_reading()` with reads
  from actual rain gauges / soil-moisture probes / MEMS tiltmeters over
  LoRaWAN or GSM, or pull rainfall from IMD / open weather APIs.
- **Satellite data**: bring in Sentinel-1 InSAR ground-deformation data or
  Sentinel-2 NDVI (vegetation loss is a landslide precursor) as extra
  model features.
- **Notifications**: wire `/api/alerts` to Twilio SMS, WhatsApp Business
  API, or a Cell Broadcast system for last-mile warnings to villages.
- **Persistence**: add a time-series database (TimescaleDB/InfluxDB) so
  `get_history()` reflects real historical data instead of synthetic trends.
- **Retraining**: once real landslide-incident labels are collected from
  the sensor history, retrain `train_model.py` on that real dataset instead
  of the synthetic one — the pipeline (features → RandomForest → model.pkl)
  does not need to change.

## 5. Talking points for a viva / demo

- Why RandomForest: robust to noisy sensor data, gives feature importances
  for explainability, and trains fast enough to retrain often as new
  ground-truth incident data arrives — all useful for a system a district
  disaster-management office would actually operate.
- Why these features: they map directly to the standard geotechnical
  landslide-triggering factors (rainfall infiltration reducing soil shear
  strength, slope angle, drainage class, vegetation root cohesion,
  seismic loading) rather than being arbitrary.
- Why synthetic training data: honest limitation to state — real
  incident-labelled sensor datasets for NER are not publicly available in
  a clean form, so the model is trained on a physically-informed synthetic
  proxy. The architecture is designed so real data can be substituted in
  without changing the API or dashboard.
- The what-if simulator exists specifically to let you demonstrate the
  model's behaviour live without waiting for a real rain event.
