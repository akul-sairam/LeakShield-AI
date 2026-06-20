import asyncio
from sentence_transformers import SentenceTransformer
from typing import List
import numpy as np

class EmbeddingService:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        # Load the model synchronously during initialization
        self.model = SentenceTransformer(model_name)
        self.embedding_dimension = self.model.get_sentence_embedding_dimension()

    async def generate_embedding(self, text: str) -> List[float]:
        """
        Generates an embedding for a single string asynchronously.
        Runs the synchronous encoding in a threadpool to prevent blocking the event loop.
        """
        loop = asyncio.get_running_loop()
        # Encode returns a numpy array
        embedding_arr = await loop.run_in_executor(None, self.model.encode, text)
        return embedding_arr.tolist()

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Generates embeddings for a list of strings asynchronously.
        """
        loop = asyncio.get_running_loop()
        embeddings_arr = await loop.run_in_executor(None, self.model.encode, texts)
        return embeddings_arr.tolist()

# Singleton instance to be used across the application
embedding_service = EmbeddingService()
