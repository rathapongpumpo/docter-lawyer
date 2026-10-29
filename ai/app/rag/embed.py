"""Client for the embed-m3 container (HuggingFace TEI serving BAAI/bge-m3, 1024-d, normalized)."""

import httpx

BATCH = 32


def to_pgvector(vec: list[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in vec) + "]"


class Embedder:
    def __init__(self, base_url: str, dim: int = 1024, timeout: float = 30.0) -> None:
        self.url = base_url.rstrip("/") + "/embed"
        self.dim = dim
        self.timeout = timeout

    def _check(self, vectors: list[list[float]], expected: int) -> list[list[float]]:
        if len(vectors) != expected or any(len(v) != self.dim for v in vectors):
            raise RuntimeError("embedding service returned an unexpected shape")
        return vectors

    def embed_sync(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        with httpx.Client(timeout=self.timeout) as client:
            for i in range(0, len(texts), BATCH):
                batch = texts[i : i + BATCH]
                r = client.post(self.url, json={"inputs": batch, "normalize": True, "truncate": True})
                r.raise_for_status()
                out.extend(self._check(r.json(), len(batch)))
        return out

    async def embed(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(self.url, json={"inputs": texts, "normalize": True, "truncate": True})
            r.raise_for_status()
            return self._check(r.json(), len(texts))
