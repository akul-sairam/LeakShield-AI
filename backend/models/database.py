import os
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Enum
from sqlalchemy.orm import declarative_base, sessionmaker
import enum
from datetime import datetime

# Database URL from environment or default local
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://leakshield:leakshield_password@localhost:5432/leakshield_db")

# Create synchronous engine
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class RuleType(str, enum.Enum):
    SEMANTIC = "semantic"
    REGEX = "regex"
    JAILBREAK = "jailbreak"

class ActionType(str, enum.Enum):
    BLOCK = "block"
    REDACT = "redact"
    WARN = "warn"

class Policy(Base):
    __tablename__ = "policies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    department = Column(String, index=True)
    rule_type = Column(Enum(RuleType))
    threshold = Column(Float, nullable=True) # Used for semantic rules
    action = Column(Enum(ActionType))
    regex_pattern = Column(String, nullable=True) # Used for regex rules

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    department = Column(String, index=True, nullable=True)
    prompt_preview = Column(String)
    violated_policy_id = Column(Integer, nullable=True)
    risk_score = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
