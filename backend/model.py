"""Load the real-data-trained model and produce risk + explainability."""
from pathlib import Path
import joblib, numpy as np, pandas as pd
MODEL_PATH=Path(__file__).resolve().parent/"model.pkl"
if not MODEL_PATH.exists(): raise RuntimeError("model.pkl not found. Run build_real_dataset.py then train_model.py")
_bundle=joblib.load(MODEL_PATH); _MODEL=_bundle["model"]; _FEATURES=_bundle["features"]; _LABELS=_bundle["labels"]
_WEIGHT={"Low":0,"Moderate":33,"High":66,"Critical":100}
_LABELS_H={"rainfall_1h_mm":"Hourly rainfall intensity","rainfall_24h_mm":"24-hour cumulative rainfall","rainfall_72h_mm":"72-hour antecedent rainfall","soil_moisture_pct":"Soil saturation","slope_deg":"Slope steepness","soil_type":"Soil drainage class","vegetation_cover_pct":"Vegetation cover","seismic_activity":"Seismic activity","elevation_m":"Elevation","historical_landslide_freq":"Historical landslide frequency"}
_BASE={"rainfall_1h_mm":2,"rainfall_24h_mm":10,"rainfall_72h_mm":25,"soil_moisture_pct":35,"slope_deg":20,"soil_type":0,"vegetation_cover_pct":70,"seismic_activity":0.0,"historical_landslide_freq":2}

def predict_risk(reading):
    row={f:reading.get(f,0) for f in _FEATURES}; X=pd.DataFrame([row],columns=_FEATURES)
    proba=_MODEL.predict_proba(X)[0]; classes=list(_MODEL.classes_); label=classes[int(np.argmax(proba))]
    score=sum(proba[i]*_WEIGHT.get(classes[i],50) for i in range(len(classes)))
    imp=dict(zip(_FEATURES,_MODEL.feature_importances_)); contrib=[]
    for f in _FEATURES:
        b=_BASE.get(f,0); excess=max(0,(row[f]-b)/b) if b else 0
        contrib.append((f,excess*imp.get(f,0)))
    contrib.sort(key=lambda x:-x[1]); factors=[_LABELS_H[f] for f,v in contrib[:3] if v>0] or ["Conditions within normal range"]
    return {"risk_level":label,"risk_score":round(float(score),1),"probabilities":{classes[i]:round(float(proba[i]),3) for i in range(len(classes))},"top_factors":factors}
