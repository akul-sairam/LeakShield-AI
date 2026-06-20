from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from api.ingest import router as ingest_router
from api.scan import router as scan_router
from api.policies import router as policies_router
from api.audit import router as audit_router
from services.embedding_svc import embedding_service
from services.vector_svc import vector_service
from models.database import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Initializing LeakShield Engine Phase 3...")
    try:
        init_db()
        print("Database initialized.")
        await vector_service.initialize_collection(vector_size=embedding_service.embedding_dimension)
        print("Vector Vault initialized.")
    except Exception as e:
        print(f"Error during initialization: {e}")
    yield
    print("Shutting down LeakShield Engine...")

app = FastAPI(
    title="LeakShield Engine",
    description="Enterprise AI Firewall Backend - Phase 3: Command Center",
    version="3.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the routers
app.include_router(ingest_router)
app.include_router(scan_router)
app.include_router(policies_router)
app.include_router(audit_router)

@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
