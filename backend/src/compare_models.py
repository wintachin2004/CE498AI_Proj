import os
 
import joblib
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report
 
from train import build_risk_table, build_features, RISK_LABELS  # noqa: E402
 
PROCESSED_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
 
 
def get_split():
    """สร้างตารางความเสี่ยง + ฟีเจอร์ + แบ่ง train/test ด้วยพารามิเตอร์เดียวกับ train.py เป๊ะ ๆ"""
    df = pd.read_csv(os.path.join(PROCESSED_DIR, "accidents_clean.csv"), encoding="utf-8-sig")
    agg = build_risk_table(df)
    X, y, encoders, feature_cols = build_features(agg)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    return X_train, X_test, y_train, y_test, encoders, feature_cols
 
 
def evaluate(name, model, X_test, y_test, results):
    pred = model.predict(X_test)
    acc = accuracy_score(y_test, pred)
    f1_macro = f1_score(y_test, pred, average="macro")
    per_class = f1_score(y_test, pred, average=None, labels=RISK_LABELS)
 
    results.append(
        {
            "model": name,
            "accuracy": round(acc, 4),
            "f1_macro": round(f1_macro, 4),
            **{f"f1_{lbl}": round(v, 4) for lbl, v in zip(RISK_LABELS, per_class)},
        }
    )
    print(f"\n=== {name} ===")
    print(f"Accuracy: {acc:.4f} | F1 (macro): {f1_macro:.4f}")
    print(classification_report(y_test, pred, labels=RISK_LABELS, zero_division=0))
 
 
def main():
    X_train, X_test, y_train, y_test, encoders, feature_cols = get_split()
    results = []
 
    # ---------- 1) Baseline: ทายกลุ่มที่พบบ่อยที่สุดเสมอ ----------
    dummy_freq = DummyClassifier(strategy="most_frequent", random_state=42)
    dummy_freq.fit(X_train, y_train)
    evaluate("Baseline: most_frequent", dummy_freq, X_test, y_test, results)
 
    # ---------- 2) Baseline: ทายตามสัดส่วนจริงของแต่ละกลุ่ม (สุ่มถ่วงน้ำหนัก) ----------
    dummy_strat = DummyClassifier(strategy="stratified", random_state=42)
    dummy_strat.fit(X_train, y_train)
    evaluate("Baseline: stratified random", dummy_strat, X_test, y_test, results)


    # ---------- 3) Logistic Regression ----------
    lr = LogisticRegression(
      max_iter=2000,
      random_state=42
    )
    lr.fit(X_train, y_train)

    joblib.dump(
      lr,
      os.path.join(MODELS_DIR, "logistic_regression_model.pkl")
    )

    evaluate(
      "Logistic Regression",
       lr,
       X_test,
       y_test,
       results
    )
 
    # ----------4 ) Random Forest (โมเดลเดิมจาก train.py) ----------
    rf_path = os.path.join(MODELS_DIR, "random_forest.pkl")
    if os.path.exists(rf_path):
        rf = joblib.load(rf_path)
    else:
        rf = RandomForestClassifier(
            n_estimators=300, max_depth=12, min_samples_leaf=3, random_state=42, n_jobs=-1
        )
        rf.fit(X_train, y_train)
    evaluate("Random Forest", rf, X_test, y_test, results)
 
    # ---------- 4) Gradient Boosting (โมเดลเดิมจาก train.py) ----------
    gb_path = os.path.join(MODELS_DIR, "gradient_boosting_model.pkl")
    if os.path.exists(gb_path):
        gb = joblib.load(gb_path)
    else:
        gb = GradientBoostingClassifier(
            n_estimators=300, max_depth=3, learning_rate=0.05, random_state=42
        )
        gb.fit(X_train, y_train)
    evaluate("Gradient Boosting", gb, X_test, y_test, results)
 
    # ---------- 5) CatBoost ----------
    try:
        from catboost import CatBoostClassifier
 
        cb = CatBoostClassifier(
            iterations=300, depth=6, learning_rate=0.05, verbose=False, random_state=42
        )
        cb.fit(X_train, y_train)
        cb.save_model(os.path.join(MODELS_DIR, "catboost_model.cbm"))
        evaluate("CatBoost", cb, X_test, y_test, results)
    except ImportError:
        print(
            "\n[ข้าม CatBoost] ยังไม่ได้ติดตั้งไลบรารี catboost ในเครื่องนี้\n"
            "ติดตั้งด้วย: pip install catboost แล้วรันสคริปต์นี้ใหม่ เพื่อรวม CatBoost ในตารางเปรียบเทียบ"
        )
 
    # ---------- 6) LightGBM ----------
    try:
        from lightgbm import LGBMClassifier
 
        lgbm = LGBMClassifier(
            n_estimators=300, max_depth=6, learning_rate=0.05,
            random_state=42, verbose=-1
        )
        lgbm.fit(X_train, y_train)
        joblib.dump(lgbm, os.path.join(MODELS_DIR, "lightgbm_model.pkl"))
        evaluate("LightGBM", lgbm, X_test, y_test, results)
    except ImportError:
        print(
            "\n[ข้าม LightGBM] ยังไม่ได้ติดตั้งไลบรารี lightgbm ในเครื่องนี้\n"
            "ติดตั้งด้วย: pip install lightgbm แล้วรันสคริปต์นี้ใหม่ เพื่อรวม LightGBM ในตารางเปรียบเทียบ"
        )
 
    # ---------- สรุปตารางเปรียบเทียบ ----------
    results_df = pd.DataFrame(results).sort_values("f1_macro", ascending=False)
    print("\n" + "=" * 60)
    print("สรุปเปรียบเทียบทุกโมเดล (เรียงตาม F1 macro):")
    print("=" * 60)
    print(results_df.to_string(index=False))
 
    out_path = os.path.join(PROCESSED_DIR, "model_comparison.csv")
    results_df.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"\nบันทึกตารางเปรียบเทียบ -> {out_path}")
 
 
if __name__ == "__main__":
    main()
 