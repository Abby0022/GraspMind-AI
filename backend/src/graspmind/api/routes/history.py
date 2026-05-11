"""Study history routes — view episodic memory timeline.

Provides endpoints for the study history page, showing
past session summaries, topics, and progress over time.
"""

from datetime import UTC

from fastapi import APIRouter, Depends

from graspmind.api.deps import AuthUser, get_user_supabase

router = APIRouter(prefix="/history", tags=["Study History"])


@router.get("/")
async def get_study_history(
    user: AuthUser,
    notebook_id: str | None = None,
    limit: int = 20,
    supabase=Depends(get_user_supabase),
):
    """Get the student's study history across all notebooks.

    Optionally filter by notebook_id. Returns episodes sorted
    by most recent first.
    """
    query = supabase.table("episodes").select(
        "id, session_id, notebook_id, summary, topics, message_count, created_at, "
        "notebooks(title, subject, color)"
    ).eq("user_id", user.id).order("created_at", desc=True).limit(limit)

    if notebook_id:
        query = query.eq("notebook_id", notebook_id)

    result = await query.execute()

    return {
        "episodes": result.data or [],
        "total": len(result.data or []),
    }


@router.get("/stats")
async def get_study_stats(
    user: AuthUser,
    supabase=Depends(get_user_supabase),
):
    """Get aggregated study statistics for the user.

    Returns:
    - Total sessions
    - Total messages
    - Most studied topics
    - Study streak
    - Sessions per notebook
    """
    # Fetch all episodes
    result = await supabase.table("episodes").select(
        "notebook_id, topics, message_count, created_at"
    ).eq("user_id", user.id).order("created_at", desc=True).execute()

    episodes = result.data or []

    if not episodes:
        return {
            "total_sessions": 0,
            "total_messages": 0,
            "top_topics": [],
            "study_streak": 0,
            "recent_activity": [],
        }

    # Aggregate stats
    total_messages = sum(ep.get("message_count", 0) for ep in episodes)

    # Topic frequency
    topic_counts: dict[str, int] = {}
    for ep in episodes:
        for topic in (ep.get("topics") or []):
            topic_counts[topic] = topic_counts.get(topic, 0) + 1

    top_topics = sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:15]

    # Study streak (consecutive days)
    from datetime import datetime, timedelta
    study_dates = set()
    for ep in episodes:
        created = ep.get("created_at", "")
        if created:
            try:
                dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                study_dates.add(dt.date())
            except ValueError:
                pass

    streak = 0
    today = datetime.now(UTC).date()
    check_date = today
    while check_date in study_dates:
        streak += 1
        check_date -= timedelta(days=1)

    # Recent activity (last 7 days)
    week_ago = datetime.now(UTC) - timedelta(days=7)
    recent = [
        ep for ep in episodes
        if ep.get("created_at", "") and
        datetime.fromisoformat(ep["created_at"].replace("Z", "+00:00")) > week_ago
    ]

    return {
        "total_sessions": len(episodes),
        "total_messages": total_messages,
        "top_topics": [{"topic": t, "count": c} for t, c in top_topics],
        "study_streak": streak,
        "recent_activity": len(recent),
    }


@router.get("/topics")
async def get_topic_timeline(
    user: AuthUser,
    notebook_id: str | None = None,
    supabase=Depends(get_user_supabase),
):
    """Get a timeline of topics studied, grouped by date.

    Used to render the study timeline visualization.
    """
    query = supabase.table("episodes").select(
        "topics, created_at, notebook_id, notebooks(title, color)"
    ).eq("user_id", user.id).order("created_at", desc=True).limit(50)

    if notebook_id:
        query = query.eq("notebook_id", notebook_id)

    result = await query.execute()
    episodes = result.data or []

    # Group by date
    from collections import defaultdict
    from datetime import datetime

    by_date: dict[str, list] = defaultdict(list)
    for ep in episodes:
        created = ep.get("created_at", "")
        if created:
            try:
                dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                date_key = dt.strftime("%Y-%m-%d")
                by_date[date_key].append({
                    "topics": ep.get("topics") or [],
                    "notebook": ep.get("notebooks", {}),
                    "time": dt.strftime("%H:%M"),
                })
            except ValueError:
                pass

    return {
        "timeline": [
            {"date": date, "sessions": sessions}
            for date, sessions in sorted(by_date.items(), reverse=True)
        ],
    }
