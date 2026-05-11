"""Taskiq broker configuration — Redis-backed async task queue.

This replaces Celery with a modern, async-native task queue
designed for FastAPI/asyncio applications.
"""

import logging
import traceback

from taskiq import TaskiqMessage, TaskiqMiddleware, TaskiqResult
from taskiq_redis import ListQueueBroker, RedisAsyncResultBackend

from graspmind.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

class DeadLetterQueueMiddleware(TaskiqMiddleware):
    """Middleware to catch failed tasks and push them to a Dead Letter Queue (DLQ)."""

    async def post_execute(self, message: TaskiqMessage, result: TaskiqResult) -> None:
        """Called after a task finishes executing. If it fails, send to DLQ."""
        if result.is_err:
            logger.error(
                "Task %s[%s] failed. Pushing to DLQ. Error: %s",
                message.task_name, message.task_id, result.error
            )

            try:
                # We'll use Redis directly to push to a DLQ stream or list
                import redis.asyncio as redis
                r = redis.from_url(settings.redis_url, decode_responses=True)

                dlq_payload = {
                    "task_id": message.task_id,
                    "task_name": message.task_name,
                    "args": str(message.args),
                    "kwargs": str(message.kwargs),
                    "error": str(result.error),
                    "traceback": result.error_traceback or "".join(traceback.format_exception(type(result.error), result.error, result.error.__traceback__)) if hasattr(result.error, '__traceback__') else ""
                }

                await r.xadd("graspmind:dlq", dlq_payload, maxlen=1000) # Keep last 1000 failed tasks
                await r.aclose()
            except Exception as e:
                logger.error("Failed to push task %s to DLQ: %s", message.task_id, e)


# Redis-backed broker for task distribution
broker = ListQueueBroker(
    url=settings.redis_url,
    queue_name="graspmind:tasks",
).with_result_backend(
    RedisAsyncResultBackend(
        redis_url=settings.redis_url,
    )
)

broker.add_middleware(DeadLetterQueueMiddleware())
