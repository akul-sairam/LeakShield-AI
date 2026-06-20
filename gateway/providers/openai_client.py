import httpx
import os
from typing import Dict, Any
from fastapi import HTTPException
from providers.base import BaseProviderClient

class OpenAIClient(BaseProviderClient):
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.base_url = "https://api.openai.com/v1"

    async def chat_completion(self, request_body: Dict[str, Any]) -> str:
        if not self.api_key:
            # Mocking response for testing without a real API key
            print("WARNING: OPENAI_API_KEY not set. Returning mocked OpenAI response.")
            return "This is a mocked response from OpenAI because no API key was provided."

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                json=request_body,
                headers=headers,
                timeout=30.0
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"OpenAI Error: {response.text}")
            
            data = response.json()
            return data["choices"][0]["message"]["content"]
