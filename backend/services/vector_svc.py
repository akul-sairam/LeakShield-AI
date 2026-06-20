from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from typing import List, Tuple, Optional
import uuid
import os

class VectorService:
    def __init__(self, port: int = 6333):
        host = os.getenv("QDRANT_HOST", "localhost")
        self.client = AsyncQdrantClient(host=host, port=port)
        self.collection_name = "sensitive_vault"

    async def initialize_collection(self, vector_size: int):
        """
        Checks if the collection exists, and if not, creates it.
        """
        collections_response = await self.client.get_collections()
        collection_names = [col.name for col in collections_response.collections]

        if self.collection_name not in collection_names:
            await self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
            )
            print(f"Collection '{self.collection_name}' created successfully.")
        else:
            print(f"Collection '{self.collection_name}' already exists.")

    async def upsert_chunks(self, chunks: List[str], embeddings: List[List[float]], source_id: str):
        """
        Inserts a list of document chunks and their corresponding embeddings into Qdrant.
        """
        points = []
        for chunk_text, embedding in zip(chunks, embeddings):
            point_id = str(uuid.uuid4())
            points.append(
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={"secret_text": chunk_text, "source_id": source_id}
                )
            )

        await self.client.upsert(
            collection_name=self.collection_name,
            points=points
        )

    async def search_similar(self, query_vector: List[float], limit: int = 1) -> Tuple[Optional[str], float]:
        """
        Searches for the most similar secret in the vault.
        Returns a tuple of (matched_secret_text, similarity_score).
        If no matches are found, returns (None, 0.0).
        """
        search_result = await self.client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=limit,
            with_payload=True
        )

        if not search_result:
            return None, 0.0

        top_match = search_result[0]
        # In Qdrant, distance=Distance.COSINE returns cosine similarity (higher is more similar)
        score = top_match.score
        matched_text = top_match.payload.get("secret_text") if top_match.payload else None

        return matched_text, score

# We will initialize this in main.py to allow configuration if needed
vector_service = VectorService()
