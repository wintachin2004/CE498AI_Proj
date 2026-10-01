import os
import sys
import re
from datetime import datetime

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
predictor = RiskPredictor(model_name="lightgbm_model.pkl")
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

#Chat Bot

THAI_WEEKDAYS = [
    "จันทร์",
    "อังคาร",
    "พุธ",
    "พฤหัสบดี",
    "ศุกร์",
    "เสาร์",
    "อาทิตย์",
]


def get_current_season(month):
    """
    กำหนดฤดูกาลแบบง่ายสำหรับประเทศไทย
    ธ.ค.-ก.พ. = winter
    มี.ค.-พ.ค. = summer
    มิ.ย.-พ.ย. = rainy
    """
    if month in [12, 1, 2]:
        return "winter"
    elif month in [3, 4, 5]:
        return "summer"
    else:
        return "rainy"


def find_province(text):
    """
    หาจังหวัดจากข้อความ โดยใช้รายชื่อจังหวัดที่อยู่ใน metadata
    """
    text = text.strip()

    # ตรวจชื่อเต็มก่อน
    for province in predictor.metadata["provinces"]:
        if province in text:
            return province

    # คำเรียกที่ผู้ใช้มักใช้
    aliases = {
        "กรุงเทพ": "กรุงเทพมหานคร",
        "กทม": "กรุงเทพมหานคร",
        "กทม.": "กรุงเทพมหานคร",
    }

    for alias, province in aliases.items():
        if alias in text and province in predictor.metadata["provinces"]:
            return province

    return None


def find_hour_bin(text):
    """
    แปลงคำถาม เช่น
    ตอนนี้ / เช้า / บ่าย / เย็น
    หรือ 16:00
    ให้เป็น hour_bin ที่โมเดลรู้จัก
    """
    hour_bins = predictor.metadata["hour_bins"]

    # ถ้าพูดว่า "ตอนนี้" ใช้เวลาปัจจุบัน
    if "ตอนนี้" in text or "เวลานี้" in text:
        hour = datetime.now().hour

        for hour_bin in hour_bins:
            match = re.search(
                r"(\d{1,2}):00-(\d{1,2}):59",
                str(hour_bin)
            )

            if match:
                start = int(match.group(1))
                end = int(match.group(2))

                if start <= hour <= end:
                    return hour_bin

    # ถ้าระบุเวลา เช่น 16:00 หรือ 16 นาฬิกา
    time_match = re.search(r"(\d{1,2})(?::\d{2})?\s*(?:นาฬิกา|โมง|โมงเย็น|โมงเช้า)?", text)

    if time_match:
        hour = int(time_match.group(1))

        if 0 <= hour <= 23:
            for hour_bin in hour_bins:
                match = re.search(
                    r"(\d{1,2}):00-(\d{1,2}):59",
                    str(hour_bin)
                )

                if match:
                    start = int(match.group(1))
                    end = int(match.group(2))

                    if start <= hour <= end:
                        return hour_bin

    # ใช้ keyword ที่สื่อถึงช่วงเวลา
    keywords = [
        ["ดึก", "กลางคืน"],
        ["เช้า"],
        ["สาย"],
        ["เที่ยง", "กลางวัน"],
        ["บ่าย"],
        ["เย็น"],
        ["ค่ำ"],
    ]

    for words in keywords:
        if any(word in text for word in words):
            for hour_bin in hour_bins:
                if any(word in str(hour_bin) for word in words):
                    return hour_bin

    return None


def find_weekday(text):
    """
    หาวันในสัปดาห์จากคำถาม
    ถ้าไม่ระบุ ใช้วันนี้
    """
    for weekday in THAI_WEEKDAYS:
        if weekday in text:
            return weekday

    today = datetime.now()
    return THAI_WEEKDAYS[today.weekday()]


def chatbot_predict(province, hour_bin, weekday, season):
    level, proba = predictor.predict(
        province,
        hour_bin,
        weekday,
        season
    )

    return {
        "risk_level": str(level),
        "probabilities": {
            str(k): float(v)
            for k, v in (proba or {}).items()
        }
    }


@app.route("/api/chat", methods=["POST"])
def api_chat():
    payload = request.get_json(force=True) or {}
    message = str(payload.get("message", "")).strip()

    if not message:
        return jsonify({
            "reply": "กรุณาพิมพ์คำถามก่อนครับ"
        })

    province = find_province(message)
    hour_bin = find_hour_bin(message)
    weekday = find_weekday(message)

    now = datetime.now()
    season = get_current_season(now.month)

    # ถ้าไม่ได้ระบุจังหวัด
    if not province:
        return jsonify({
            "reply": (
                "ผมยังไม่พบชื่อจังหวัดในคำถามครับ "
                "ลองถามแบบ เช่น "
                "\"วันนี้กรุงเทพมหานครเสี่ยงไหม\""
            )
        })

    # ถ้าไม่ได้ระบุช่วงเวลา ให้ใช้ช่วงเวลาปัจจุบัน
    if not hour_bin:
        current_hour = now.hour

        for hb in predictor.metadata["hour_bins"]:
            match = re.search(
                r"(\d{1,2}):00-(\d{1,2}):59",
                str(hb)
            )

            if match:
                start = int(match.group(1))
                end = int(match.group(2))

                if start <= current_hour <= end:
                    hour_bin = hb
                    break

    # fallback ถ้าหาช่วงเวลาไม่ได้
    if not hour_bin:
        hour_bin = predictor.metadata["hour_bins"][0]

    result = chatbot_predict(
        province,
        hour_bin,
        weekday,
        season
    )

    level = result["risk_level"]
    probabilities = result["probabilities"]

    # แปลง probability เป็น %
    prob_text = ""

    order = ["ต่ำ", "ปานกลาง", "สูง", "สูงมาก"]

    for risk in order:
        if risk in probabilities:
            pct = round(probabilities[risk] * 100)
            prob_text += f"{risk} {pct}% · "

    prob_text = prob_text.rstrip(" · ")

    reply = (
        f"สำหรับ{province} "
        f"ในวัน{weekday} ช่วง{hour_bin} "
        f"ระบบประเมินความเสี่ยงอยู่ในระดับ **{level}**\n\n"
        f"ความน่าจะเป็นแต่ละระดับ: {prob_text}\n\n"
        f"ผลนี้เป็นการประเมินจากรูปแบบอุบัติเหตุในข้อมูลย้อนหลัง "
        f"ไม่ใช่การยืนยันว่าจะเกิดอุบัติเหตุจริง"
    )

    return jsonify({
        "reply": reply,
        "risk_level": level,
        "probabilities": probabilities,
        "parameters": {
            "province": province,
            "hour_bin": hour_bin,
            "weekday": weekday,
            "season": season,
        }
    })


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
