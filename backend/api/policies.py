from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from api.auth import get_current_user_admin
from models.database import get_db, Policy, AuditLog, RuleType, ActionType

router = APIRouter(prefix="/api/v1", tags=["Policies"])

class PolicyCreate(BaseModel):
    name: str = Field(..., description="Name of the policy")
    department: str = Field(..., description="Department this applies to (use '*' for global)")
    rule_type: RuleType = Field(..., description="semantic or regex")
    action: ActionType = Field(..., description="block, redact, or warn")
    threshold: Optional[float] = Field(None, description="Similarity threshold for semantic rules")
    regex_pattern: Optional[str] = Field(None, description="Pattern for regex rules")

class PolicyResponse(PolicyCreate):
    id: int

@router.post("/policies", response_model=PolicyResponse, summary="Create a new policy rule", dependencies=[Depends(get_current_user_admin)])
async def create_policy(policy_req: PolicyCreate, db: Session = Depends(get_db)):
    if policy_req.rule_type == RuleType.REGEX and not policy_req.regex_pattern:
        raise HTTPException(status_code=400, detail="regex_pattern is required for REGEX rules")
    if policy_req.rule_type == RuleType.SEMANTIC and policy_req.threshold is None:
        raise HTTPException(status_code=400, detail="threshold is required for SEMANTIC rules")

    new_policy = Policy(
        name=policy_req.name,
        department=policy_req.department,
        rule_type=policy_req.rule_type,
        action=policy_req.action,
        threshold=policy_req.threshold,
        regex_pattern=policy_req.regex_pattern
    )
    db.add(new_policy)
    db.commit()
    db.refresh(new_policy)
    return new_policy

@router.get("/policies", response_model=List[PolicyResponse], summary="Get all policies", dependencies=[Depends(get_current_user_admin)])
async def get_policies(db: Session = Depends(get_db)):
    """Returns a list of all active policies."""
    policies = db.query(Policy).all()
    return policies

@router.delete("/policies/{policy_id}", summary="Delete a policy", dependencies=[Depends(get_current_user_admin)])
async def delete_policy(policy_id: int, db: Session = Depends(get_db)):
    policy = db.query(Policy).filter(Policy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    db.delete(policy)
    db.commit()
    return {"detail": "Policy deleted"}

@router.get("/analytics", summary="Get policy violation analytics", dependencies=[Depends(get_current_user_admin)])
async def get_analytics(db: Session = Depends(get_db)):
    """Returns a summary of the leakiest departments."""
    
    # Query to count violations per department
    results = (
        db.query(AuditLog.department, func.count(AuditLog.id).label('count'))
        .filter(AuditLog.violated_policy_id.isnot(None))
        .filter(AuditLog.department.isnot(None))
        .group_by(AuditLog.department)
        .order_by(func.count(AuditLog.id).desc())
        .limit(10)
        .all()
    )

    analytics = []
    for department, count in results:
        analytics.append({
            "policy_name": department, # map to 'policy_name' so Recharts uses it seamlessly in the UI as the label
            "violations_count": count
        })

    total_scans = db.query(func.count(AuditLog.id)).scalar()
    blocked_scans = db.query(func.count(AuditLog.id)).filter(AuditLog.violated_policy_id.isnot(None)).scalar()

    return {
        "top_violations": analytics,
        "total_scans": total_scans or 0,
        "blocked_scans": blocked_scans or 0
    }
