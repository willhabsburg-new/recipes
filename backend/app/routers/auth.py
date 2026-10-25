from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user, end_session, hash_password, require_admin, start_session, verify_password
from ..config import Settings, app_settings
from ..db import get_db
from ..models import User
from ..schemas import AuthStatus, LoginIn, PasswordChange, SetupIn, UserCreate, UserOut, UserUpdate

router = APIRouter(tags=["auth"])


def _email(s: str) -> str:
    return s.strip().lower()


@router.get("/auth/status", response_model=AuthStatus)
def auth_status(request: Request, db: Session = Depends(get_db)):
    needs_setup = not db.scalar(select(func.count(User.id)))
    user = None
    if not needs_setup:
        try:
            user = current_user(request, db)
        except HTTPException:
            pass
    return AuthStatus(needs_setup=needs_setup, user=user)


@router.post("/auth/setup", response_model=UserOut, status_code=201)
def setup(body: SetupIn, response: Response, db: Session = Depends(get_db),
          settings: Settings = Depends(app_settings)):
    """Create the first (admin) account. Only works while there are no users."""
    if db.scalar(select(func.count(User.id))):
        raise HTTPException(status.HTTP_409_CONFLICT, "Setup has already been done")
    user = User(name=body.name.strip(), email=_email(body.email),
                password_hash=hash_password(body.password), is_admin=True)
    db.add(user)
    db.commit()
    start_session(db, response, user, settings)
    return user


@router.post("/auth/login", response_model=UserOut)
def login(body: LoginIn, response: Response, db: Session = Depends(get_db),
          settings: Settings = Depends(app_settings)):
    user = db.scalar(select(User).where(User.email == _email(body.email)))
    if not user or not verify_password(user.password_hash, body.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    start_session(db, response, user, settings)
    return user


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    end_session(db, request, response)


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.post("/auth/password", status_code=204)
def change_password(body: PasswordChange, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(user.password_hash, body.current_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is wrong")
    user = db.merge(user)
    user.password_hash = hash_password(body.new_password)
    db.commit()


@router.get("/users", response_model=list[UserOut])
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.name)).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    email = _email(body.email)
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already in use")
    user = User(name=body.name.strip(), email=email, password_hash=hash_password(body.password),
                is_admin=body.is_admin)
    db.add(user)
    db.commit()
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such user")
    if body.name is not None:
        user.name = body.name.strip()
    if body.is_admin is not None:
        if user.id == admin.id and not body.is_admin:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't remove your own admin rights")
        user.is_admin = body.is_admin
    if body.password:
        user.password_hash = hash_password(body.password)
    db.commit()
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't delete yourself")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such user")
    db.delete(user)
    db.commit()
