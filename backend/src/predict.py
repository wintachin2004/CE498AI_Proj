import os
import joblib
import numpy as np
import pandas as pd

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


class RiskPredictor:
    def __init__(self, model_name="lightgbm_model.pkl"):
        self.metadata = joblib.load(os.path.join(MODELS_DIR, "metadata.pkl"))
        self.model = joblib.load(os.path.join(MODELS_DIR, model_name))
        self.encoders = self.metadata["encoders"]
        self.feature_cols = self.metadata["feature_cols"]

    def _encode(self, province, hour_bin, weekday_name_th, season):
        row = {}
        raw = {
            "province": province,
            "hour_bin": hour_bin,
            "weekday_name_th": weekday_name_th,
            "season": season,
        }
        for col, value in raw.items():
            le = self.encoders[col]
            if value in le.classes_:
                row[col + "_enc"] = le.transform([value])[0]
            else:
                # ค่าที่ไม่เคยเห็นตอนเทรน -> ใช้ค่าที่พบบ่อยที่สุด (index 0) เป็นค่าประมาณ
                row[col + "_enc"] = 0
        return pd.DataFrame([row])[self.feature_cols]

    def predict(self, province, hour_bin, weekday_name_th, season):
        X = self._encode(province, hour_bin, weekday_name_th, season)
        pred = self.model.predict(X)[0]
        proba = None
        if hasattr(self.model, "predict_proba"):
            proba = dict(zip(self.model.classes_, self.model.predict_proba(X)[0].round(3)))
        return pred, proba

    def options(self):
        return {
            "provinces": self.metadata["provinces"],
            "hour_bins": self.metadata["hour_bins"],
            "weekdays": self.metadata["weekdays"],
            "seasons": self.metadata["seasons"],
        }


if __name__ == "__main__":
    predictor = RiskPredictor()
    province = "กรุงเทพมหานคร"
    hour_bin = "เร่งด่วนเย็น (16:00-18:59)"
    weekday = "ศุกร์"
    season = "rainy"

    level, proba = predictor.predict(province, hour_bin, weekday, season)
    print(f"จังหวัด: {province} | ช่วงเวลา: {hour_bin} | วัน: {weekday} | ฤดูกาล: {season}")
    print(f"ระดับความเสี่ยงที่ทำนายได้: {level}")
    print("ความน่าจะเป็นแต่ละระดับ:", proba)
