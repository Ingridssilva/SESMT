"""
database.py — Pool de conexões e helpers de banco
SESMT Empresa Exemplo
"""

import os
import json
import logging
from contextlib import contextmanager
from datetime import date, datetime

import psycopg2
import psycopg2.pool
import psycopg2.extras

log = logging.getLogger(__name__)

_pool: psycopg2.pool.ThreadedConnectionPool | None = None

# Timeout máximo (segundos) aguardando conexão disponível no pool.
# Se excedido, retorna 503 ao cliente em vez de travar indefinidamente.
_POOL_TIMEOUT = 10


def _build_dsn() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if url:
        return url.replace("postgres://", "postgresql://", 1)
    return (
        f"host={os.environ.get('DB_HOST','localhost')} "
        f"port={os.environ.get('DB_PORT','5432')} "
        f"dbname={os.environ.get('DB_NAME','sesmt')} "
        f"user={os.environ.get('DB_USER','postgres')} "
        f"password={os.environ.get('DB_PASSWORD','')}"
    )


def init_pool(minconn: int = 2, maxconn: int = 10) -> None:
    """
    Inicializa o pool. Deve ser chamado dentro do hook post_fork do Gunicorn
    (gunicorn.conf.py) e não no módulo principal, para evitar que conexões
    sejam compartilhadas entre processos forked (comportamento indefinido
    no psycopg2).
    """
    global _pool
    dsn = _build_dsn()
    _pool = psycopg2.pool.ThreadedConnectionPool(
        minconn, maxconn, dsn,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    log.info("Pool de conexões inicializado (min=%d max=%d)", minconn, maxconn)
    _ensure_sequences()


def _ensure_sequences() -> None:
    """Cria sequences de código no boot — evita CREATE em runtime e double-commit."""
    import datetime as _dt
    ano = _dt.date.today().year
    tabelas = [
        ("inspecoes", ano), ("inspecoes", ano + 1),
        ("inspecoes_lideranca", ano), ("inspecoes_lideranca", ano + 1),
        ("nao_conformidades", ano), ("nao_conformidades", ano + 1),
    ]
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                for tabela, y in tabelas:
                    cur.execute(f"CREATE SEQUENCE IF NOT EXISTS seq_{tabela}_{y} START 1")
        log.info("Sequences verificadas/criadas")
    except Exception as e:
        log.warning("Não foi possível pré-criar sequences: %s", e)


@contextmanager
def get_conn():
    """
    Context manager que pega conexão do pool com timeout.
    Lança RuntimeError (→ 503) se o pool estiver esgotado após _POOL_TIMEOUT segundos.
    """
    if _pool is None:
        raise RuntimeError("Pool não inicializado")

    import time
    deadline = time.monotonic() + _POOL_TIMEOUT
    conn = None
    while conn is None:
        try:
            conn = _pool.getconn()
        except psycopg2.pool.PoolError:
            if time.monotonic() > deadline:
                raise RuntimeError(
                    "Pool de conexões esgotado — todas as conexões estão em uso. "
                    "Tente novamente em instantes."
                )
            time.sleep(0.05)

    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


def db_fetch(sql: str, params=None) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return [dict(r) for r in cur.fetchall()]


def db_fetchone(sql: str, params=None) -> dict | None:
    rows = db_fetch(sql, params)
    return rows[0] if rows else None


def db_exec(sql: str, params=None) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())


def db_returning(sql: str, params=None) -> dict | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            row = cur.fetchone()
            return dict(row) if row else None


def db_fetch_cursor(sql: str, params=None, batch: int = 500):
    """Gerador que busca linhas em lotes — para exports grandes sem estourar RAM."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            while True:
                rows = cur.fetchmany(batch)
                if not rows:
                    break
                yield from (dict(r) for r in rows)


def next_seq(table: str, prefix: str, year: int) -> str:
    """Gera próximo código sequencial via SEQUENCE do PostgreSQL."""
    seq_name = f"seq_{table}_{year}"
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"CREATE SEQUENCE IF NOT EXISTS {seq_name} START 1")
            cur.execute(f"SELECT nextval('{seq_name}') AS n")
            row = cur.fetchone()
            n = row['n'] if isinstance(row, dict) else row[0]
    return f"{prefix}-{year}-{n:04d}"


class DateEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (date, datetime)):
            return obj.isoformat()
        return super().default(obj)
