"""Define os endpoints da API para autenticação, perfis, relações sociais e eventos."""

import os
import json
import re
import unicodedata
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen
from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session
from typing import List, Literal, Optional

import models, schemas, database, security
from database import engine

# Cria as tabelas na base de dados caso ainda não existam
models.Base.metadata.create_all(bind=engine)
database.ensure_user_contact_columns()

app = FastAPI(title="EventHub API")

def event_response(event: models.Event) -> schemas.EventResponse:
    """Converte o modelo de evento na estrutura de resposta da API."""
    response = schemas.EventResponse.from_orm(event)
    response.organizer_name = event.organizer.name if event.organizer else None
    response.participants_count = len(event.participants)
    return response


def require_organizer_event(event_id: int, current_user: models.User, db: Session) -> models.Event:
    """Obtém o evento e confirma que pertence ao organizador autenticado."""
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    if current_user.role != "organizer" or event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Apenas o organizador deste evento pode geri-lo.")
    return event


def ticket_code_from_payload(payload: str) -> str:
    """Extrai e valida o identificador de um QR ou ligação de bilhete."""
    parsed = urlparse(payload)
    code = parse_qs(parsed.query).get("code", [""])[0] if parsed.query else payload.strip()
    if not re.fullmatch(r"[a-fA-F0-9]{32}", code):
        raise HTTPException(status_code=404, detail="Este código QR não corresponde a um bilhete EventHub válido.")
    return code

def find_user_by_phone(db: Session, phone_number: str, exclude_user_id: Optional[int] = None):
    """Procura um telefone sem diferenças de formatação comuns."""
    normalized_phone = models.User.phone_number
    for character in (" ", "-", "(", ")"):
        normalized_phone = func.replace(normalized_phone, character, "")

    query = db.query(models.User).filter(normalized_phone == phone_number)
    if exclude_user_id is not None:
        query = query.filter(models.User.id != exclude_user_id)
    return query.first()

def unique_username(db: Session, display_name: str) -> str:
    """Gera um nome de utilizador disponível a partir do nome apresentado."""
    base = re.sub(r"[^a-z0-9._-]+", "-", display_name.strip().lower()).strip(".-_")[:32] or "user"
    username = base
    suffix = 1
    while db.query(models.User.id).filter(models.User.username == username).first():
        suffix += 1
        username = f"{base[:32 - len(str(suffix))]}{suffix}"
    return username


def normalize_city_name(name: str) -> str:
    """Normaliza texto de cidade para comparação sem acentos ou maiúsculas."""
    decomposed = unicodedata.normalize("NFKD", name.casefold())
    return "".join(character for character in decomposed if not unicodedata.combining(character)).strip()


def geocode_cities(query: str) -> List[dict]:
    """Pesquisa cidades reais no serviço GeoNames/Open-Meteo."""
    params = urlencode({"name": query, "count": 8, "language": "pt", "format": "json"})
    request = Request(
        f"https://geocoding-api.open-meteo.com/v1/search?{params}",
        headers={"User-Agent": "EventHub/1.0 city lookup"},
    )
    try:
        with urlopen(request, timeout=5) as response:
            payload = json.loads(response.read())
    except (OSError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=503,
            detail="Não foi possível confirmar a localização neste momento. Tente novamente.",
        ) from error

    if not isinstance(payload, dict) or payload.get("error"):
        raise HTTPException(
            status_code=503,
            detail="O serviço de localização não está disponível neste momento. Tente novamente.",
        )

    results = payload.get("results") or []
    if not isinstance(results, list):
        raise HTTPException(
            status_code=503,
            detail="O serviço de localização devolveu uma resposta inválida. Tente novamente.",
        )

    locations = []
    seen = set()
    for result in results:
        if not isinstance(result, dict):
            continue
        if not str(result.get("feature_code", "")).startswith("PPL"):
            continue
        name = str(result.get("name", "")).strip()
        country = str(result.get("country", "")).strip()
        if not name or not country:
            continue
        identity = (normalize_city_name(name), country, result.get("admin1", ""))
        if identity in seen:
            continue
        seen.add(identity)
        locations.append({
            "name": name,
            "country": country,
            "region": str(result.get("admin1") or "").strip(),
        })
    return locations


def require_existing_city(city: str) -> None:
    """Rejeita nomes que não correspondam a uma cidade encontrada."""
    normalized_city = normalize_city_name(city)
    if not normalized_city or not any(
        normalize_city_name(location["name"]) == normalized_city
        for location in geocode_cities(city)
    ):
        raise HTTPException(status_code=422, detail="Selecione uma cidade válida nas sugestões.")


def load_cors_allowed_origins() -> List[str]:
    """Lê origens CORS explícitas, com origens locais apenas em desenvolvimento."""
    configured_origins = os.getenv("CORS_ALLOWED_ORIGINS")
    if configured_origins is None:
        if security.is_production_environment():
            raise RuntimeError(
                "Set CORS_ALLOWED_ORIGINS to the deployed frontend origin(s) in production."
            )
        configured_origins = (
            "http://localhost:3000,http://localhost:5500,"
            "http://127.0.0.1:5500,http://127.0.0.1:3000"
        )

    origins = [origin.strip().rstrip("/") for origin in configured_origins.split(",") if origin.strip()]
    if not origins or "*" in origins:
        raise RuntimeError("CORS_ALLOWED_ORIGINS must contain explicit frontend origins.")
    return origins


allowed_origins = load_cors_allowed_origins()

# Usa uma lista explícita de origens fidedignas em vez de uma política CORS universal.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- AUTENTICAÇÃO E UTILIZADORES ---

@app.post("/api/auth/register", response_model=schemas.UserRegistrationResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: schemas.UserCreate, db: Session = Depends(database.get_db)):
    require_existing_city(user_data.city)
    if db.query(models.User).filter(models.User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Este email já está registado.")
    if find_user_by_phone(db, user_data.phone_number):
        raise HTTPException(status_code=400, detail="Este número de telefone já está registado.")
    
    user = models.User(
        name=user_data.name,
        email=user_data.email,
        hashed_password=security.hash_password(user_data.password),
        phone_number=user_data.phone_number,
        country=user_data.country,
        city=user_data.city,
        profile_location=", ".join(filter(None, (user_data.city.strip(), user_data.country.strip()))),
        username=unique_username(db, user_data.name),
        role=user_data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        **schemas.UserResponse.from_orm(user).dict(),
        "access_token": security.create_access_token({"sub": user.email}),
    }


@app.get("/api/locations/cities")
def search_cities(q: str = Query(min_length=2, max_length=80)):
    query = q.strip()
    if len(query) < 2:
        raise HTTPException(status_code=422, detail="Introduza pelo menos duas letras para procurar uma cidade.")
    return geocode_cities(query)


@app.post("/api/auth/login", response_model=schemas.Token)
def login(user_data: schemas.UserLogin, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == user_data.email).first()
    if not user or not security.verify_password(user_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="E-mail ou palavra-passe incorretos.")
    
    token = security.create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}

@app.get("/api/users/me", response_model=schemas.UserResponse)
def get_me(
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    relation = models.organizer_follows
    checked_in_count = db.execute(
        select(func.count()).select_from(models.registrations).where(
            models.registrations.c.user_id == current_user.id,
            models.registrations.c.checked_in_at.is_not(None),
        )
    ).scalar_one()
    badges = []
    if current_user.role == "staff":
        badges.append({"id": "staff", "label": "Equipa do evento", "icon": "fa-id-badge"})
    hosted_count = db.query(models.Event).filter(models.Event.organizer_id == current_user.id).count()
    if current_user.role == "organizer" and hosted_count >= 5:
        badges.append({"id": "top-creator", "label": "Organizador em destaque", "icon": "fa-star"})
    if checked_in_count >= 5:
        badges.append({"id": "vip-attendee", "label": "Participante VIP", "icon": "fa-ticket"})
    return {
        **schemas.UserResponse.from_orm(current_user).dict(),
        "follower_count": db.query(relation).filter(relation.c.organizer_id == current_user.id).count(),
        "following_count": db.query(relation).filter(relation.c.follower_id == current_user.id).count(),
        "attended_events_count": checked_in_count,
        "badges": badges,
    }

def is_blocked_between(db: Session, first_id: int, second_id: int) -> bool:
    return db.execute(
        select(models.user_blocks.c.blocker_id).where(
            (
                (models.user_blocks.c.blocker_id == first_id)
                & (models.user_blocks.c.blocked_id == second_id)
            ) | (
                (models.user_blocks.c.blocker_id == second_id)
                & (models.user_blocks.c.blocked_id == first_id)
            )
        )
    ).first() is not None


def public_user_profile(user: models.User, db: Session, viewer: Optional[models.User] = None) -> dict:
    """Monta o perfil público aplicando as permissões de privacidade do visitante."""
    is_owner = viewer is not None and viewer.id == user.id
    is_following = bool(viewer and db.execute(
        select(models.organizer_follows.c.follower_id).where(
            models.organizer_follows.c.follower_id == viewer.id,
            models.organizer_follows.c.organizer_id == user.id,
        )
    ).first())
    request_pending = bool(viewer and db.execute(
        select(models.follow_requests.c.requester_id).where(
            models.follow_requests.c.requester_id == viewer.id,
            models.follow_requests.c.target_id == user.id,
        )
    ).first())
    if viewer and not is_owner and is_blocked_between(db, viewer.id, user.id):
        raise HTTPException(status_code=404, detail="Perfil público não encontrado.")
    can_view_profile = bool(user.is_public or is_owner or is_following)

    follower_count = db.query(models.organizer_follows).filter(
        models.organizer_follows.c.organizer_id == user.id
    ).count()
    following_count = db.query(models.organizer_follows).filter(
        models.organizer_follows.c.follower_id == user.id
    ).count()
    followed_by = []
    if viewer and not is_owner and can_view_profile and user.show_network:
        follower_ids = select(models.organizer_follows.c.follower_id).where(
            models.organizer_follows.c.organizer_id == user.id
        )
        if is_following:
            followed_by.append(viewer)
        mutuals = db.query(models.User).join(
            models.organizer_follows,
            models.organizer_follows.c.organizer_id == models.User.id,
        ).filter(
            models.organizer_follows.c.follower_id == viewer.id,
            models.User.id.in_(follower_ids),
            models.User.id != viewer.id,
        ).limit(max(0, 3 - len(followed_by))).all()
        followed_by.extend(mutuals)

    result = {
        "id": user.id,
        "name": user.name,
        "role": user.role,
        "username": user.username,
        "is_public": bool(user.is_public),
        "is_owner": is_owner,
        "avatar_url": user.avatar_url,
        "cover_image": user.cover_image if can_view_profile else None,
        "profile_theme": (user.profile_theme or "#7c5cff") if can_view_profile else "#7c5cff",
        "avatar_frame": user.avatar_frame or "none",
        "pronouns": user.pronouns if can_view_profile else None,
        "status_message": user.status_message if can_view_profile else None,
        "bio": (user.bio or "") if can_view_profile else "",
        "preferred_categories": json.loads(user.preferred_categories or "[]") if can_view_profile and (user.show_interests or is_owner) else [],
        "show_interests": bool(user.show_interests),
        "show_attended_events": bool(user.show_attended_events),
        "show_attendance_count": bool(user.show_attendance_count),
        "show_network": bool(user.show_network),
        "follower_count": follower_count if can_view_profile and (user.show_network or is_owner) else None,
        "following_count": following_count if can_view_profile and (user.show_network or is_owner) else None,
        "can_view_network": bool(can_view_profile and (user.show_network or is_owner)),
        "following": is_following,
        "request_pending": request_pending,
        "followed_by": [{"id": item.id, "name": item.name, "username": item.username} for item in followed_by],
        "profile_location": user.profile_location if can_view_profile else None,
    }
    if user.role == "organizer" and can_view_profile:
        result["brand_name"] = user.brand_name or user.name
        result["hosted_events_count"] = db.query(models.Event).filter(models.Event.organizer_id == user.id).count()

    attended_events_count = None
    if can_view_profile and (is_owner or user.show_attendance_count):
        attended_events_count = db.execute(
            select(func.count()).select_from(models.registrations).where(
                models.registrations.c.user_id == user.id,
                models.registrations.c.checked_in_at.is_not(None),
            )
        ).scalar_one()
        result["attended_events_count"] = attended_events_count

    if can_view_profile and (is_owner or user.show_attended_events):
        today = datetime.utcnow().date().isoformat()
        attended = db.query(models.Event).join(
            models.registrations, models.registrations.c.event_id == models.Event.id
        ).filter(
            models.registrations.c.user_id == user.id,
            models.Event.date < today,
            models.registrations.c.checked_in_at.is_not(None),
        ).order_by(models.Event.date.desc()).limit(6).all()
        result["attended_events"] = [event_response(event).dict() for event in attended]

    for field in ("website_url", "instagram_url", "x_url", "linkedin_url", "spotify_url", "tiktok_url"):
        if can_view_profile:
            result[field] = getattr(user, field)
    if user.role == "organizer" and can_view_profile:
        result["contact_email"] = user.contact_email

    badges = []
    if can_view_profile and user.role == "staff":
        badges.append({"id": "staff", "label": "Equipa do evento", "icon": "fa-id-badge"})
    if can_view_profile and user.role == "organizer" and result.get("hosted_events_count", 0) >= 5:
        badges.append({"id": "top-creator", "label": "Organizador em destaque", "icon": "fa-star"})
    if can_view_profile and (
        is_owner or user.show_attendance_count
    ) and attended_events_count is not None and attended_events_count >= 5:
        badges.append({"id": "vip-attendee", "label": "Participante VIP", "icon": "fa-ticket"})
    result["badges"] = badges
    featured = db.query(models.Event).filter(models.Event.id == user.featured_event_id).first() if user.featured_event_id else None
    if featured and can_view_profile:
        result["featured_event"] = event_response(featured).dict()
    return result

@app.get("/api/users/search")
def search_users(
    q: str = Query(..., min_length=2, max_length=100),
    role: str = Query("all", pattern="^(all|attendee|creator|organizer)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=50),
    current_user: Optional[models.User] = Depends(security.get_optional_current_user),
    db: Session = Depends(database.get_db),
):
    search_term = q.strip()
    if len(search_term) < 2:
        raise HTTPException(status_code=422, detail="A pesquisa deve conter pelo menos 2 caracteres.")
    escaped_term = search_term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    search_pattern = f"%{escaped_term}%"
    query = db.query(models.User).filter(models.User.is_public == 1)
    if current_user:
        blocked_by_viewer = select(models.user_blocks.c.blocked_id).where(
            models.user_blocks.c.blocker_id == current_user.id
        )
        blocked_viewer = select(models.user_blocks.c.blocker_id).where(
            models.user_blocks.c.blocked_id == current_user.id
        )
        muted_by_viewer = select(models.user_mutes.c.muted_id).where(
            models.user_mutes.c.muter_id == current_user.id
        )
        query = query.filter(
            models.User.id.not_in(blocked_by_viewer),
            models.User.id.not_in(blocked_viewer),
            models.User.id.not_in(muted_by_viewer),
        )
    if role in ("creator", "organizer"):
        query = query.filter(models.User.role == "organizer")
    elif role == "attendee":
        query = query.filter(models.User.role == "attendee")

    matching_event_tag = db.query(models.Event.id).filter(
        models.Event.organizer_id == models.User.id,
        models.Event.category.ilike(search_pattern),
    ).exists()
    matching_attended_event_tag = db.query(models.Event.id).join(
        models.registrations,
        models.registrations.c.event_id == models.Event.id,
    ).filter(
        models.registrations.c.user_id == models.User.id,
        models.Event.category.ilike(search_pattern),
    ).exists()
    query = query.filter(
        models.User.name.ilike(search_pattern)
        | models.User.username.ilike(search_pattern)
        | models.User.brand_name.ilike(search_pattern)
        | models.User.bio.ilike(search_pattern)
        | ((models.User.show_interests == 1) & models.User.preferred_categories.ilike(search_pattern))
        | matching_event_tag
        | ((models.User.show_attended_events == 1) & matching_attended_event_tag)
    )
    total = query.count()
    users = query.order_by(models.User.name.asc(), models.User.id.asc()) \
        .offset((page - 1) * limit).limit(limit).all()
    return {
        "items": [public_user_profile(user, db) for user in users],
        "page": page,
        "limit": limit,
        "total": total,
        "has_more": page * limit < total,
    }

@app.get("/api/users/{user_id}/public-profile")
def get_public_user_profile(
    user_id: int,
    viewer: Optional[models.User] = Depends(security.get_optional_current_user),
    db: Session = Depends(database.get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Perfil público não encontrado.")
    return public_user_profile(user, db, viewer)

@app.patch("/api/users/me", response_model=schemas.UserUpdateResponse)
def update_me(
    user_data: schemas.UserUpdate,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    updates = user_data.dict(exclude_unset=True)
    if "city" in updates and updates["city"] is not None:
        require_existing_city(updates["city"])
    if user_data.email and user_data.email != current_user.email:
        duplicate = db.query(models.User).filter(
            models.User.email == user_data.email,
            models.User.id != current_user.id,
        ).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="Este endereço de e-mail já está associado a outra conta.")

    if user_data.username and user_data.username != current_user.username:
        duplicate_username = db.query(models.User).filter(
            models.User.username == user_data.username,
            models.User.id != current_user.id,
        ).first()
        if duplicate_username:
            raise HTTPException(status_code=400, detail="Este nome de utilizador já está em utilização.")

    phone_number = updates.get("phone_number")
    if phone_number:
        duplicate_phone = find_user_by_phone(db, phone_number, current_user.id)
        if duplicate_phone:
            raise HTTPException(status_code=400, detail="Este número de telefone já está associado a outra conta.")
        updates["phone_number"] = phone_number

    frame = updates.get("avatar_frame")
    if frame == "staff" and current_user.role != "staff":
        raise HTTPException(status_code=400, detail="A moldura de equipa só está disponível para contas da equipa.")
    if frame == "creator" and current_user.role != "organizer":
        raise HTTPException(status_code=400, detail="A moldura de organizador só está disponível para contas de organizador.")

    if user_data.featured_event_id is not None:
        featured = db.query(models.Event).filter(models.Event.id == user_data.featured_event_id).first()
        if not featured or (
            featured.organizer_id != current_user.id
            and current_user not in featured.participants
            and current_user not in featured.favorited_by
        ):
            raise HTTPException(status_code=400, detail="Só pode destacar um evento que organize ou em que participe.")

    if updates:
        if "preferred_categories" in updates:
            updates["preferred_categories"] = json.dumps(updates["preferred_categories"])
        db.query(models.User).filter(models.User.id == current_user.id).update(
            updates,
            synchronize_session=False,
        )
        db.commit()
        db.refresh(current_user)

    response = schemas.UserResponse.from_orm(current_user)
    return {
        **response.dict(),
        "access_token": security.create_access_token({"sub": current_user.email}),
    }

@app.get("/api/users/me/events", response_model=List[schemas.EventResponse])
def get_my_events(
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    events = db.query(models.Event).filter(models.Event.organizer_id == current_user.id).all()
    results = []
    for event in events:
        results.append(event_response(event))
    return results

@app.get("/api/users/me/favorites", response_model=List[schemas.EventResponse])
def get_my_favorites(
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")

    results = []
    for event in user.favorite_events:
        results.append(event_response(event))
    return results

@app.get("/api/users/me/joined-events", response_model=List[schemas.EventResponse])
def get_joined_events(
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")
    registrations_by_event = {
        row.event_id: row
        for row in db.execute(
            select(models.registrations).where(models.registrations.c.user_id == user.id)
        ).mappings()
    }
    results = []
    for event in user.joined_events:
        response = event_response(event).dict()
        registration = registrations_by_event[event.id]
        response["ticket_code"] = registration["ticket_code"]
        response["registered_at"] = registration["created_at"]
        results.append(response)
    return results

@app.get("/api/users/me/following-organizers")
def get_followed_organizers(
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    return [
        row.organizer_id
        for row in db.execute(
            select(models.organizer_follows.c.organizer_id)
            .where(models.organizer_follows.c.follower_id == current_user.id)
        )
    ]

@app.get("/api/organizers/{organizer_id}")
def get_organizer_profile(
    organizer_id: int,
    viewer: Optional[models.User] = Depends(security.get_optional_current_user),
    db: Session = Depends(database.get_db),
):
    organizer = db.query(models.User).filter(
        models.User.id == organizer_id,
        models.User.role == "organizer",
    ).first()
    if not organizer:
        raise HTTPException(status_code=404, detail="Organizador não encontrado.")
    return public_user_profile(organizer, db, viewer)

@app.post("/api/organizers/{organizer_id}/follow")
def toggle_organizer_follow(
    organizer_id: int,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    organizer = db.query(models.User).filter(
        models.User.id == organizer_id,
        models.User.role == "organizer",
    ).first()
    if not organizer:
        raise HTTPException(status_code=404, detail="Organizador não encontrado.")
    if organizer.id == current_user.id:
        raise HTTPException(status_code=400, detail="Não pode seguir o seu próprio perfil de organizador.")
    if is_blocked_between(db, current_user.id, organizer.id):
        raise HTTPException(status_code=403, detail="Não é possível seguir esta conta.")
    follow = db.execute(
        select(models.organizer_follows.c.follower_id).where(
            models.organizer_follows.c.follower_id == current_user.id,
            models.organizer_follows.c.organizer_id == organizer.id,
        )
    ).first()
    if follow:
        db.execute(
            models.organizer_follows.delete().where(
                models.organizer_follows.c.follower_id == current_user.id,
                models.organizer_follows.c.organizer_id == organizer.id,
            )
        )
        is_following = False
        request_pending = False
    else:
        if not organizer.is_public:
            request = db.execute(select(models.follow_requests.c.requester_id).where(
                models.follow_requests.c.requester_id == current_user.id,
                models.follow_requests.c.target_id == organizer.id,
            )).first()
            if request:
                db.execute(models.follow_requests.delete().where(
                    models.follow_requests.c.requester_id == current_user.id,
                    models.follow_requests.c.target_id == organizer.id,
                ))
                request_pending = False
            else:
                db.execute(models.follow_requests.insert().values(requester_id=current_user.id, target_id=organizer.id))
                request_pending = True
            is_following = False
        else:
            db.execute(models.organizer_follows.insert().values(
                follower_id=current_user.id,
                organizer_id=organizer.id,
            ))
            is_following = True
            request_pending = False
    db.commit()
    follower_count = db.query(models.organizer_follows).filter(
        models.organizer_follows.c.organizer_id == organizer.id
    ).count()
    return {"following": is_following, "request_pending": request_pending, "follower_count": follower_count}

@app.post("/api/users/{target_id}/follow")
def toggle_user_follow(
    target_id: int,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    target = db.query(models.User).filter(models.User.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Não pode seguir o seu próprio perfil.")
    if is_blocked_between(db, current_user.id, target.id):
        raise HTTPException(status_code=403, detail="Não é possível seguir esta conta.")
    relation = models.organizer_follows
    where = (relation.c.follower_id == current_user.id) & (relation.c.organizer_id == target.id)
    existing = db.execute(select(relation.c.follower_id).where(where)).first()
    if existing:
        db.execute(relation.delete().where(where))
        following = False
        db.execute(models.follow_requests.delete().where(
            models.follow_requests.c.requester_id == current_user.id,
            models.follow_requests.c.target_id == target.id,
        ))
        request_pending = False
    else:
        if not target.is_public:
            request = db.execute(select(models.follow_requests.c.requester_id).where(
                models.follow_requests.c.requester_id == current_user.id,
                models.follow_requests.c.target_id == target.id,
            )).first()
            if request:
                db.execute(models.follow_requests.delete().where(
                    models.follow_requests.c.requester_id == current_user.id,
                    models.follow_requests.c.target_id == target.id,
                ))
                request_pending = False
            else:
                db.execute(models.follow_requests.insert().values(requester_id=current_user.id, target_id=target.id))
                request_pending = True
            following = False
        else:
            db.execute(relation.insert().values(follower_id=current_user.id, organizer_id=target.id))
            following = True
            request_pending = False
    db.commit()
    count = db.query(relation).filter(relation.c.organizer_id == target.id).count()
    return {"following": following, "request_pending": request_pending, "follower_count": count}

@app.get("/api/users/me/follow-requests")
def get_follow_requests(current_user: models.User = Depends(security.get_current_user), db: Session = Depends(database.get_db)):
    requesters = db.query(models.User).join(
        models.follow_requests, models.follow_requests.c.requester_id == models.User.id
    ).filter(models.follow_requests.c.target_id == current_user.id).order_by(
        models.follow_requests.c.created_at.asc()
    ).all()
    return [{"id": person.id, "name": person.name, "username": person.username, "role": person.role, "avatar_url": person.avatar_url} for person in requesters]

@app.post("/api/users/me/follow-requests/{requester_id}")
def approve_follow_request(requester_id: int, current_user: models.User = Depends(security.get_current_user), db: Session = Depends(database.get_db)):
    pending = db.execute(select(models.follow_requests.c.requester_id).where(
        models.follow_requests.c.requester_id == requester_id,
        models.follow_requests.c.target_id == current_user.id,
    )).first()
    if not pending:
        raise HTTPException(status_code=404, detail="Pedido para seguir não encontrado.")
    if is_blocked_between(db, current_user.id, requester_id):
        db.execute(models.follow_requests.delete().where(
            models.follow_requests.c.requester_id == requester_id,
            models.follow_requests.c.target_id == current_user.id,
        ))
        db.commit()
        raise HTTPException(status_code=403, detail="Esta conta está bloqueada.")
    db.execute(models.organizer_follows.insert().values(follower_id=requester_id, organizer_id=current_user.id))
    db.execute(models.follow_requests.delete().where(
        models.follow_requests.c.requester_id == requester_id,
        models.follow_requests.c.target_id == current_user.id,
    ))
    db.commit()
    return {"approved": True}

@app.delete("/api/users/me/follow-requests/{requester_id}")
def reject_follow_request(requester_id: int, current_user: models.User = Depends(security.get_current_user), db: Session = Depends(database.get_db)):
    deleted = db.execute(models.follow_requests.delete().where(
        models.follow_requests.c.requester_id == requester_id,
        models.follow_requests.c.target_id == current_user.id,
    ))
    if deleted.rowcount == 0:
        raise HTTPException(status_code=404, detail="Pedido para seguir não encontrado.")
    db.commit()
    return {"rejected": True}

@app.get("/api/users/{target_id}/network")
def get_user_network(
    target_id: int,
    kind: Literal["followers", "following"] = Query(...),
    current_user: Optional[models.User] = Depends(security.get_optional_current_user),
    db: Session = Depends(database.get_db),
):
    target = db.query(models.User).filter(models.User.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")
    is_owner = current_user is not None and current_user.id == target.id
    if current_user and not is_owner and is_blocked_between(db, current_user.id, target.id):
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")
    is_follower = bool(current_user and db.execute(select(models.organizer_follows.c.follower_id).where(
        models.organizer_follows.c.follower_id == current_user.id,
        models.organizer_follows.c.organizer_id == target.id,
    )).first())
    if not target.is_public and not (is_owner or is_follower):
        raise HTTPException(status_code=403, detail="Este perfil é privado.")
    if not target.show_network and not is_owner:
        raise HTTPException(status_code=403, detail="A rede deste utilizador é privada.")
    relation = models.organizer_follows
    ids = (
        select(relation.c.follower_id).where(relation.c.organizer_id == target.id)
        if kind == "followers"
        else select(relation.c.organizer_id).where(relation.c.follower_id == target.id)
    )
    query = db.query(models.User).filter(models.User.id.in_(ids))
    if not is_owner:
        if current_user:
            visible_private_ids = select(relation.c.organizer_id).where(
                relation.c.follower_id == current_user.id
            )
            query = query.filter(
                (models.User.is_public == 1) | models.User.id.in_(visible_private_ids)
            )
        else:
            query = query.filter(models.User.is_public == 1)
    if current_user and not is_owner:
        blocked_by_viewer = select(models.user_blocks.c.blocked_id).where(models.user_blocks.c.blocker_id == current_user.id)
        blocked_viewer = select(models.user_blocks.c.blocker_id).where(models.user_blocks.c.blocked_id == current_user.id)
        muted_by_viewer = select(models.user_mutes.c.muted_id).where(models.user_mutes.c.muter_id == current_user.id)
        query = query.filter(
            models.User.id.not_in(blocked_by_viewer),
            models.User.id.not_in(blocked_viewer),
            models.User.id.not_in(muted_by_viewer),
        )
    users = query.order_by(models.User.name.asc()).limit(100).all()
    following_ids = set()
    if current_user:
        following_ids = set(db.execute(
            select(relation.c.organizer_id).where(relation.c.follower_id == current_user.id)
        ).scalars())
    return [{
        "id": person.id,
        "name": person.name,
        "username": person.username,
        "role": person.role,
        "avatar_url": person.avatar_url,
        "following": person.id in following_ids,
    } for person in users]

@app.delete("/api/users/me/followers/{follower_id}")
def remove_follower(
    follower_id: int,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    result = db.execute(models.organizer_follows.delete().where(
        models.organizer_follows.c.follower_id == follower_id,
        models.organizer_follows.c.organizer_id == current_user.id,
    ))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Seguidor não encontrado.")
    db.commit()
    return {"removed": True}

def set_user_relationship(table, owner_column, target_column, target_id, current_user, db, enabled):
    """Cria ou remove uma relação de bloqueio/silenciamento pertencente ao utilizador atual."""
    if target_id == current_user.id:
        raise HTTPException(status_code=400, detail="Não pode aplicar esta definição à sua própria conta.")
    if not db.query(models.User.id).filter(models.User.id == target_id).first():
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")
    where = (owner_column == current_user.id) & (target_column == target_id)
    exists = db.execute(select(owner_column).where(where)).first()
    if enabled and not exists:
        db.execute(table.insert().values({owner_column.name: current_user.id, target_column.name: target_id}))
    elif not enabled and exists:
        db.execute(table.delete().where(where))
    db.commit()
    return {"enabled": enabled}

@app.post("/api/users/me/blocks/{target_id}")
def block_user(target_id: int, current_user: models.User = Depends(security.get_current_user), db: Session = Depends(database.get_db)):
    result = set_user_relationship(models.user_blocks, models.user_blocks.c.blocker_id, models.user_blocks.c.blocked_id, target_id, current_user, db, True)
    db.execute(models.organizer_follows.delete().where(
        (
            (models.organizer_follows.c.follower_id == current_user.id)
            & (models.organizer_follows.c.organizer_id == target_id)
        ) | (
            (models.organizer_follows.c.follower_id == target_id)
            & (models.organizer_follows.c.organizer_id == current_user.id)
        )
    ))
    db.execute(models.follow_requests.delete().where(
        (
            (models.follow_requests.c.requester_id == current_user.id)
            & (models.follow_requests.c.target_id == target_id)
        ) | (
            (models.follow_requests.c.requester_id == target_id)
            & (models.follow_requests.c.target_id == current_user.id)
        )
    ))
    db.commit()
    return result

@app.delete("/api/users/me/blocks/{target_id}")
def unblock_user(target_id: int, current_user: models.User = Depends(security.get_current_user), db: Session = Depends(database.get_db)):
    return set_user_relationship(models.user_blocks, models.user_blocks.c.blocker_id, models.user_blocks.c.blocked_id, target_id, current_user, db, False)

@app.get("/api/users/me/blocks")
def get_blocked_users(current_user: models.User = Depends(security.get_current_user), db: Session = Depends(database.get_db)):
    ids = select(models.user_blocks.c.blocked_id).where(models.user_blocks.c.blocker_id == current_user.id)
    return [{"id": person.id, "name": person.name, "username": person.username} for person in db.query(models.User).filter(models.User.id.in_(ids)).all()]

@app.post("/api/users/me/mutes/{target_id}")
def mute_user(target_id: int, current_user: models.User = Depends(security.get_current_user), db: Session = Depends(database.get_db)):
    return set_user_relationship(models.user_mutes, models.user_mutes.c.muter_id, models.user_mutes.c.muted_id, target_id, current_user, db, True)

@app.delete("/api/users/me/mutes/{target_id}")
def unmute_user(target_id: int, current_user: models.User = Depends(security.get_current_user), db: Session = Depends(database.get_db)):
    return set_user_relationship(models.user_mutes, models.user_mutes.c.muter_id, models.user_mutes.c.muted_id, target_id, current_user, db, False)

@app.get("/api/users/me/mutes")
def get_muted_users(current_user: models.User = Depends(security.get_current_user), db: Session = Depends(database.get_db)):
    ids = select(models.user_mutes.c.muted_id).where(models.user_mutes.c.muter_id == current_user.id)
    return [{"id": person.id, "name": person.name, "username": person.username} for person in db.query(models.User).filter(models.User.id.in_(ids)).all()]

@app.get("/api/users/me/network-summary")
def get_my_network_summary(current_user: models.User = Depends(security.get_current_user), db: Session = Depends(database.get_db)):
    relation = models.organizer_follows
    return {
        "follower_count": db.query(relation).filter(relation.c.organizer_id == current_user.id).count(),
        "following_count": db.query(relation).filter(relation.c.follower_id == current_user.id).count(),
        "attended_events_count": db.execute(select(func.count()).select_from(models.registrations).where(
            models.registrations.c.user_id == current_user.id,
            models.registrations.c.checked_in_at.is_not(None),
        )).scalar_one(),
    }

@app.get("/api/events/{event_id}/mutual-attendees")
def get_mutual_event_attendees(
    event_id: int,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Devolve participantes seguidos pelo visitante, excluindo relações bloqueadas ou silenciadas."""
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    if event.status == "cancelled":
        return []
    rows = db.query(models.User).join(
        models.registrations, models.registrations.c.user_id == models.User.id
    ).join(
        models.organizer_follows, models.organizer_follows.c.organizer_id == models.User.id
    ).filter(
        models.registrations.c.event_id == event_id,
        models.organizer_follows.c.follower_id == current_user.id,
        models.User.id != current_user.id,
        (
            (models.User.is_public == 1)
            | models.User.id.in_(
                select(models.organizer_follows.c.organizer_id).where(
                    models.organizer_follows.c.follower_id == current_user.id
                )
            )
        ),
        models.User.id.not_in(select(models.user_blocks.c.blocked_id).where(models.user_blocks.c.blocker_id == current_user.id)),
        models.User.id.not_in(select(models.user_blocks.c.blocker_id).where(models.user_blocks.c.blocked_id == current_user.id)),
        models.User.id.not_in(select(models.user_mutes.c.muted_id).where(models.user_mutes.c.muter_id == current_user.id)),
    ).limit(12).all()
    return [{"id": person.id, "name": person.name, "username": person.username, "avatar_url": person.avatar_url} for person in rows]

@app.get("/api/tickets/{ticket_code}")
def get_public_ticket(ticket_code: str, db: Session = Depends(database.get_db)):
    registration = db.execute(
        select(models.registrations).where(models.registrations.c.ticket_code == ticket_code)
    ).mappings().first()
    if not registration:
        raise HTTPException(status_code=404, detail="Bilhete não encontrado.")
    event = db.query(models.Event).filter(models.Event.id == registration["event_id"]).first()
    attendee = db.query(models.User).filter(models.User.id == registration["user_id"]).first()
    if not event or not attendee:
        raise HTTPException(status_code=404, detail="Bilhete não encontrado.")
    return {
        "event_id": event.id,
        "event_title": event.title,
        "event_date": event.date,
        "event_time": event.time,
        "event_location": event.location,
        "attendee_name": attendee.name,
        "status": (
            "cancelled" if event.status == "cancelled"
            else "checked_in" if registration["checked_in_at"]
            else "valid"
        ),
        "checked_in_at": registration["checked_in_at"],
    }


@app.post("/api/events/{event_id}/staff-requests")
def request_event_staff_access(
    event_id: int,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    if current_user.role != "staff":
        raise HTTPException(status_code=403, detail="Só as contas da equipa podem pedir acesso a eventos.")
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    if event.status == "cancelled":
        raise HTTPException(status_code=400, detail="Não é possível pedir acesso a um evento cancelado.")
    if event.organizer_id == current_user.id:
        raise HTTPException(status_code=400, detail="Não pode pedir acesso ao seu próprio evento.")

    existing = db.execute(
        select(models.event_staff).where(
            models.event_staff.c.event_id == event_id,
            models.event_staff.c.staff_id == current_user.id,
        )
    ).mappings().first()
    if existing and existing["status"] in ("pending", "approved"):
        return {"status": existing["status"], "message": "O seu pedido já foi registado."}
    values = {
        "event_id": event_id,
        "staff_id": current_user.id,
        "status": "pending",
        "requested_at": datetime.utcnow(),
        "reviewed_at": None,
        "reviewed_by": None,
    }
    if existing:
        db.execute(
            models.event_staff.update()
            .where(
                models.event_staff.c.event_id == event_id,
                models.event_staff.c.staff_id == current_user.id,
            )
            .values(**{key: value for key, value in values.items() if key not in ("event_id", "staff_id")})
        )
    else:
        db.execute(models.event_staff.insert().values(**values))
    db.commit()
    return {"status": "pending", "message": "Pedido de acesso enviado ao organizador do evento."}


@app.get("/api/users/me/staff-events")
def get_my_staff_events(
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    if current_user.role != "staff":
        raise HTTPException(status_code=403, detail="Esta funcionalidade só está disponível para contas da equipa.")
    rows = db.execute(
        select(models.event_staff.c.event_id, models.event_staff.c.status)
        .where(models.event_staff.c.staff_id == current_user.id)
    ).all()
    return [{"event_id": row.event_id, "status": row.status} for row in rows]


@app.get("/api/events/{event_id}/staff")
def get_event_staff(
    event_id: int,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    require_organizer_event(event_id, current_user, db)
    rows = db.execute(
        select(models.event_staff, models.User.name, models.User.email)
        .join(models.User, models.User.id == models.event_staff.c.staff_id)
        .where(models.event_staff.c.event_id == event_id)
        .order_by(models.event_staff.c.requested_at.asc())
    ).all()
    return [
        {
            "staff_id": row.staff_id,
            "name": row.name,
            "email": row.email,
            "status": row.status,
            "requested_at": row.requested_at,
        }
        for row in rows
    ]


@app.post("/api/events/{event_id}/staff")
def invite_event_staff(
    event_id: int,
    invite: schemas.StaffInvite,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    event = require_organizer_event(event_id, current_user, db)
    if event.status == "cancelled":
        raise HTTPException(status_code=400, detail="Não é possível adicionar membros da equipa a um evento cancelado.")
    staff_user = db.query(models.User).filter(
        func.lower(models.User.email) == str(invite.email).lower()
    ).first()
    if not staff_user or staff_user.role != "staff":
        raise HTTPException(status_code=404, detail="Não foi encontrada nenhuma conta da equipa com esse endereço de e-mail.")
    existing = db.execute(
        select(models.event_staff).where(
            models.event_staff.c.event_id == event_id,
            models.event_staff.c.staff_id == staff_user.id,
        )
    ).first()
    now = datetime.utcnow()
    if existing:
        db.execute(
            models.event_staff.update()
            .where(
                models.event_staff.c.event_id == event_id,
                models.event_staff.c.staff_id == staff_user.id,
            )
            .values(status="approved", reviewed_at=now, reviewed_by=current_user.id)
        )
    else:
        db.execute(models.event_staff.insert().values(
            event_id=event_id,
            staff_id=staff_user.id,
            status="approved",
            requested_at=now,
            reviewed_at=now,
            reviewed_by=current_user.id,
        ))
    db.commit()
    return {"status": "approved", "staff_id": staff_user.id, "name": staff_user.name}


@app.post("/api/events/{event_id}/staff/{staff_id}/decision")
def decide_event_staff_request(
    event_id: int,
    staff_id: int,
    decision: schemas.StaffRequestDecision,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    event = require_organizer_event(event_id, current_user, db)
    if event.status == "cancelled" and decision.status == "approved":
        raise HTTPException(status_code=400, detail="Não é possível aprovar o acesso a um evento cancelado.")
    affiliation = db.execute(
        select(models.event_staff).where(
            models.event_staff.c.event_id == event_id,
            models.event_staff.c.staff_id == staff_id,
        )
    ).first()
    if not affiliation:
        raise HTTPException(status_code=404, detail="Pedido de acesso da equipa não encontrado.")
    db.execute(
        models.event_staff.update()
        .where(
            models.event_staff.c.event_id == event_id,
            models.event_staff.c.staff_id == staff_id,
        )
        .values(status=decision.status, reviewed_at=datetime.utcnow(), reviewed_by=current_user.id)
    )
    db.commit()
    return {"status": decision.status}


@app.post("/api/tickets/verify-entry")
def verify_ticket_entry(
    verification: schemas.TicketVerificationRequest,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    if current_user.role != "staff":
        raise HTTPException(status_code=403, detail="Só as contas da equipa podem validar bilhetes.")
    affiliation = db.execute(
        select(models.event_staff.c.status).where(
            models.event_staff.c.event_id == verification.event_id,
            models.event_staff.c.staff_id == current_user.id,
        )
    ).scalar_one_or_none()
    if affiliation != "approved":
        raise HTTPException(status_code=403, detail="Não tem autorização para validar bilhetes neste evento.")

    ticket_code = ticket_code_from_payload(verification.ticket_payload)
    registration = db.execute(
        select(models.registrations).where(models.registrations.c.ticket_code == ticket_code)
    ).mappings().first()
    if not registration:
        raise HTTPException(status_code=404, detail="Bilhete não encontrado.")
    if registration["event_id"] != verification.event_id:
        raise HTTPException(status_code=400, detail="Este bilhete pertence a outro evento.")
    event = db.query(models.Event).filter(models.Event.id == verification.event_id).first()
    if not event or event.status == "cancelled":
        raise HTTPException(status_code=400, detail="Este evento foi cancelado; não é permitida a entrada.")
    attendee = db.query(models.User).filter(models.User.id == registration["user_id"]).first()
    if not attendee:
        raise HTTPException(status_code=404, detail="Titular do bilhete não encontrado.")

    checked_in_at = datetime.utcnow()
    result = db.execute(
        update(models.registrations)
        .where(
            models.registrations.c.ticket_code == ticket_code,
            models.registrations.c.event_id == verification.event_id,
            models.registrations.c.checked_in_at.is_(None),
        )
        .values(checked_in_at=checked_in_at, checked_in_by=current_user.id)
    )
    if result.rowcount != 1:
        db.rollback()
        registration = db.execute(
            select(models.registrations.c.checked_in_at).where(
                models.registrations.c.ticket_code == ticket_code,
                models.registrations.c.event_id == verification.event_id,
            )
        ).first()
        if registration and registration.checked_in_at:
            raise HTTPException(
                status_code=409,
                detail=f"O bilhete já foi validado às {registration.checked_in_at.isoformat()} UTC.",
            )
        raise HTTPException(status_code=409, detail="Não foi possível validar o bilhete; leia-o novamente.")
    db.commit()
    return {
        "status": "checked_in",
        "attendee_name": attendee.name,
        "event_title": event.title,
        "checked_in_at": checked_in_at.isoformat() + "Z",
    }

# --- EVENTOS ---

@app.get("/api/events", response_model=List[schemas.EventResponse])
def list_events(
    search: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Event)
    if search:
        query = query.filter(
            models.Event.title.contains(search) | models.Event.description.contains(search)
        )
    if category:
        query = query.filter(models.Event.category == category)
    
    events = query.all()
    results = []
    for event in events:
        results.append(event_response(event))
    return results

@app.post("/api/events", response_model=schemas.EventResponse, status_code=status.HTTP_201_CREATED)
def create_event(
    event_data: schemas.EventCreate,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db)
):
    if current_user.role != "organizer":
        raise HTTPException(status_code=403, detail="Selecione o tipo de conta de organizador para criar eventos.")
    if event_data.max_participants <= 0:
        raise HTTPException(status_code=400, detail="O número máximo de participantes deve ser maior que zero.")

    event = models.Event(**event_data.dict(), organizer_id=current_user.id)
    db.add(event)
    db.commit()
    db.refresh(event)
    
    response_data = event_response(event)
    return response_data

@app.get("/api/events/{event_id}", response_model=schemas.EventResponse)
def get_event(event_id: int, db: Session = Depends(database.get_db)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    
    return event_response(event)

@app.get("/api/events/{event_id}/participants", response_model=List[schemas.EventParticipantResponse])
def get_event_participants(
    event_id: int,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    require_organizer_event(event_id, current_user, db)
    rows = db.execute(
        select(
            models.User.name,
            models.User.email,
            models.registrations.c.created_at,
            models.registrations.c.checked_in_at,
        )
        .join(models.registrations, models.registrations.c.user_id == models.User.id)
        .where(models.registrations.c.event_id == event_id)
        .order_by(models.registrations.c.created_at.asc(), models.User.name.asc())
    ).all()
    return [
        {
            "name": row.name,
            "email": row.email,
            "registered_at": (
                row.created_at.replace(tzinfo=timezone.utc)
                if row.created_at and row.created_at.tzinfo is None
                else row.created_at
            ),
            "checked_in": row.checked_in_at is not None,
            "checked_in_at": (
                row.checked_in_at.replace(tzinfo=timezone.utc)
                if row.checked_in_at and row.checked_in_at.tzinfo is None
                else row.checked_in_at
            ),
        }
        for row in rows
    ]

@app.put("/api/events/{event_id}", response_model=schemas.EventResponse)
def update_event(
    event_id: int,
    event_data: schemas.EventCreate,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Não tens permissão para editar este evento.")
    if event_data.max_participants <= 0:
        raise HTTPException(status_code=400, detail="O número máximo de participantes deve ser maior que zero.")

    for field, value in event_data.dict().items():
        setattr(event, field, value)
    db.commit()
    db.refresh(event)

    return event_response(event)

@app.delete("/api/events/{event_id}")
def delete_event(
    event_id: int,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Não tens permissão para remover este evento.")

    db.execute(models.event_staff.delete().where(models.event_staff.c.event_id == event_id))
    db.delete(event)
    db.commit()
    return {"message": "Evento removido com sucesso."}

@app.post("/api/events/{event_id}/cancel", response_model=schemas.EventResponse)
def cancel_event(
    event_id: int,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Não tens permissão para cancelar este evento.")

    event.status = "cancelled"
    db.commit()
    db.refresh(event)

    return event_response(event)

# --- INSCRIÇÕES E FAVORITOS ---

@app.post("/api/events/{event_id}/register")
def register_for_event(
    event_id: int,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db)
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    if event.status == "cancelled":
        raise HTTPException(status_code=400, detail="Não é possível inscrever-se num evento cancelado.")

    if event.organizer_id == current_user.id:
        raise HTTPException(status_code=400, detail="O organizador não pode inscrever-se no seu próprio evento.")
    
    if len(event.participants) >= event.max_participants:
        raise HTTPException(status_code=400, detail="Evento esgotado.")
        
    if current_user in event.participants:
        raise HTTPException(status_code=400, detail="Já está inscrito neste evento.")

    event.participants.append(current_user)
    db.commit()
    return {"message": "Inscrição realizada com sucesso!"}

@app.delete("/api/events/{event_id}/register")
def leave_event(
    event_id: int,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db),
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")
    if event.organizer_id == current_user.id:
        raise HTTPException(status_code=400, detail="O organizador não pode cancelar a inscrição no seu próprio evento.")
    if current_user not in event.participants:
        raise HTTPException(status_code=400, detail="Não está inscrito neste evento.")

    event.participants.remove(current_user)
    db.commit()
    return {
        "message": "Saiu do evento.",
        "participants_count": len(event.participants),
    }

@app.post("/api/favorites/{event_id}")
def toggle_favorite(
    event_id: int,
    current_user: models.User = Depends(security.get_current_user),
    db: Session = Depends(database.get_db)
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    if event in current_user.favorite_events:
        current_user.favorite_events.remove(event)
        message = "Removido dos favoritos"
    else:
        current_user.favorite_events.append(event)
        message = "Adicionado aos favoritos"

    db.commit()
    return {"message": message}