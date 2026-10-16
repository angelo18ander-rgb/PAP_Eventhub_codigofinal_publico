"""Define os modelos ORM e as tabelas de associação da base de dados."""

from sqlalchemy import Column, Integer, String, Text, ForeignKey, Table, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4
from database import Base

organizer_follows = Table(
    "organizer_follows",
    Base.metadata,
    Column("follower_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("organizer_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
)

# Registos de presença, respetivos bilhetes e validação à entrada.
# Tabela de associação (Muitos-para-Muitos) para Inscrições
registrations = Table(
    'registrations', 
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('event_id', Integer, ForeignKey('events.id'), primary_key=True),
    Column('created_at', DateTime, default=datetime.utcnow),
    Column('ticket_code', String(32), default=lambda: uuid4().hex, nullable=False),
    Column('checked_in_at', DateTime, nullable=True),
    Column('checked_in_by', Integer, nullable=True),
)

event_staff = Table(
    "event_staff",
    Base.metadata,
    Column("event_id", Integer, ForeignKey("events.id"), primary_key=True),
    Column("staff_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("status", String(20), nullable=False, default="pending"),
    Column("requested_at", DateTime, nullable=False, default=datetime.utcnow),
    Column("reviewed_at", DateTime, nullable=True),
    Column("reviewed_by", Integer, ForeignKey("users.id"), nullable=True),
)

# Tabela de associação (Muitos-para-Muitos) para Favoritos
favorites = Table(
    'favorites', 
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('event_id', Integer, ForeignKey('events.id'), primary_key=True)
)

# Relações sociais entre utilizadores.
user_blocks = Table(
    "user_blocks",
    Base.metadata,
    Column("blocker_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("blocked_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
)

user_mutes = Table(
    "user_mutes",
    Base.metadata,
    Column("muter_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("muted_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
)

follow_requests = Table(
    "follow_requests",
    Base.metadata,
    Column("requester_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("target_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
)

class User(Base):
    """Representa uma conta, respetivo perfil e relações com outros registos."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    avatar_url = Column(String(255), nullable=True)
    phone_number = Column(String(30), nullable=True)
    country = Column(String(80), nullable=True)
    city = Column(String(80), nullable=True)
    profile_location = Column(String(120), nullable=True)
    username = Column(String(40), nullable=True)
    role = Column(String(20), nullable=False, default="attendee")
    is_public = Column(Integer, nullable=False, default=1)
    bio = Column(Text, nullable=True)
    preferred_categories = Column(Text, nullable=False, default="[]")
    brand_name = Column(String(100), nullable=True)
    website_url = Column(String(255), nullable=True)
    instagram_url = Column(String(255), nullable=True)
    x_url = Column(String(255), nullable=True)
    linkedin_url = Column(String(255), nullable=True)
    spotify_url = Column(String(255), nullable=True)
    tiktok_url = Column(String(255), nullable=True)
    contact_email = Column(String(120), nullable=True)
    cover_image = Column(Text, nullable=True)
    profile_theme = Column(String(7), nullable=False, default="#7c5cff")
    avatar_frame = Column(String(20), nullable=False, default="none")
    pronouns = Column(String(40), nullable=True)
    status_message = Column(String(120), nullable=True)
    show_interests = Column(Integer, nullable=False, default=1)
    show_attended_events = Column(Integer, nullable=False, default=1)
    show_attendance_count = Column(Integer, nullable=False, default=1)
    show_network = Column(Integer, nullable=False, default=1)
    featured_event_id = Column(Integer, ForeignKey("events.id"), nullable=True)

    # Relacionamentos
    created_events = relationship("Event", back_populates="organizer", foreign_keys="Event.organizer_id")
    joined_events = relationship("Event", secondary=registrations, back_populates="participants")
    favorite_events = relationship("Event", secondary=favorites, back_populates="favorited_by")


class Event(Base):
    """Representa um evento criado por um organizador."""
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(80), nullable=False)
    description = Column(Text, nullable=False)
    date = Column(String(10), nullable=False) # Formato YYYY-MM-DD
    time = Column(String(5), nullable=False)  # Formato HH:MM
    location = Column(String(150), nullable=False)
    category = Column(String(50), nullable=False)
    max_participants = Column(Integer, nullable=False)
    image_url = Column(String(255), nullable=True)
    status = Column(String(20), default="active") # "active" ou "cancelled"
    organizer_id = Column(Integer, ForeignKey("users.id"))

    # Relacionamentos
    organizer = relationship("User", back_populates="created_events", foreign_keys=[organizer_id])
    participants = relationship("User", secondary=registrations, back_populates="joined_events")
    favorited_by = relationship("User", secondary=favorites, back_populates="favorite_events")