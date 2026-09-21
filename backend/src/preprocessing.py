# -*- coding: utf-8 -*-
"""
preprocessing.py
โค้ดจัดการข้อมูลอุบัติเหตุทางถนน (ปี 2019-2026)
- รวมไฟล์ CSV รายปีที่มีโครงสร้างคอลัมน์ต่างกัน ให้เป็น schema เดียวกัน
- ทำความสะอาดข้อมูล (วันที่, เวลา, พิกัด, ค่าว่าง)
- สร้างฟีเจอร์ด้านเวลา/ฤดูกาล สำหรับใช้ทำนายความเสี่ยง
"""

import glob
import os
import re

import numpy as np
import pandas as pd

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
PROCESSED_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "processed")

# แต่ละปีใช้ชื่อคอลัมน์ไม่เหมือนกัน -> แมปไปเป็นชื่อกลาง (canonical name)
COLUMN_CANDIDATES = {
    "year": ["ปีที่เกิดเหตุ"],
    "date": ["วันที่เกิดเหตุ"],
    "time": ["เวลา"],
    "agency": ["หน่วยงาน"],
    "road": ["สายทาง"],
    "km": ["ก.ม.", "KM"],
    "province": ["จังหวัด"],
    "vehicle_1": ["รถคันที่ 1", "รถคันที่1", "รถคันที่1 "],
    "location_desc": ["บริเวณที่เกิดเหตุ/ลักษณะทาง", "บริเวณที่เกิดเหตุ"],
    "cause": ["มูลเหตุสันนิษฐาน"],
    "accident_type": ["ลักษณะการเกิดอุบัติเหตุ", "ลักษณะการเกิดเหตุ"],
    "weather": ["สภาพอากาศ"],
    "lat": ["LATITUDE"],
    "lon": ["LONGITUDE"],
    "vehicle_count": [
        "จำนวนรถที่เกิดเหตุ (รวมคันที่ 1)",
        "จำนวนรถที่เกิดเหตุ(รวมคันที่1)",
    ],
    "deaths": ["จำนวนผู้เสียชีวิต", "ผู้เสียชีวิต"],
    "injuries_serious": ["จำนวนผู้บาดเจ็บสาหัส", "ผู้บาดเจ็บสาหัส"],
    "injuries_minor": ["จำนวนผู้บาดเจ็บเล็กน้อย", "ผู้บาดเจ็บเล็กน้อย"],
    "injuries_total": ["รวมจำนวนผู้บาดเจ็บ"],
}

WEATHER_MAP = {
    "แจ่มใส": "clear",
    "มีหมอก/ควัน/ฝุ่น": "fog_smoke_dust",
    "มืดครึ้ม": "overcast",
    "ฝนตก": "rain",
    "อื่นๆ": "other",
    "ภัยธรรมชาติ เช่น พายุ น้ำท่วม": "storm_flood",
    "ดินถล่ม": "landslide",
}

# ฤดูกาลของไทย (ประมาณการแบบกว้าง ๆ)
def month_to_season(m):
    if m in (3, 4, 5):
        return "summer"          # ฤดูร้อน
    if m in (6, 7, 8, 9, 10):
        return "rainy"           # ฤดูฝน
    return "winter"              # ฤดูหนาว (11,12,1,2)


def find_column(df_cols, candidates):
    for c in candidates:
        if c in df_cols:
            return c
    return None


def load_and_unify_one(path):
    df = pd.read_csv(path, encoding="utf-8-sig", low_memory=False)
    cols = df.columns.tolist()

    out = pd.DataFrame()
    for canon, candidates in COLUMN_CANDIDATES.items():
        col = find_column(cols, candidates)
        out[canon] = df[col] if col is not None else np.nan

    out["source_file"] = os.path.basename(path)
    return out


def _parse_date_mixed(s):
    """ไฟล์แต่ละปีมีรูปแบบวันที่ปนกัน: d/m/Y, m/d/Y, และเลข serial ของ Excel"""
    s = str(s).strip()
    if s in ("nan", "", "None"):
        return pd.NaT

    # เลข serial แบบ Excel (จำนวนวันนับจาก 1899-12-30)
    if re.fullmatch(r"\d{4,6}", s):
        try:
            return pd.Timestamp("1899-12-30") + pd.Timedelta(days=int(s))
        except Exception:
            return pd.NaT

    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if not m:
        return pd.NaT
    a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))

    # ถ้าตัวแรก > 12 ต้องเป็น d/m/Y, ถ้าตัวที่สอง > 12 ต้องเป็น m/d/Y
    if a > 12 and b <= 12:
        day, month = a, b
    elif b > 12 and a <= 12:
        day, month = b, a
    else:
        # กำกวม (ทั้งคู่ <=12) -> ข้อมูลชุดนี้ส่วนใหญ่เป็น d/m/Y ให้ยึดตามนั้น
        day, month = a, b
    try:
        return pd.Timestamp(year=y, month=month, day=day)
    except Exception:
        return pd.NaT


def _parse_time_mixed(s):
    """เวลาปนกันระหว่าง 'HH:MM' และเลขเศษส่วนวันแบบ Excel (เช่น 0.375 = 09:00)"""
    s = str(s).strip()
    if s in ("nan", "", "None"):
        return (np.nan, np.nan)

    m = re.match(r"^(\d{1,2}):(\d{2})", s)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23:
            return (h, mi)

    try:
        frac = float(s)
        if 0 <= frac < 1:
            total_min = round(frac * 24 * 60)
            h, mi = divmod(total_min, 60)
            if 0 <= h <= 23:
                return (h, mi)
    except Exception:
        pass
    return (np.nan, np.nan)


def clean(df):
    # --- วันที่ / เวลา ---
    df["date"] = df["date"].astype(str).str.strip()
    df["time"] = df["time"].astype(str).str.strip()

    df["date_parsed"] = df["date"].apply(_parse_date_mixed)

    time_pairs = df["time"].apply(_parse_time_mixed)
    df["hour"] = time_pairs.apply(lambda t: t[0])
    df["minute"] = time_pairs.apply(lambda t: t[1])

    # --- ทิ้งแถวที่ไม่มีวันที่หรือเวลาที่ใช้งานได้ ---
    df = df[df["date_parsed"].notna() & df["hour"].notna()].copy()

    df["year"] = df["date_parsed"].dt.year
    df["month"] = df["date_parsed"].dt.month
    df["day"] = df["date_parsed"].dt.day
    df["weekday"] = df["date_parsed"].dt.weekday  # 0=จันทร์ ... 6=อาทิตย์
    df["weekday_name_th"] = df["weekday"].map(
        {0: "จันทร์", 1: "อังคาร", 2: "พุธ", 3: "พฤหัสบดี", 4: "ศุกร์", 5: "เสาร์", 6: "อาทิตย์"}
    )
    df["is_weekend"] = df["weekday"].isin([5, 6]).astype(int)
    df["season"] = df["month"].apply(month_to_season)

    # ช่วงเวลา (time bin) สำหรับ dashboard และโมเดล
    def hour_bin(h):
        h = int(h)
        if 0 <= h < 6:
            return "กลางดึก (00:00-05:59)"
        if 6 <= h < 9:
            return "เร่งด่วนเช้า (06:00-08:59)"
        if 9 <= h < 16:
            return "กลางวัน (09:00-15:59)"
        if 16 <= h < 19:
            return "เร่งด่วนเย็น (16:00-18:59)"
        return "หัวค่ำ-ดึก (19:00-23:59)"

    df["hour_bin"] = df["hour"].apply(hour_bin)

    # --- พิกัด ---
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    # กรอบพิกัดคร่าว ๆ ของประเทศไทย กันข้อมูลพิกัดผิดเพี้ยน
    valid_coord = df["lat"].between(5, 21) & df["lon"].between(97, 106)
    df.loc[~valid_coord, ["lat", "lon"]] = np.nan

    # --- ตัวเลขผู้บาดเจ็บ/เสียชีวิต ---
    for c in ["deaths", "injuries_serious", "injuries_minor", "injuries_total", "vehicle_count"]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

    df["severity_score"] = df["deaths"] * 3 + df["injuries_serious"] * 2 + df["injuries_minor"] * 1
    df["is_fatal"] = (df["deaths"] > 0).astype(int)

    # --- สภาพอากาศ ---
    df["weather"] = df["weather"].astype(str).str.strip()
    df["weather_en"] = df["weather"].map(WEATHER_MAP).fillna("unknown")

    # --- จังหวัด / ถนน ทำความสะอาดช่องว่าง ---
    df["province"] = df["province"].astype(str).str.strip()
    df["road"] = df["road"].astype(str).str.strip()

    keep_cols = [
        "year", "date_parsed", "hour", "minute", "hour_bin", "month", "day",
        "weekday", "weekday_name_th", "is_weekend", "season",
        "province", "road", "km", "agency",
        "cause", "accident_type", "location_desc",
        "weather", "weather_en",
        "vehicle_count", "deaths", "injuries_serious", "injuries_minor",
        "injuries_total", "severity_score", "is_fatal",
        "lat", "lon", "source_file",
    ]
    df = df[keep_cols].rename(columns={"date_parsed": "date"})
    return df


def main():
    files = sorted(glob.glob(os.path.join(RAW_DIR, "accident*.csv")))
    print(f"พบไฟล์ข้อมูลดิบ {len(files)} ไฟล์")

    frames = []
    for f in files:
        raw = load_and_unify_one(f)
        frames.append(raw)
        print(f"  - {os.path.basename(f)}: {len(raw):,} แถว")

    df = pd.concat(frames, ignore_index=True)
    print(f"รวมทั้งหมดก่อนทำความสะอาด: {len(df):,} แถว")

    df = clean(df)
    print(f"หลังทำความสะอาด (มีวันที่/เวลาใช้งานได้): {len(df):,} แถว")
    print(f"แถวที่มีพิกัด lat/lon ใช้งานได้: {df['lat'].notna().sum():,} แถว")

    os.makedirs(PROCESSED_DIR, exist_ok=True)
    out_path = os.path.join(PROCESSED_DIR, "accidents_clean.csv")
    df.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"บันทึกไฟล์ที่ทำความสะอาดแล้ว -> {out_path}")

    return df


if __name__ == "__main__":
    main()
