# LeakShield Engine Backend

This is Phase 1 of the LeakShield Engine, a Negative RAG Pipeline that checks if a user prompt is semantically related to a Knowledge Base of company secrets.

## Tech Stack
- **Python**: 3.10+
- **Framework**: FastAPI
- **Vector DB**: Qdrant
- **Embeddings**: `sentence-transformers` (`all-MiniLM-L6-v2`)

## Prerequisites

- Python 3.10+
- Docker (to run Qdrant)

## Running Qdrant via Docker

To start a local instance of Qdrant, run:

```bash
docker run -p 6333:6333 -p 6334:6334 \
    -v $(pwd)/qdrant_storage:/qdrant/storage:z \
    qdrant/qdrant
```

This will run Qdrant on port 6333 (HTTP) and 6334 (gRPC) and persist data in `./qdrant_storage`.

## Setup Instructions

1. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the Application:**
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

## Endpoints

- `POST /api/v1/ingest`: Ingests an array of company secret strings into Qdrant.
- `POST /api/v1/scan`: Scans a user prompt and returns whether it is safe or not based on semantic similarity.
