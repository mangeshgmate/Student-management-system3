import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models
from .auth import hash_password
from .database import Base, engine, SessionLocal
from .routers import (
    auth_router,
    assignments_router,
    submissions_router,
    misc_router,
)


def seed_admin() -> None:
    """
    Creates one admin account on startup, replacing the hardcoded
    admin@1234 / admin123 check that used to live in the React code.
    Override the defaults via env vars in production.
    """
    admin_email = os.getenv("ADMIN_EMAIL", "admin@1234")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin123")

    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.email == admin_email).first()
        if not existing:
            admin = models.User(
                full_name="Administrator",
                email=admin_email,
                hashed_password=hash_password(admin_password),
                role=models.RoleEnum.admin,
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_admin()
    yield


app = FastAPI(title="CloudApp API", version="1.0.0", lifespan=lifespan)

# The React dev server runs on :3000 by default (create-react-app).
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(assignments_router.router)
app.include_router(submissions_router.router)
app.include_router(misc_router.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "CloudApp API"}


@app.get("/health")
def health():
    return {"status": "healthy"}
