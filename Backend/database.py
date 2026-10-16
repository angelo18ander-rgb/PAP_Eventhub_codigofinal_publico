"""Configura a ligação à base de dados e migrações compatíveis com SQLite."""

from pathlib import Path
import os
import re
from uuid import uuid4
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Criação da base de dados local SQLite
DATABASE_PATH = Path(os.getenv("EVENTHUB_DATABASE_PATH", Path(__file__).resolve().parent / "eventhub.db"))
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DATABASE_PATH.as_posix()}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False} # Necessário apenas para o SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def ensure_user_contact_columns():
    """Adiciona campos de conta, perfil e bilhetes às bases de dados SQLite existentes."""
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("users")}
    with engine.begin() as connection:
        for name, sql_type in (
            ("phone_number", "VARCHAR(30)"),
            ("country", "VARCHAR(80)"),
            ("city", "VARCHAR(80)"),
            ("profile_location", "VARCHAR(120)"),
            ("username", "VARCHAR(40)"),
            ("role", "VARCHAR(20) NOT NULL DEFAULT 'attendee'"),
            ("is_public", "INTEGER NOT NULL DEFAULT 1"),
            ("bio", "TEXT"),
            ("preferred_categories", "TEXT NOT NULL DEFAULT '[]'"),
            ("brand_name", "VARCHAR(100)"),
            ("website_url", "VARCHAR(255)"),
            ("instagram_url", "VARCHAR(255)"),
            ("contact_email", "VARCHAR(120)"),
            ("x_url", "VARCHAR(255)"),
            ("linkedin_url", "VARCHAR(255)"),
            ("spotify_url", "VARCHAR(255)"),
            ("tiktok_url", "VARCHAR(255)"),
            ("cover_image", "TEXT"),
            ("profile_theme", "VARCHAR(7) NOT NULL DEFAULT '#7c5cff'"),
            ("avatar_frame", "VARCHAR(20) NOT NULL DEFAULT 'none'"),
            ("pronouns", "VARCHAR(40)"),
            ("status_message", "VARCHAR(120)"),
            ("show_interests", "INTEGER NOT NULL DEFAULT 1"),
            ("show_attended_events", "INTEGER NOT NULL DEFAULT 1"),
            ("show_attendance_count", "INTEGER NOT NULL DEFAULT 1"),
            ("show_network", "INTEGER NOT NULL DEFAULT 1"),
            ("featured_event_id", "INTEGER"),
        ):
            if name not in columns:
                connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {sql_type}"))
        if "profile_location" not in columns:
            connection.execute(text(
                "UPDATE users SET profile_location = "
                "CASE WHEN city IS NOT NULL AND city != '' AND country IS NOT NULL AND country != '' "
                "THEN city || ', ' || country WHEN city IS NOT NULL AND city != '' THEN city "
                "ELSE country END"
            ))
        connection.execute(text(
            "UPDATE users SET role = 'organizer' "
            "WHERE id IN (SELECT DISTINCT organizer_id FROM events WHERE organizer_id IS NOT NULL) "
            "AND role = 'attendee'"
        ))
        username_rows = connection.execute(
            text("SELECT id, name FROM users WHERE username IS NULL OR username = '' ORDER BY id")
        ).fetchall()
        for row in username_rows:
            base = re.sub(r"[^a-z0-9._-]+", "-", (row.name or "user").strip().lower()).strip(".-_")[:32] or "user"
            username = base
            suffix = 1
            while connection.execute(
                text("SELECT 1 FROM users WHERE username = :username AND id != :user_id"),
                {"username": username, "user_id": row.id},
            ).first():
                suffix += 1
                username = f"{base[:32 - len(str(suffix))]}{suffix}"
            connection.execute(
                text("UPDATE users SET username = :username WHERE id = :user_id"),
                {"username": username, "user_id": row.id},
            )
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)"))
        registration_columns = {column["name"] for column in inspect(connection).get_columns("registrations")}
        if "ticket_code" not in registration_columns:
            connection.execute(text("ALTER TABLE registrations ADD COLUMN ticket_code VARCHAR(32)"))
        if "checked_in_at" not in registration_columns:
            connection.execute(text("ALTER TABLE registrations ADD COLUMN checked_in_at DATETIME"))
        if "checked_in_by" not in registration_columns:
            connection.execute(text("ALTER TABLE registrations ADD COLUMN checked_in_by INTEGER"))
        ticket_rows = connection.execute(
            text("SELECT user_id, event_id FROM registrations WHERE ticket_code IS NULL")
        ).fetchall()
        for row in ticket_rows:
            connection.execute(
                text("UPDATE registrations SET ticket_code = :ticket_code WHERE user_id = :user_id AND event_id = :event_id"),
                {"ticket_code": uuid4().hex, "user_id": row.user_id, "event_id": row.event_id},
            )
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_registrations_ticket_code ON registrations (ticket_code)"))

# Dependency para injetar a sessão da DB nas rotas da API
def get_db():
    """Fornece uma sessão SQLAlchemy à rota e garante o seu fecho."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()