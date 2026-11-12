
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import Blueprint, current_app, jsonify, request
from werkzeug.security import generate_password_hash, check_password_hash


auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

DB_PATH = os.path.join(os.path.dirname(__file__), "users.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_auth_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)


def create_token(user_id):
    now = datetime.now(timezone.utc)

    payload = {
        "user_id": user_id,
        "iat": now,
        "exp": now + timedelta(days=7),
    }

    return jwt.encode(
        payload,
        current_app.config["JWT_SECRET_KEY"],
        algorithm="HS256",
    )


def token_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")

        if not header.startswith("Bearer "):
            return jsonify({"message": "กรุณาเข้าสู่ระบบ"}), 401

        token = header.split(" ", 1)[1]

        try:
            payload = jwt.decode(
                token,
                current_app.config["JWT_SECRET_KEY"],
                algorithms=["HS256"],
            )
            request.user_id = int(payload["user_id"])

        except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
            return jsonify({"message": "Token ไม่ถูกต้องหรือหมดอายุ"}), 401

        return func(*args, **kwargs)

    return wrapper


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not name or not email or not password:
        return jsonify({"message": "กรุณากรอกข้อมูลให้ครบ"}), 400

    if len(password) < 8:
        return jsonify({"message": "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"}), 400

    if "@" not in email:
        return jsonify({"message": "รูปแบบอีเมลไม่ถูกต้อง"}), 400

    password_hash = generate_password_hash(password)

    try:
        with get_db() as conn:
            cursor = conn.execute(
                """
                INSERT INTO users (name, email, password_hash, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    name,
                    email,
                    password_hash,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            user_id = cursor.lastrowid

        return jsonify({
            "message": "สมัครสมาชิกสำเร็จ",
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
            },
        }), 201

    except sqlite3.IntegrityError:
        return jsonify({"message": "อีเมลนี้มีผู้ใช้งานแล้ว"}), 409


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not email or not password:
        return jsonify({"message": "กรุณากรอกอีเมลและรหัสผ่าน"}), 400

    with get_db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE email = ?",
            (email,),
        ).fetchone()

    if user is None or not check_password_hash(
        user["password_hash"], password
    ):
        return jsonify({"message": "อีเมลหรือรหัสผ่านไม่ถูกต้อง"}), 401

    token = create_token(user["id"])

    return jsonify({
        "message": "เข้าสู่ระบบสำเร็จ",
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
        },
    })


@auth_bp.route("/me", methods=["GET"])
@token_required
def me():
    with get_db() as conn:
        user = conn.execute(
            "SELECT id, name, email, created_at FROM users WHERE id = ?",
            (request.user_id,),
        ).fetchone()

    if user is None:
        return jsonify({"message": "ไม่พบผู้ใช้งาน"}), 404

    return jsonify({"user": dict(user)})
