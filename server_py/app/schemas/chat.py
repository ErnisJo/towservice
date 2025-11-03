from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class ChatMessageCreate(BaseModel):
    text: str
    sender: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None


class ChatMessageResponse(BaseModel):
    id: int
    user_id: int = Field(alias="userId")
    sender: str
    text: str
    created_at: datetime = Field(alias="createdAt")
    meta: Optional[Dict[str, Any]] = None

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }
