from sqlalchemy.orm import Session
from models.database import Policy, RuleType, ActionType
from typing import List, Tuple, Optional, Dict, Any
import re
from services.embedding_svc import embedding_service
from services.vector_svc import vector_service

def fetch_policies_for_department(db: Session, department: str) -> List[Policy]:
    """Fetches policies applicable to a specific department, plus global policies (department='*')."""
    try:
        return db.query(Policy).filter(
            (Policy.department == department) | (Policy.department == '*')
        ).all()
    except Exception as e:
        print(f"Database error while fetching policies: {e}. Failing safe (Allow).")
        return []

async def unified_scan(
    prompt: str,
    department: str,
    db: Session
) -> Dict[str, Any]:
    """
    Executes a unified scan utilizing both Regex patterns and Semantic similarity.
    """
    policies = fetch_policies_for_department(db, department)

    # 1. Regex Scan Phase
    regex_policies = [p for p in policies if p.rule_type == RuleType.REGEX]
    for policy in regex_policies:
        if policy.regex_pattern:
            if re.search(policy.regex_pattern, prompt, re.IGNORECASE):
                return {
                    "decision": policy.action.value.upper(),
                    "reason": policy.name,
                    "violated_policy_id": policy.id,
                    "risk_score": 1.0,
                    "details": [f"Matched regex pattern from policy '{policy.name}'"]
                }

    # 2. Semantic Scan Phase
    # (Only run if no regex matched, or you could run both and take the highest severity)
    # For Phase 2, we will run Semantic if regex passes.
    semantic_policies = [p for p in policies if p.rule_type == RuleType.SEMANTIC]
    
    # Generate embedding once for semantic checks
    query_embedding = await embedding_service.generate_embedding(prompt)
    matched_secret, score = await vector_service.search_similar(query_embedding)

    for policy in semantic_policies:
        threshold = policy.threshold or 0.80 # Fallback
        if score >= threshold:
            return {
                "decision": policy.action.value.upper(),
                "reason": policy.name,
                "violated_policy_id": policy.id,
                "risk_score": score,
                "details": [f"Matched semantic secret with score {score:.2f} >= threshold {threshold}"]
            }

    # 3. Default Pass
    return {
        "decision": "PASS",
        "reason": "No policies violated",
        "violated_policy_id": None,
        "risk_score": score if 'score' in locals() else 0.0,
        "details": []
    }
