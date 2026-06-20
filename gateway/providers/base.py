from abc import ABC, abstractmethod
from typing import Dict, Any

class BaseProviderClient(ABC):
    @abstractmethod
    async def chat_completion(self, request_body: Dict[str, Any]) -> str:
        """
        Sends the request to the underlying LLM provider and returns the raw string response.
        """
        pass
