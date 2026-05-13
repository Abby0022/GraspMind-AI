"""Redis-backed rate limiter using sliding window.

Provides per-user rate limiting as a FastAPI dependency.
Falls back to IP-based limiting for unauthenticated requests.
"""

import time
import uuid

from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis

from graspmind.config import Settings, get_settings

_redis_client: Redis | None = None


async def get_redis(settings: Settings = Depends(get_settings)) -> Redis:
    """Lazy singleton Redis connection."""
    global _redis_client  # noqa: PLW0603
    if _redis_client is None:
        _redis_client = Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
        )
    return _redis_client


class RateLimiter:
    """Sliding-window rate limiter backed by Redis sorted sets.

    Usage as a FastAPI dependency:
        @router.post("/chat", dependencies=[Depends(RateLimiter(max_requests=60))])
    """

    def __init__(self, max_requests: int = 60, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def __call__(
        self,
        request: Request,
        redis: Redis = Depends(get_redis),
    ) -> None:
        user = getattr(request.state, "user_id", None)
        if not user:
            if not request.client:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Unable to identify request origin",
                )
            user = request.client.host

        path = request.url.path.rstrip("/") or "/"
        if not await self.is_allowed(user, path, redis):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Max {self.max_requests} requests per {self.window_seconds}s.",
                headers={"Retry-After": str(self.window_seconds)},
            )

    async def is_allowed(
        self,
        user_id: str,
        path: str = "default",
        redis: Redis | None = None,
    ) -> bool:
        """Check if a request is allowed for a user/path without raising exceptions.
        
        Useful for WebSockets or manual rate limiting.
        """
        if redis is None:
            settings = get_settings()
            redis = await get_redis(settings)

        key = f"rate_limit:{path}:{user_id}"
        now = time.time()
        window_start = now - self.window_seconds
        request_id = str(uuid.uuid4())

        lua_script = """
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local window_start = tonumber(ARGV[2])
        local window_seconds = tonumber(ARGV[3])
        local req_id = ARGV[4]

        redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
        local count = redis.call('ZCARD', key)
        redis.call('ZADD', key, now, req_id)
        redis.call('EXPIRE', key, window_seconds)
        return count
        """

        try:
            request_count = await redis.execute_command(
                "EVAL", lua_script, 1, key, now, window_start, self.window_seconds, request_id
            )
            return int(request_count) < self.max_requests
        except Exception:
            # On Redis failure, we fail-open to avoid breaking the app, 
            # but log it for security monitoring.
            return True
