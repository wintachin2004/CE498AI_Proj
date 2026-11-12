
import os
import uuid
import sqlite3
from datetime import datetime, timezone

from flask import (
    Blueprint, request, jsonify, current_app,
    send_from_directory
)

from auth import token_required


accident_reports_bp = Blueprint(
    "accident_reports",
    __name__,
    url_prefix="/api/accidents"
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "users.db")
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads", "accidents")

ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
}

MAX_IMAGE_SIZE = 8 * 1024 * 1024  # 8 MB


def init_accident_reports_db():
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS accident_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            category TEXT,
            severity TEXT,
            description TEXT,
            occurred_at TEXT,
            image_filename TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()


@accident_reports_bp.route("/report", methods=["POST"])
@token_required
def create_accident_report():
    image = request.files.get("image")

    if not image:
        return jsonify({"error": "กรุณาแนบรูปภาพอุบัติเหตุ"}), 400

    extension = ALLOWED_TYPES.get(image.mimetype)

    if not extension:
        return jsonify({
            "error": "รองรับเฉพาะไฟล์ JPG, PNG และ WEBP"
        }), 400

    if request.content_length and request.content_length > MAX_IMAGE_SIZE + 1024 * 1024:
        return jsonify({"error": "ขนาดไฟล์ใหญ่เกินไป"}), 413

    try:
        latitude = float(request.form.get("latitude"))
        longitude = float(request.form.get("longitude"))

        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError("พิกัดไม่ถูกต้อง")

    except (TypeError, ValueError):
        return jsonify({"error": "กรุณาระบุพิกัดให้ถูกต้อง"}), 400

    if image.content_length and image.content_length > MAX_IMAGE_SIZE:
        return jsonify({"error": "รูปภาพต้องมีขนาดไม่เกิน 8 MB"}), 413

    category = request.form.get("category", "").strip()
    severity = request.form.get("severity", "").strip()
    description = request.form.get("description", "").strip()
    occurred_at = request.form.get("occurred_at", "").strip()

    filename = f"{uuid.uuid4().hex}{extension}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    try:
        image.save(filepath)

        created_at = datetime.now(timezone.utc).isoformat()

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO accident_reports (
                user_id, latitude, longitude,
                category, severity, description,
                occurred_at, image_filename, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            request.user_id,
            latitude,
            longitude,
            category,
            severity,
            description,
            occurred_at,
            filename,
            created_at
        ))

        report_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({
            "message": "ส่งรายงานอุบัติเหตุสำเร็จ",
            "report_id": report_id
        }), 201

    except Exception:
        if os.path.exists(filepath):
            os.remove(filepath)

        current_app.logger.exception("Failed to save accident report")
        return jsonify({"error": "ไม่สามารถบันทึกรายงานได้"}), 500


@accident_reports_bp.route("/reports", methods=["GET"])
def get_accident_reports():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    rows = conn.execute("""
        SELECT id, latitude, longitude, category,
               severity, description, occurred_at,
               image_filename, status, created_at
        FROM accident_reports
        ORDER BY created_at DESC
    """).fetchall()

    conn.close()

    reports = []

    for row in rows:
        reports.append({
            "id": row["id"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "category": row["category"],
            "severity": row["severity"],
            "description": row["description"],
            "occurred_at": row["occurred_at"],
            "status": row["status"],
            "created_at": row["created_at"],
            "image_url": request.host_url.rstrip("/")
                + "/api/accidents/images/" + row["image_filename"]
        })

    return jsonify(reports), 200


@accident_reports_bp.route("/images/<filename>", methods=["GET"])
def get_accident_image(filename):
    # ชื่อไฟล์ที่บันทึกจริงเป็น UUID ไม่ใช่ชื่อจากผู้ใช้
    if not filename or os.path.basename(filename) != filename:
        return jsonify({"error": "ชื่อไฟล์ไม่ถูกต้อง"}), 400

    return send_from_directory(UPLOAD_FOLDER, filename)
