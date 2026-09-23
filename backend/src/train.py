import os

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score, f1_score
from sklearn.preprocessing import LabelEncoder

PROCESSED_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")

RISK_LABELS = ["ต่ำ", "ปานกลาง", "สูง", "สูงมาก"]


def build_risk_table(df):
    """รวมข้อมูลเป็นระดับ จังหวัด x ช่วงชั่วโมง(hour_bin) x วันในสัปดาห์ x ฤดูกาล
    แล้วคำนวณคะแนนความเสี่ยงจากความถี่และความรุนแรง"""

    group_cols = ["province", "hour_bin", "weekday_name_th", "season"]
    agg = (
        df.groupby(group_cols)
        .agg(
            accident_count=("province", "size"),
            deaths=("deaths", "sum"),
            injuries=("injuries_total", "sum"),
            severity_sum=("severity_score", "sum"),
        )
        .reset_index()
    )
    n_years = df["year"].nunique()
    agg["accidents_per_year"] = agg["accident_count"] / max(n_years, 1)

    agg["risk_score_raw"] = agg["accidents_per_year"] + 0.5 * (agg["severity_sum"] / max(n_years, 1))

    agg["risk_level"] = pd.qcut(
        agg["risk_score_raw"].rank(method="first"),
        q=4,
        labels=RISK_LABELS,
    )

    return agg


def build_features(agg):
    feats = agg.copy()

    encoders = {}
    for col in ["province", "hour_bin", "weekday_name_th", "season"]:
        le = LabelEncoder()
        feats[col + "_enc"] = le.fit_transform(feats[col].astype(str))
        encoders[col] = le

    feature_cols = [c + "_enc" for c in ["province", "hour_bin", "weekday_name_th", "season"]]
    X = feats[feature_cols]
    y = feats["risk_level"].astype(str)

    return X, y, encoders, feature_cols


def main():
    clean_path = os.path.join(PROCESSED_DIR, "accidents_clean.csv")
    df = pd.read_csv(clean_path, encoding="utf-8-sig")
    print(f"โหลดข้อมูลที่ทำความสะอาดแล้ว: {len(df):,} แถว")

    agg = build_risk_table(df)
    print(f"สร้างตารางความเสี่ยง (จังหวัด x ช่วงเวลา x วัน x ฤดูกาล): {len(agg):,} กลุ่ม")
    print(agg["risk_level"].value_counts())

    os.makedirs(PROCESSED_DIR, exist_ok=True)
    agg.to_csv(os.path.join(PROCESSED_DIR, "risk_table.csv"), index=False, encoding="utf-8-sig")

    X, y, encoders, feature_cols = build_features(agg)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    os.makedirs(MODELS_DIR, exist_ok=True)

    rf = RandomForestClassifier(
        n_estimators=300, max_depth=12, min_samples_leaf=3, random_state=42, n_jobs=-1
    )
    rf.fit(X_train, y_train)
    rf_pred = rf.predict(X_test)
    print("\n=== Random Forest ===")
    print("Accuracy:", accuracy_score(y_test, rf_pred))
    print("F1 (macro):", f1_score(y_test, rf_pred, average="macro"))
    print(classification_report(y_test, rf_pred))
    joblib.dump(rf, os.path.join(MODELS_DIR, "random_forest.pkl"))

    # --- Gradient Boosting (ใช้แทน CatBoost ในกรณีไม่ได้ติดตั้ง catboost) ---
    gb = GradientBoostingClassifier(
        n_estimators=300, max_depth=3, learning_rate=0.05, random_state=42
    )
    gb.fit(X_train, y_train)
    gb_pred = gb.predict(X_test)
    print("\n=== Gradient Boosting ===")
    print("Accuracy:", accuracy_score(y_test, gb_pred))
    print("F1 (macro):", f1_score(y_test, gb_pred, average="macro"))
    print(classification_report(y_test, gb_pred))
    joblib.dump(gb, os.path.join(MODELS_DIR, "gradient_boosting_model.pkl"))

    #LightGBM
    try:
        from lightgbm import LGBMClassifier
 
        lgbm = LGBMClassifier(
            n_estimators=300, max_depth=6, learning_rate=0.05,
            random_state=42, verbose=-1
        )
        lgbm.fit(X_train, y_train)
        lgbm_pred = lgbm.predict(X_test)
        print("\n=== LightGBM ===")
        print("Accuracy:", accuracy_score(y_test, lgbm_pred))
        print("F1 (macro):", f1_score(y_test, lgbm_pred, average="macro"))
        print(classification_report(y_test, lgbm_pred))
        joblib.dump(lgbm, os.path.join(MODELS_DIR, "lightgbm_model.pkl"))
        print("บันทึกโมเดล LightGBM แล้ว -> models/lightgbm_model.pkl")
    except ImportError:
        print("\n(ข้าม LightGBM: ยังไม่ได้ติดตั้งไลบรารี lightgbm ในเครื่องนี้ "
              "ถ้าต้องการใช้ ให้ pip install lightgbm แล้วรัน train.py ใหม่)")

    # ลองเทรนด้วย CatBoost ถ้ามีติดตั้งในเครื่อง (ไม่บังคับ)
    try:
        from catboost import CatBoostClassifier

        cb = CatBoostClassifier(
            iterations=300, depth=6, learning_rate=0.05, verbose=False, random_state=42
        )
        cb.fit(X_train, y_train)
        cb.save_model(os.path.join(MODELS_DIR, "catboost_model.cbm"))
        print("\nบันทึกโมเดล CatBoost แล้ว -> models/catboost_model.cbm")
    except ImportError:
        print("\n(ข้าม CatBoost: ยังไม่ได้ติดตั้งไลบรารี catboost ในเครื่องนี้ "
              "ถ้าต้องการใช้ ให้ pip install catboost แล้วรัน train.py ใหม่)")

    # --- บันทึก encoders + feature columns + ตัวเลือกที่มีจริง สำหรับใช้ตอน predict ---
    joblib.dump(
        {
            "encoders": encoders,
            "feature_cols": feature_cols,
            "risk_labels_order": RISK_LABELS,
            "provinces": sorted(agg["province"].unique().tolist()),
            "hour_bins": sorted(agg["hour_bin"].unique().tolist()),
            "weekdays": ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"],
            "seasons": sorted(agg["season"].unique().tolist()),
        },
        os.path.join(MODELS_DIR, "metadata.pkl"),
    )
    print("\nบันทึก metadata (ตัวเข้ารหัส + ตัวเลือกฟีเจอร์) -> models/metadata.pkl")
    print("เทรนโมเดลเสร็จสมบูรณ์")


if __name__ == "__main__":
    main()
