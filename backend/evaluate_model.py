"""Evaluate the trained model and print safety-relevant metrics."""
from pathlib import Path
import json
p=Path(__file__).resolve().parent/"data"/"evaluation.json"
if not p.exists(): raise SystemExit("No evaluation.json. Run train_model.py first.")
d=json.loads(p.read_text())
print(f"Samples: {d['n_samples']}")
print(f"Accuracy: {d['accuracy']:.4f}")
print("\nClass metrics:")
for k,v in d['classification_report'].items():
    if isinstance(v,dict) and 'precision' in v: print(f"{k:10s} precision={v['precision']:.3f} recall={v['recall']:.3f} f1={v['f1-score']:.3f} support={v['support']}")
print("\nConfusion matrix labels:",d['labels'])
for row in d['confusion_matrix']: print(row)
