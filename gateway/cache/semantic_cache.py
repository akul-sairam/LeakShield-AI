import os
import uuid
from typing import Optional
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, PointStruct
from sentence_transformers import SentenceTransformer

QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
COLLECTION_NAME = "semantic_cache"
SIMILARITY_THRESHOLD = 0.98

class SemanticCache:
    def __init__(self):
        self.client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.dimension = self.model.get_sentence_embedding_dimension()
        self._init_collection()

    def _init_collection(self):
        collections = self.client.get_collections().collections
        if not any(c.name == COLLECTION_NAME for c in collections):
            self.client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=self.dimension, distance=Distance.COSINE)
            )

    def get_cached_response(self, prompt: str) -> Optional[str]:
        vector = self.model.encode(prompt).tolist()
        results = self.client.search(
            collection_name=COLLECTION_NAME,
            query_vector=vector,
            limit=1,
            score_threshold=SIMILARITY_THRESHOLD
        )
        if results:
            return results[0].payload.get("response")
        return None

    def cache_response(self, prompt: str, response: str):
        vector = self.model.encode(prompt).tolist()
        point_id = str(uuid.uuid4())
        self.client.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={"prompt": prompt, "response": response}
                )
            ]
        )

semantic_cache = SemanticCache()
