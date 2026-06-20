from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from api.auth import get_current_user_admin
from models.database import get_db, AuditLog

router = APIRouter(prefix="/api/v1", tags=["Audit Logs"])

class AuditLogResponse(BaseModel):
    id: int
    user_id: str
    prompt_preview: str
    violated_policy_id: Optional[int]
    risk_score: float
    timestamp: datetime

    class Config:
        from_attributes = True

@router.get("/audit-logs", response_model=List[AuditLogResponse], summary="Get recent audit logs", dependencies=[Depends(get_current_user_admin)])
async def get_audit_logs(limit: int = 50, db: Session = Depends(get_db)):
    """Returns a list of recent audit logs."""
    logs = db.query(AuditLog).order_by(desc(AuditLog.timestamp)).limit(limit).all()
    return logs
