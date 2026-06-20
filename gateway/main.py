from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.responses import StreamingResponse
from typing import Dict, Any
import httpx
import os
import uuid
import time
import json
import asyncio

from cache.semantic_cache import semantic_cache
from providers.openai_client import OpenAIClient
from providers.anthropic_client import AnthropicClient
from providers.gemini_client import GeminiClient

app = FastAPI(title="LeakShield Gateway", version="4.0.0")

INTERNAL_API_URL = os.getenv("INTERNAL_API_URL", "http://leakshield-api:8000/api/v1")
SERVICE_API_KEY = os.getenv("SERVICE_API_KEY", "service-secret-key")

providers = {
    "openai": OpenAIClient(),
    "anthropic": AnthropicClient(),
    "gemini": GeminiClient()
}

async def scan_payload(user_id: str, department: str, prompt: str) -> dict:
    """Calls the Phase 1 & 2 Security Engine to verify the prompt."""
    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {SERVICE_API_KEY}"}
        payload = {
            "user_id": user_id,
            "department": department,
            "prompt": prompt
        }
        response = await client.post(f"{INTERNAL_API_URL}/scan", json=payload, headers=headers)
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to connect to LeakShield Security Engine")
        return response.json()

async def mock_streaming_response(response_text: str):
    """Simulates streaming response chunks back to the client."""
    chunk_size = 5
    for i in range(0, len(response_text), chunk_size):
        chunk = response_text[i:i+chunk_size]
        data = {
            "id": f"chatcmpl-{uuid.uuid4()}",
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": "proxy-model",
            "choices": [{"index": 0, "delta": {"content": chunk}, "finish_reason": None}]
        }
        yield f"data: {json.dumps(data)}\n\n"
        await asyncio.sleep(0.01)
    
    data = {
        "id": f"chatcmpl-{uuid.uuid4()}",
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": "proxy-model",
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]
    }
    yield f"data: {json.dumps(data)}\n\n"
    yield "data: [DONE]\n\n"

@app.post("/v1/chat/completions")
async def chat_completions(
    request: Request,
    x_leakshield_provider: str = Header("openai", description="The LLM provider to route to (openai, anthropic, gemini)"),
    x_user_id: str = Header(..., description="The ID of the user making the request"),
    x_department: str = Header(..., description="The department of the user")
):
    body = await request.json()
    is_stream = body.get("stream", False)
    
    messages = body.get("messages", [])
    if not messages:
        raise HTTPException(status_code=400, detail="Messages array cannot be empty")
    
    last_message = messages[-1].get("content", "")

    # 1. Proxy Loop Step 1: Scan the request via LeakShield Engine
    scan_result = await scan_payload(x_user_id, x_department, last_message)
    if scan_result["decision"] == "BLOCK":
        raise HTTPException(
            status_code=403, 
            detail=f"LeakShield Blocked Request: {scan_result.get('reason', 'Policy Violation')}"
        )
    
    # If REDACTED, update the prompt
    if scan_result["decision"] == "REDACT" and scan_result.get("redacted_prompt"):
        messages[-1]["content"] = scan_result["redacted_prompt"]
        body["messages"] = messages
        last_message = scan_result["redacted_prompt"]

    # 2. Semantic Caching: Check if we have answered this before
    cached_response = semantic_cache.get_cached_response(last_message)
    if cached_response:
        print(f"Cache HIT for prompt: {last_message[:50]}...")
        if is_stream:
            return StreamingResponse(mock_streaming_response(cached_response), media_type="text/event-stream")
        return {
            "id": f"chatcmpl-{uuid.uuid4()}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": body.get("model", "cached-model"),
            "choices": [{"index": 0, "message": {"role": "assistant", "content": cached_response}, "finish_reason": "stop"}],
            "leakshield_status": "CACHE_HIT"
        }

    # 3. Proxy Loop Step 2: Forward to real provider
    provider_client = providers.get(x_leakshield_provider.lower())
    if not provider_client:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {x_leakshield_provider}")
    
    # We turn off streaming for the upstream call so we can deep-scan the full response first
    body["stream"] = False 
    llm_response_text = await provider_client.chat_completion(body)

    # 4. Proxy Loop Step 3: Deep Scan the AI's response before returning it
    response_scan = await scan_payload(x_user_id, x_department, llm_response_text)
    if response_scan["decision"] == "BLOCK":
        raise HTTPException(
            status_code=403,
            detail="LeakShield Blocked Response: The AI generated sensitive internal information."
        )
    
    final_response_text = llm_response_text
    if response_scan["decision"] == "REDACT" and response_scan.get("redacted_prompt"):
        final_response_text = response_scan["redacted_prompt"]

    # 5. Cache the safe response
    semantic_cache.cache_response(last_message, final_response_text)

    # 6. Return response to user (simulating stream if requested)
    if is_stream:
        return StreamingResponse(mock_streaming_response(final_response_text), media_type="text/event-stream")
    
    return {
        "id": f"chatcmpl-{uuid.uuid4()}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": body.get("model", "proxy-model"),
        "choices": [{"index": 0, "message": {"role": "assistant", "content": final_response_text}, "finish_reason": "stop"}],
        "leakshield_status": "SCANNED_AND_SAFE"
    }
