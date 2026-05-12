"""Prompt builder — constructs LLM prompts with system instructions,
retrieved context, and conversation history.

Follows the RAG prompt pattern:
1. System prompt (role, rules, citation format)
2. Retrieved context blocks with source attribution
3. Conversation history (last N messages)
4. Current user query
"""

from graspmind.rag.retriever import RetrievedContext

SYSTEM_PROMPT = """You are GraspMindAI, an expert AI study tutor. Your role is to help students understand their course materials deeply by providing comprehensive, structured, and highly accurate explanations.

## Rules
1. **ONLY** answer based on the provided context from the student's uploaded materials.
2. If the context doesn't contain enough information, say so honestly — never fabricate answers.
3. **Always cite your sources** using the format [Source: "title", Page N] after each claim or paragraph.
4. **Detail & Depth**: Provide exhaustive, in-depth explanations. Don't just summarize; explain the "why" and "how".
5. **Structured Formatting**: Use advanced Markdown: tables for comparisons, nested lists for hierarchies, and clear headings.
6. Use examples, analogies, and comparisons from the text to bridge knowledge gaps.
7. **Accuracy First**: Cross-reference every claim against multiple context blocks before responding.
8. Be encouraging but professional, maintaining the high standards of an elite personal tutor.

## Citation Format
After each key fact or claim, add a citation like:
[Source: "Biology Chapter 3", Page 12]

If multiple sources support a point, cite all of them. Use multiple citations if different parts of a paragraph come from different sources."""

FEYNMAN_SYSTEM_PROMPT = """You are GraspMindAI, an expert AI study tutor. The student is currently in "Feynman Technique Mode".
Your goal is NOT to explain things to the student, but rather to have the STUDENT explain things to you.

## Rules
1. Roleplay as a confused beginner who wants to learn.
2. Ask the student to explain the core concept they are studying in simple terms.
3. If their explanation is confusing or missing key parts, ask probing questions (e.g., "Wait, I don't understand how X connects to Y. Can you clarify?").
4. If their explanation is good, validate it and ask them to explain the next logical step or a real-world example.
5. NEVER just give them the answer. Guide them to discover gaps in their own logic.
6. Still base your evaluation on the provided context from their materials.
7. Keep your responses short and conversational (1-3 sentences max)."""


def build_prompt(
    query: str,
    contexts: list[RetrievedContext],
    history: list[dict] | None = None,
    max_history: int = 10,
    episodic_context: str = "",
    knowledge_context: str = "",
    chat_mode: str = "standard",
) -> list[dict]:
    """Build a complete message array for the LLM.

    Args:
        query: The user's current question.
        contexts: Retrieved context blocks from Qdrant.
        history: Previous conversation messages [{"role": "...", "content": "..."}].
        max_history: Max number of history messages to include.
        episodic_context: Summaries of previous study sessions.
        knowledge_context: Student's mastery profile (strengths/weaknesses).
        chat_mode: "standard" or "feynman".

    Returns:
        List of message dicts compatible with OpenAI/Groq format.
    """
    messages: list[dict] = []

    # 1. System prompt
    system_prompt = FEYNMAN_SYSTEM_PROMPT if chat_mode == "feynman" else SYSTEM_PROMPT
    messages.append({"role": "system", "content": system_prompt})

    # 2. Context injection
    if contexts:
        context_text = _format_contexts(contexts)
        messages.append({
            "role": "system",
            "content": f"## Retrieved Context from Student's Materials\n\n{context_text}",
        })
    else:
        messages.append({
            "role": "system",
            "content": (
                "## No relevant context found\n"
                "The student's uploaded materials don't seem to contain "
                "information about this topic. Let them know and suggest "
                "they upload relevant materials."
            ),
        })

    # 2.5. Episodic memory (previous session summaries)
    if episodic_context:
        messages.append({
            "role": "system",
            "content": episodic_context,
        })

    # 2.6. Semantic memory (student knowledge profile)
    if knowledge_context:
        messages.append({
            "role": "system",
            "content": knowledge_context,
        })

    # 3. Conversation history (trimmed to max_history)
    if history:
        trimmed = history[-max_history:]
        for msg in trimmed:
            if msg["role"] in ("user", "assistant"):
                messages.append(msg)

    # 4. Current query
    messages.append({"role": "user", "content": query})

    return messages


def _format_contexts(contexts: list[RetrievedContext]) -> str:
    """Format retrieved contexts into a readable block for the LLM."""
    blocks: list[str] = []

    for i, ctx in enumerate(contexts, 1):
        heading = ""
        if ctx.headings:
            heading = f" — {ctx.headings[0]}"

        page_info = f", Page {ctx.page_num}" if ctx.page_num else ""

        # Use parent content (fuller context) for the LLM
        content = ctx.parent_content or ctx.content

        block = (
            f"### Context {i} [Source: \"{ctx.source_title}\"{page_info}{heading}]\n"
            f"{content}\n"
        )
        blocks.append(block)

    return "\n".join(blocks)


def extract_citations(response_text: str) -> list[dict]:
    """Extract citations from the LLM response.

    Looks for patterns like [Source: "title", Page N].

    Returns:
        List of citation dicts with source_title and page_num.
    """
    import re

    citation_pattern = r'\[Source:\s*"([^"]+)"(?:,\s*Page\s*(\d+))?\]'
    matches = re.findall(citation_pattern, response_text)

    citations = []
    seen = set()
    for title, page in matches:
        key = f"{title}:{page}"
        if key not in seen:
            seen.add(key)
            citations.append({
                "source_title": title,
                "page_num": int(page) if page else None,
            })

    return citations
