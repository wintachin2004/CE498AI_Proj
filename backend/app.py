import os
import sys

import pandas as pd
from flask import Flask, jsonify, render_template, request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))
from predict import RiskPredictor 

BASE_DIR = os.path.dirname(__file__)
DATA_PATH = os.path.join(BASE_DIR, "data", "processed", "accidents_clean.csv")

FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")
TEMPLATE_DIR = os.path.join(FRONTEND_DIR, "templates")
STATIC_DIR = os.path.join(FRONTEND_DIR, "static")

app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=STATIC_DIR)

print("กำลังโหลดข้อมูลและโมเดล ...")
df = pd.read_csv(DATA_PATH, encoding="utf-8-sig")
predictor = RiskPredictor()
print(f"โหลดข้อมูลสำเร็จ: {len(df):,} แถว")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/options")
def api_options():
    return jsonify(predictor.options())

@app.route("/api/predict", methods=["POST"])
def api_predict():
    payload = request.get_json(force=True)
    province = payload.get("province")
    hour_bin = payload.get("hour_bin")
    weekday = payload.get("weekday")
    season = payload.get("season")

    level, proba = predictor.predict(province, hour_bin, weekday, season)
    proba_out = {str(k): float(v) for k, v in (proba or {}).items()}
    return jsonify({"risk_level": str(level), "probabilities": proba_out})

@app.route("/api/summary")
def api_summary():
    return jsonify(
        {
            "total_accidents": int(len(df)),
            "total_deaths": int(df["deaths"].sum()),
            "total_injuries": int(df["injuries_total"].sum()),
            "years_covered": f"{int(df['year'].min())}-{int(df['year'].max())}",
            "provinces_covered": int(df["province"].nunique()),
        }
    )


@app.route("/api/stats/by_hour")
def stats_by_hour():
    g = df.groupby("hour").size().reindex(range(24), fill_value=0)
    return jsonify({"labels": [f"{h:02d}:00" for h in g.index], "values": g.values.tolist()})


@app.route("/api/stats/by_hour_bin")
def stats_by_hour_bin():
    order = predictor.metadata["hour_bins"]
    g = df.groupby("hour_bin").size().reindex(order, fill_value=0)
    return jsonify({"labels": g.index.tolist(), "values": g.values.tolist()})


@app.route("/api/stats/by_weekday")
def stats_by_weekday():
    order = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]
    g = df.groupby("weekday_name_th").size().reindex(order, fill_value=0)
    return jsonify({"labels": g.index.tolist(), "values": g.values.tolist()})


@app.route("/api/stats/by_month")
def stats_by_month():
    g = df.groupby("month").size().reindex(range(1, 13), fill_value=0)
    th_months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                 "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
    return jsonify({"labels": th_months, "values": g.values.tolist()})


@app.route("/api/stats/top_provinces")
def stats_top_provinces():
    g = df.groupby("province").size().sort_values(ascending=False).head(10)
    return jsonify({"labels": g.index.tolist(), "values": g.values.tolist()})


@app.route("/api/stats/by_weather")
def stats_by_weather():
    g = df.groupby("weather").size().sort_values(ascending=False)
    g = g[g.index.notna() & (g.index != "nan")]
    return jsonify({"labels": g.index.tolist(), "values": g.values.tolist()})


@app.route("/api/stats/top_causes")
def stats_top_causes():
    g = df.groupby("cause").size().sort_values(ascending=False).head(10)
    g = g[g.index.notna()]
    return jsonify({"labels": g.index.tolist(), "values": g.values.tolist()})


@app.route("/api/stats/by_year")
def stats_by_year():
    g = df.groupby("year").agg(accidents=("province", "size"), deaths=("deaths", "sum"))
    return jsonify(
        {
            "labels": [str(int(y)) for y in g.index],
            "accidents": g["accidents"].values.tolist(),
            "deaths": g["deaths"].values.tolist(),
        }
    )


@app.route("/api/stats/heatmap")
def stats_heatmap():
    order = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]
    pivot = (
        df.groupby(["weekday_name_th", "hour"])
        .size()
        .unstack(fill_value=0)
        .reindex(order)
        .reindex(columns=range(24), fill_value=0)
    )
    return jsonify(
        {
            "weekdays": order,
            "hours": [f"{h:02d}" for h in range(24)],
            "matrix": pivot.values.tolist(),
        }
    )


@app.route("/api/map_points")
def map_points():
    province = request.args.get("province")
    sub = df[df["lat"].notna() & df["lon"].notna()]
    if province:
        sub = sub[sub["province"] == province]
    sub = sub.sample(n=min(2000, len(sub)), random_state=1) if len(sub) > 2000 else sub
    points = sub[["lat", "lon", "province", "severity_score"]].to_dict(orient="records")
    return jsonify(points)


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
