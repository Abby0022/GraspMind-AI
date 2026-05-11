import asyncio
import httpx

async def test():
    async with httpx.AsyncClient() as client:
        pass
        # I need the token. I can't test it directly without a valid token.
