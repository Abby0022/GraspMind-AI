"""Memory module — 3-tier student memory architecture.

Layers:
1. Working Memory (working.py) — Redis, recent chat context
2. Episodic Memory (episodic.py) — Postgres, session summaries
3. Semantic Memory (semantic.py) — Qdrant, student knowledge model
"""
