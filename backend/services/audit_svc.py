from sqlalchemy.orm import Session
from models.database import AuditLog
from datetime import datetime

def log_audit_event(
    db: Session,
    user_id: str,
    department: str,
    prompt_preview: str,
    violated_policy_id: int | None,
    risk_score: float
):
    """
    Logs an audit event to the database.
    This function is designed to be run in a FastAPI BackgroundTask.
    """
    try:
        audit_log = AuditLog(
            user_id=user_id,
            department=department,
            prompt_preview=prompt_preview[:255], # truncate if too long
            violated_policy_id=violated_policy_id,
            risk_score=risk_score,
            timestamp=datetime.utcnow()
        )
        db.add(audit_log)
        db.commit()
    except Exception as e:
        print(f"Failed to write audit log: {e}")
        db.rollback()
    finally:
        db.close()
