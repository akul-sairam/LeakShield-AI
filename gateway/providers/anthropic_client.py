import os
from typing import Dict, Any
from providers.base import BaseProviderClient

class AnthropicClient(BaseProviderClient):
    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY")

    async def chat_completion(self, request_body: Dict[str, Any]) -> str:
        # Mock implementation for Claude
        print("Using Anthropic Claude Provider")
        return "This is a mocked response from Claude because no API key was provided."
