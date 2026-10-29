"""S3-compatible object storage (MinIO) for contract files.
Objects are already encrypted by the application; the bucket is private."""

import os
from functools import lru_cache
from urllib.parse import urlparse

from minio import Minio


@lru_cache(maxsize=1)
def client() -> Minio:
    url = urlparse(os.environ["S3_ENDPOINT"])
    return Minio(url.netloc, access_key=os.environ["S3_ACCESS_KEY"], secret_key=os.environ["S3_SECRET_KEY"],
                 secure=url.scheme == "https", region=os.environ.get("S3_REGION") or None)


def bucket() -> str:
    return os.environ.get("S3_BUCKET", "lc-private")


def key_of(storage_path: str) -> str:
    """`storage_path` in app.contracts is "<bucket>/<key>"."""
    b = bucket() + "/"
    return storage_path.removeprefix(b)


def get_bytes(storage_path: str) -> bytes:
    resp = client().get_object(bucket(), key_of(storage_path))
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()


def remove(storage_path: str) -> None:
    client().remove_object(bucket(), key_of(storage_path))  # removing a missing object is not an error in S3
