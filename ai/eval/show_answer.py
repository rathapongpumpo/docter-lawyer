"""Print the full extractive answer for one question: python -m eval.show_answer "คำถาม" """
import asyncio
import json
import sys
from datetime import date

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.answer.extractive import ExtractiveAnswerer
from app.core.config import get_settings
from app.rag.embed import Embedder
from app.rag.retrieve import Retriever
from app.repositories.kb_repo import KbRepository


async def main(q: str, locale: str) -> None:
    s = get_settings()
    pool = AsyncConnectionPool(s.db_conninfo, min_size=1, max_size=2, kwargs={"row_factory": dict_row}, open=False)
    await pool.open()
    a = ExtractiveAnswerer(Retriever(pool, Embedder(s.embed_url, s.embed_dim)), KbRepository(pool), include_drafts=True)
    ans, _ = await a.answer(q, locale=locale, as_of=date.today())
    print(ans.text)
    print("---- citations")
    for c in ans.citations:
        print(json.dumps(c.sse(), ensure_ascii=False)[:220])
    print("---- suggestions", json.dumps(ans.suggestions(), ensure_ascii=False))
    await pool.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "th"))
