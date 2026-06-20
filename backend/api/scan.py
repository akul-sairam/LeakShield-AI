from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from api.auth import get_current_user_service
from models.database import get_db, SessionLocal
from services.policy_svc import unified_scan
from services.audit_svc import log_audit_event

router = APIRouter(prefix="/api/v1", tags=["Scan"])

class ScanRequest(BaseModel):
    user_id: str = Field(..., description="ID of the user making the prompt")
    department: str = Field(..., description="Department of the user")
    prompt: str = Field(..., min_length=1, description="The user prompt to scan against the knowledge base")

class ScanResponse(BaseModel):
    decision: str
    reason: str
    details: List[str]

@router.post("/scan", response_model=ScanResponse, summary="Scan a prompt using Unified Policy Engine", dependencies=[Depends(get_current_user_service)])
async def scan_prompt(request: ScanRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    try:
        # Run the unified scan
        result = await unified_scan(prompt=request.prompt, department=request.department, db=db)

        # Trigger background task for audit logging
        # We create a new session specifically for the background task to avoid issues with the request session closing
        bg_db = SessionLocal()
        background_tasks.add_task(
            log_audit_event,
            db=bg_db,
            user_id=request.user_id,
            department=request.department,
            prompt_preview=request.prompt,
            violated_policy_id=result["violated_policy_id"],
            risk_score=result["risk_score"]
        )

        return ScanResponse(
            decision=result["decision"],
            reason=result["reason"],
            details=result["details"]
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scan prompt: {str(e)}")
