"""Define os esquemas da API e valida os dados recebidos e devolvidos."""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Literal
from datetime import date, datetime
import re
import json

# --- ESQUEMAS DE UTILIZADOR ---

# Dados recebidos ao registar um novo utilizador
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone_number: str
    country: str
    city: str
    role: Literal["attendee", "organizer", "staff"] = "attendee"

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        cleaned = re.sub(r"[ ()-]", "", value.strip())
        if not re.fullmatch(r"\+[1-9]\d{7,14}", cleaned):
            raise ValueError("Introduza um número de telefone internacional válido, incluindo o indicativo do país.")
        return cleaned

    @field_validator("country", "city")
    @classmethod
    def validate_place(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Este campo deve conter pelo menos 2 caracteres.")
        if len(cleaned) > 80:
            raise ValueError("O nome da cidade ou do país não pode exceder 80 caracteres.")
        return cleaned

# Dados recebidos ao iniciar sessão
class UserLogin(BaseModel):
    """Credenciais recebidas para iniciar sessão."""
    email: EmailStr
    password: str

# Dados devolvidos pela API ao consultar o perfil (sem a palavra-passe, por segurança)
class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    avatar_url: Optional[str] = None
    phone_number: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    profile_location: Optional[str] = None
    username: str
    role: Literal["attendee", "organizer", "staff"] = "attendee"
    is_public: bool = True
    bio: Optional[str] = None
    preferred_categories: List[str] = Field(default_factory=list)
    brand_name: Optional[str] = None
    website_url: Optional[str] = None
    instagram_url: Optional[str] = None
    x_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    spotify_url: Optional[str] = None
    tiktok_url: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    cover_image: Optional[str] = None
    profile_theme: str = "#7c5cff"
    avatar_frame: str = "none"
    pronouns: Optional[str] = None
    status_message: Optional[str] = None
    show_interests: bool = True
    show_attended_events: bool = True
    show_attendance_count: bool = True
    show_network: bool = True
    featured_event_id: Optional[int] = None
    follower_count: int = 0
    following_count: int = 0
    attended_events_count: int = 0
    badges: List[dict] = Field(default_factory=list)

    @field_validator("preferred_categories", mode="before")
    @classmethod
    def parse_preferred_categories(cls, value):
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                return []
        return value or []

    class Config:
        from_attributes = True

class UserRegistrationResponse(UserResponse):
    """Dados do perfil devolvidos após registo, incluindo o token de sessão."""
    access_token: str

class UserUpdate(BaseModel):
    """Campos opcionais aceites ao atualizar um perfil."""
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar_url: Optional[str] = None
    phone_number: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    profile_location: Optional[str] = None
    username: Optional[str] = None
    is_public: Optional[bool] = None
    bio: Optional[str] = None
    preferred_categories: Optional[List[str]] = None
    brand_name: Optional[str] = None
    website_url: Optional[str] = None
    instagram_url: Optional[str] = None
    x_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    spotify_url: Optional[str] = None
    tiktok_url: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    cover_image: Optional[str] = None
    profile_theme: Optional[str] = None
    avatar_frame: Optional[Literal["none", "glow", "double", "creator", "staff"]] = None
    pronouns: Optional[str] = None
    status_message: Optional[str] = None
    show_interests: Optional[bool] = None
    show_attended_events: Optional[bool] = None
    show_attendance_count: Optional[bool] = None
    show_network: Optional[bool] = None
    featured_event_id: Optional[int] = None

    @field_validator("preferred_categories")
    @classmethod
    def validate_preferred_categories(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return value
        allowed = {"Music", "Sports", "Gaming", "Technology", "Education", "Art", "Business", "Entertainment"}
        cleaned = list(dict.fromkeys(category.strip() for category in value if category.strip()))
        if len(cleaned) > 8:
            raise ValueError("Selecione, no máximo, 8 interesses.")
        if any(category not in allowed for category in cleaned):
            raise ValueError("Selecione apenas categorias de eventos suportadas.")
        return cleaned

    @field_validator("bio")
    @classmethod
    def validate_bio(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and len(value.strip()) > 500:
            raise ValueError("A biografia não pode exceder 500 caracteres.")
        return value.strip() if value is not None else value

    @field_validator("brand_name")
    @classmethod
    def validate_brand_name(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and len(value.strip()) > 100:
            raise ValueError("O nome da marca não pode exceder 100 caracteres.")
        return value.strip() if value is not None else value

    @field_validator("profile_location")
    @classmethod
    def validate_profile_location(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if len(cleaned) > 120:
            raise ValueError("A localização do perfil não pode exceder 120 caracteres.")
        return cleaned or None

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip().lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{1,39}", cleaned):
            raise ValueError("O nome de utilizador deve ter entre 2 e 40 caracteres e pode incluir letras, números, pontos, sublinhados ou hífenes.")
        return cleaned

    @field_validator("website_url", "instagram_url", "x_url", "linkedin_url", "spotify_url", "tiktok_url")
    @classmethod
    def validate_social_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not value.strip():
            return None
        cleaned = value.strip()
        if not re.match(r"^https?://", cleaned, re.IGNORECASE):
            cleaned = f"https://{cleaned}"
        if len(cleaned) > 255:
            raise ValueError("As ligações do perfil não podem exceder 255 caracteres.")
        return cleaned

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = re.sub(r"[ ()-]", "", value.strip())
        if not re.fullmatch(r"\+[1-9]\d{7,14}", cleaned):
            raise ValueError("Introduza um número de telefone internacional válido, incluindo o indicativo do país.")
        return cleaned

    @field_validator("country", "city")
    @classmethod
    def validate_place(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Este campo deve conter pelo menos 2 caracteres.")
        if len(cleaned) > 80:
            raise ValueError("O nome da cidade ou do país não pode exceder 80 caracteres.")
        return cleaned

    @field_validator("profile_theme")
    @classmethod
    def validate_profile_theme(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not re.fullmatch(r"#[0-9a-fA-F]{6}", value.strip()):
            raise ValueError("A cor do perfil deve ser um código hexadecimal de seis dígitos.")
        return value.strip().lower() if value is not None else value

    @field_validator("pronouns", "status_message")
    @classmethod
    def validate_short_profile_text(cls, value: Optional[str], info):
        if value is None:
            return value
        cleaned = value.strip()
        limit = 120 if info.field_name == "status_message" else 40
        if len(cleaned) > limit:
            field_label = "estado" if info.field_name == "status_message" else "pronomes"
            raise ValueError(f"O campo {field_label} não pode exceder {limit} caracteres.")
        return cleaned or None

    @field_validator("cover_image")
    @classmethod
    def validate_cover_image(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if len(value) > 4_200_000:
            raise ValueError("A imagem de capa não pode exceder 3 MB.")
        if not re.match(r"^(https://|preset:(aurora|sunset|ocean|night|forest)$|data:image/(jpeg|png|webp);base64,)", value, re.IGNORECASE):
            raise ValueError("Escolha uma capa predefinida, um URL seguro ou carregue uma imagem PNG, JPEG ou WebP.")
        return value

class UserUpdateResponse(UserResponse):
    """Resposta de atualização de perfil com novo token de sessão."""
    access_token: str


# --- ESQUEMAS DE AUTENTICAÇÃO ---

# Estrutura do token JWT devolvido ao iniciar sessão
class Token(BaseModel):
    """Token de acesso e esquema de autenticação."""
    access_token: str
    token_type: str

# Conteúdo armazenado dentro do token JWT
class TokenData(BaseModel):
    """Identidade opcional guardada no conteúdo do token."""
    email: Optional[str] = None


# --- ESQUEMAS DE EVENTO ---

# Dados necessários para criar ou editar um evento
class EventCreate(BaseModel):
    title: str
    description: str
    date: str
    time: str
    location: str
    category: str
    max_participants: int
    image_url: Optional[str] = None

    @field_validator("location")
    @classmethod
    def validate_location(cls, value: str) -> str:
        parts = [part.strip() for part in value.split(",")]
        if len(parts) < 3 or any(len(part) < 2 for part in parts[:3]):
            raise ValueError("A localização deve incluir rua, cidade e país, separados por vírgulas.")
        return ", ".join(parts)

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("A data deve seguir o formato AAAA-MM-DD.") from exc
        today = date.today()
        if parsed < today or parsed.year > today.year + 10:
            raise ValueError(f"A data deve situar-se entre hoje e 31 de dezembro de {today.year + 10}.")
        return parsed.isoformat()

# Dados devolvidos pela API ao listar eventos
class EventResponse(BaseModel):
    """Representação pública de evento devolvida pela API."""
    id: int
    title: str
    description: str
    date: str
    time: str
    location: str
    category: str
    max_participants: int
    image_url: Optional[str] = None
    status: str
    organizer_id: Optional[int] = None
    organizer_name: Optional[str] = None
    participants_count: int = 0
    ticket_code: Optional[str] = None
    registered_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EventParticipantResponse(BaseModel):
    """Dados de inscrição e presença apresentados ao organizador."""
    name: str
    email: EmailStr
    registered_at: Optional[datetime] = None
    checked_in: bool
    checked_in_at: Optional[datetime] = None


class StaffInvite(BaseModel):
    """E-mail da pessoa convidada para a equipa de um evento."""
    email: EmailStr


class StaffRequestDecision(BaseModel):
    """Decisão de aprovação ou rejeição de um pedido de equipa."""
    status: Literal["approved", "rejected"]


class TicketVerificationRequest(BaseModel):
    """Identificador do evento e conteúdo do QR a validar."""
    event_id: int
    ticket_payload: str = Field(min_length=1, max_length=2048)