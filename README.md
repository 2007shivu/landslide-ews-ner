# NER Landslide Early Warning System — Real World Data Version

This version removes the simulated sensor backend and the synthetic training-data generator. The dashboard remains the same API client, but the backend now gets rainfall, soil moisture and elevation from Open-Meteo and the training pipeline can build labelled observations from NASA COOLR landslide events plus Open-Meteo historical data.

## What changed
- Removed `data_simulator.py` from the runtime.
- Added `backend/districts.py` for station metadata only.
- Added `backend/real_data.py` for real current/forecast/history weather data.
- Replaced synthetic `train_model.py` with real-data training.
- Added `backend/build_real_dataset.py` to create `data/real_training_data.csv` from NASA COOLR + Open-Meteo.
- Added `backend/evaluate_model.py` and `data/evaluation.json` for model validation.
- The forecast endpoint now uses real Open-Meteo forecast rainfall instead of multiplying simulated rainfall by fixed factors.

## Run the project

### 1. Install
```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
```

### 2. Download real training data
```bash
python build_real_dataset.py --max-events 250
```

This downloads NASA COOLR event points in the NER region and joins them with Open-Meteo historical weather. It does not create synthetic samples. The negative controls are explicitly documented as catalog-negative, because a global landslide catalogue is incomplete.

### 3. Train and evaluate the AI
```bash
python train_model.py
python evaluate_model.py
```

`train_model.py` creates `model.pkl` only after real training data exists. `evaluation.json` stores accuracy, precision, recall, F1 and the confusion matrix.

### 4. Start backend
```bash
uvicorn app:app --reload --port 8000
```

Swagger: `http://127.0.0.1:8000/docs`

### 5. Start frontend
```bash
cd ../frontend
python -m http.server 5500
```
Open `http://127.0.0.1:5500`.

## How to check whether the AI works
Do not use only accuracy. Inspect class-wise recall and the confusion matrix. For an early-warning system, a dangerous error is a real High/Critical event being classified as Low. The training script reports these metrics so you can show them in your project/viva.

## Data-source references
Open-Meteo documents historical weather/reanalysis and hourly precipitation/soil-moisture variables. NASA COOLR provides open landslide event/report data. These are external real-world sources; the application intentionally fails rather than inventing values when a required source is unavailable.
