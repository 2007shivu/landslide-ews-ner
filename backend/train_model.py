"""Train the Random Forest on REAL downloaded observations only."""
from pathlib import Path
import json, joblib, pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, precision_recall_fscore_support
from sklearn.model_selection import train_test_split

BASE=Path(__file__).resolve().parent
DATA=BASE/"data"/"real_training_data.csv"
MODEL=BASE/"model.pkl"
FEATURES=["rainfall_1h_mm","rainfall_24h_mm","rainfall_72h_mm","soil_moisture_pct","slope_deg","soil_type","vegetation_cover_pct","seismic_activity","elevation_m","historical_landslide_freq"]
LABELS=["Low","Moderate","High","Critical"]

def train():
    if not DATA.exists(): raise SystemExit("Missing data/real_training_data.csv. Run: python build_real_dataset.py")
    df=pd.read_csv(DATA).dropna(subset=FEATURES+["risk_level"])
    if df["risk_level"].nunique()<2: raise SystemExit("Training data needs at least two classes.")
    X=df[FEATURES]; y=df["risk_level"].astype(str)
    Xtr,Xte,ytr,yte=train_test_split(X,y,test_size=.2,random_state=42,stratify=y)
    clf=RandomForestClassifier(n_estimators=300,max_depth=12,min_samples_leaf=3,class_weight="balanced",random_state=42,n_jobs=-1)
    clf.fit(Xtr,ytr); pred=clf.predict(Xte)
    print("Accuracy:",round(accuracy_score(yte,pred),4)); print(classification_report(yte,pred,zero_division=0))
    labels=sorted(set(yte)|set(pred)); print("Confusion matrix labels:",labels); print(confusion_matrix(yte,pred,labels=labels))
    report={"accuracy":accuracy_score(yte,pred),"classification_report":__import__('sklearn').metrics.classification_report(yte,pred,output_dict=True,zero_division=0),"confusion_matrix":confusion_matrix(yte,pred,labels=labels).tolist(),"labels":labels,"n_samples":len(df)}
    (BASE/"data"/"evaluation.json").write_text(json.dumps(report,indent=2))
    joblib.dump({"model":clf,"features":FEATURES,"labels":LABELS,"training_source":"NASA COOLR + Open-Meteo real-world observations"},MODEL,compress=3)
    print("Saved",MODEL); print("Saved",BASE/"data"/"evaluation.json")
if __name__=="__main__": train()
