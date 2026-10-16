"""Gere hashing de palavras-passe, tokens JWT e identificação do utilizador."""

import os
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

import database, models, schemas

DEVELOPMENT_SECRET_KEY = "dev-only-change-me"
INSECURE_SECRET_KEYS = {
    DEVELOPMENT_SECRET_KEY,
    "change-me-in-production",
}


def is_production_environment() -> bool:
    """Return whether an environment variable explicitly marks this as production."""
    return any(
        os.getenv(name, "").strip().lower() in {"prod", "production"}
        for name in ("EVENTHUB_ENV", "APP_ENV", "ENVIRONMENT")
    )


def load_secret_key() -> str:
    """Load a configured JWT secret and reject development placeholders in production."""
    configured_key = os.getenv("EVENTHUB_SECRET_KEY") or os.getenv("JWT_SECRET_KEY")
    secret_key = configured_key.strip() if configured_key else ""
    if not secret_key:
        if is_production_environment():
            raise RuntimeError(
                "Set EVENTHUB_SECRET_KEY to a non-placeholder value in production."
            )
        return DEVELOPMENT_SECRET_KEY

    if is_production_environment() and secret_key.lower() in {
        value.lower() for value in INSECURE_SECRET_KEYS
    }:
        raise RuntimeError(
            "EVENTHUB_SECRET_KEY must not use a development placeholder in production."
        )
    return secret_key


SECRET_KEY = load_secret_key()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # Duração de 24 horas

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# --- FUNÇÕES DE PALAVRAS-PASSE ---

def hash_password(password: str) -> str:
    """Gera o hash encriptado da palavra-passe."""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Compara a palavra-passe fornecida com o hash guardado."""
    return pwd_context.verify(plain_password, hashed_password)

# --- FUNÇÕES DE TOKEN JWT ---

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Cria um novo token JWT com data de expiração."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --- DEPENDÊNCIA PARA PROTEGER ROTAS ---

def get_current_user(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_eventhub_token: Optional[str] = Header(default=None, alias="X-EventHub-Token"),
    db: Session = Depends(database.get_db),
) -> models.User:
    """Obtém e valida o utilizador autenticado através do Token JWT."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = None
    if authorization:
        scheme, _, provided_token = authorization.partition(" ")
        if scheme.lower() == "bearer" and provided_token:
            token = provided_token
    elif x_eventhub_token:
        token = x_eventhub_token

    if token is None:
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

def get_optional_current_user(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_eventhub_token: Optional[str] = Header(default=None, alias="X-EventHub-Token"),
    db: Session = Depends(database.get_db),
) -> Optional[models.User]:
    """Devolve a sessão autenticada quando as credenciais são opcionais."""
    if not authorization and not x_eventhub_token:
        return None
    return get_current_user(authorization, x_eventhub_token, db)