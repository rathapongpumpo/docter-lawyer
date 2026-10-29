from fastapi import APIRouter

from app.api import chat, documents, health, kb

router = APIRouter()
router.include_router(health.router)
router.include_router(chat.router)
router.include_router(kb.router)
router.include_router(documents.router)
