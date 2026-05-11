"""Query rewriting — HyDE and keyword expansion.

HyDE (Hypothetical Document Embeddings) rewrites a user's query
into a hypothetical answer paragraph, which often retrieves better
results than the original short question.

Keyword expansion adds synonyms and related terms to improve
BM25 recall for technical vocabulary.
"""

import logging
import re

from graspmind.rag.llm_client import complete_chat

logger = logging.getLogger(__name__)

HYDE_PROMPT = """You are a helpful study assistant. Given the student's question below, write a short, factual paragraph (3-5 sentences) that would answer their question if it appeared in a textbook or lecture notes. Do NOT say "based on my knowledge" or use hedging language. Write as if you are the textbook author.

Student's question: {query}

Hypothetical answer paragraph:"""

KEYWORD_PROMPT = """Given the following student question, extract and list the key technical terms, concepts, and synonyms that would help find relevant passages in study materials. Include:
- The main concepts being asked about
- Related technical terms and synonyms
- Any acronyms (both expanded and abbreviated forms)

Output ONLY a comma-separated list of terms, nothing else.

Question: {query}

Key terms:"""


async def hyde_rewrite(query: str, user_id: str = "") -> str:
    """Rewrite a query using HyDE (Hypothetical Document Embeddings).

    Generates a hypothetical answer that is then used as the
    search query instead of the original question. This bridges
    the query-document vocabulary gap.

    Args:
        query: The original user question.

    Returns:
        A hypothetical answer paragraph to use as the search query.
    """
    try:
        messages = [
            {"role": "system", "content": "You are a concise academic writer."},
            {"role": "user", "content": HYDE_PROMPT.format(query=query)},
        ]

        hyde_doc = await complete_chat(messages, user_id=user_id)

        if hyde_doc and len(hyde_doc.strip()) > 20:
            logger.info("HyDE rewrite: '%s' → %d chars", query[:50], len(hyde_doc))
            return hyde_doc.strip()

    except Exception as exc:
        logger.warning("HyDE rewrite failed, using original query: %s", exc)

    return query


async def expand_keywords(query: str, user_id: str = "") -> list[str]:
    """Extract and expand keywords from a query for BM25 search.

    Uses an LLM to identify key technical terms, synonyms, and
    related concepts that should be included in the keyword search.

    Args:
        query: The original user question.

    Returns:
        List of expanded keyword terms.
    """
    try:
        messages = [
            {"role": "system", "content": "You extract key terms. Output only a comma-separated list."},
            {"role": "user", "content": KEYWORD_PROMPT.format(query=query)},
        ]

        result = await complete_chat(messages, user_id=user_id)

        if result:
            # Parse comma-separated terms
            terms = [t.strip().lower() for t in result.split(",")]
            terms = [t for t in terms if t and len(t) > 1]

            # Add original query words
            original_words = re.findall(r"[a-z0-9]+", query.lower())
            terms.extend(w for w in original_words if len(w) > 2)

            # Deduplicate while preserving order
            seen = set()
            unique_terms = []
            for term in terms:
                if term not in seen:
                    seen.add(term)
                    unique_terms.append(term)

            logger.info("Keyword expansion: '%s' → %d terms", query[:50], len(unique_terms))
            return unique_terms

    except Exception as exc:
        logger.warning("Keyword expansion failed: %s", exc)

    # Fallback: just return original query words
    return [w.lower() for w in re.findall(r"[a-z0-9]+", query.lower()) if len(w) > 2]
