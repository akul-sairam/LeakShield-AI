from fastapi import Security, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os

security = HTTPBearer()

# In a real app, these would come from a secure secret store
ADMIN_KEY = os.getenv("ADMIN_API_KEY", "admin-secret-key")
SERVICE_KEY = os.getenv("SERVICE_API_KEY", "service-secret-key")

def get_current_user_admin(credentials: HTTPAuthorizationCredentials = Security(security)):
    if credentials.credentials != ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials or insufficient permissions (Admin required)",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return "admin"

def get_current_user_service(credentials: HTTPAuthorizationCredentials = Security(security)):
    # Admin can also access service endpoints
    if credentials.credentials not in [ADMIN_KEY, SERVICE_KEY]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return "service"
