from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List
import uuid
from services.embedding_svc import embedding_service
from services.vector_svc import vector_service
from api.auth import get_current_user_admin
from langchain_text_splitters import RecursiveCharacterTextSplitter

router = APIRouter(prefix="/api/v1", tags=["Ingest"])

class IngestRequest(BaseModel):
    secrets: List[str] = Field(..., min_length=1, description="List of company secrets or large documents to ingest")

class IngestResponse(BaseModel):
    status: str
    message: str
    total_chunks: int

# Dependency added to ensure only admins can ingest
@router.post("/ingest", response_model=IngestResponse, summary="Ingest company secrets (Admin Only)", dependencies=[Depends(get_current_user_admin)])
async def ingest_secrets(request: IngestRequest):
    try:
        if not request.secrets:
            raise HTTPException(status_code=400, detail="Secret list cannot be empty.")

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=50,
            length_function=len,
            is_separator_regex=False,
        )

        total_chunks = 0

        for doc in request.secrets:
            # Generate chunks
            chunks = text_splitter.split_text(doc)
            if not chunks:
                continue
                
            total_chunks += len(chunks)
            source_id = str(uuid.uuid4())

            # Generate embeddings for chunks
            embeddings = await embedding_service.generate_embeddings(chunks)

            # Upsert chunks into Qdrant
            await vector_service.upsert_chunks(chunks, embeddings, source_id)

        return IngestResponse(
            status="success",
            message="Secrets successfully chunked and ingested into the sensitive vault.",
            total_chunks=total_chunks
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to ingest secrets: {str(e)}")
