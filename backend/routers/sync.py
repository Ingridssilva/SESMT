"""routes/sync.py — Sync em lote para uso offline.

Endpoints:
    POST /api/sync/inspecoes   — recebe lista de inspeções de campo pendentes
    POST /api/sync/lideranca   — recebe lista de inspeções de liderança pendentes

Cada item deve conter local_id para deduplicação.
Retorna { inseridos, ignorados, erros, mapa } onde mapa é { local_id: server_id }.
"""

from datetime import date
from flask import Blueprint, request
from database import db_returning, db_fetchone, get_conn, next_seq
from helpers import ok, err
from auth import requer_auth

bp = Blueprint("sync", __name__)


# ─── helpers ────────────────────────────────────────────────────────────────

def _ano_de(data_str: str) -> int:
    try:
        return int(str(data_str)[:4])
    except Exception:
        return date.today().year


# ─── Inspeções de campo em lote ─────────────────────────────────────────────

@bp.post("/api/sync/inspecoes")
@requer_auth
def sync_inspecoes():
    """
    Recebe lista de inspeções de campo geradas offline e insere no banco.

    Payload esperado (array JSON):
    [
      {
        "local_id": "local_1717000000_abc123",
        "data_inspecao": "2026-06-10",
        "tipo_inspecao": "Campo Elétrico",
        "municipio_id": 3,
        "contrato_id": 1,
        "usuario_id": 5,
        "local_descricao": "Frente Norte — Km 42",
        "equipe": "Equipe Alpha",
        "observacoes": "",
        "pontos_positivos": ""
      },
      ...
    ]

    Retorna:
    {
      "inseridos": 2,
      "ignorados": 1,   ← local_id já existia
      "erros": 0,
      "mapa": { "local_1717000000_abc123": 42, ... }
    }
    """
    lista = request.json
    if not isinstance(lista, list):
        return err("Esperado array JSON")

    inseridos = 0
    ignorados = 0
    erros     = []
    mapa      = {}   # local_id → server_id

    for item in lista:
        local_id = item.get("local_id")
        if not local_id:
            erros.append({"erro": "local_id ausente", "item": item})
            continue

        try:
            # Verificar duplicata pela local_id na tabela (coluna adicionada via migration)
            existente = db_fetchone(
                "SELECT id FROM inspecoes WHERE local_id = %s", (local_id,)
            )
            if existente:
                mapa[local_id] = existente["id"]
                ignorados += 1
                continue

            ano    = _ano_de(item.get("data_inspecao", ""))
            codigo = next_seq("inspecoes", "INSP", ano)

            row = db_returning("""
                INSERT INTO inspecoes
                    (codigo, data_inspecao, tipo_inspecao, municipio_id, contrato_id,
                     usuario_id, local_descricao, equipe, observacoes, pontos_positivos,
                     conformidades_verificadas, conformidades_ok, local_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (local_id) DO NOTHING
                RETURNING id
            """, (
                codigo,
                item.get("data_inspecao"),
                item.get("tipo_inspecao"),
                item.get("municipio_id"),
                item.get("contrato_id"),
                item.get("usuario_id"),
                item.get("local_descricao"),
                item.get("equipe"),
                item.get("observacoes"),
                item.get("pontos_positivos"),
                item.get("conformidades_verificadas"),
                item.get("conformidades_ok"),
                local_id,
            ))

            if row:
                mapa[local_id] = row["id"]
                inseridos += 1
            else:
                # ON CONFLICT DO NOTHING disparou — registrar no mapa mesmo assim
                existente2 = db_fetchone(
                    "SELECT id FROM inspecoes WHERE local_id = %s", (local_id,)
                )
                if existente2:
                    mapa[local_id] = existente2["id"]
                ignorados += 1

        except Exception as e:
            erros.append({"local_id": local_id, "erro": str(e)})

    return ok({
        "inseridos": inseridos,
        "ignorados": ignorados,
        "erros":     len(erros),
        "detalhes":  erros,
        "mapa":      mapa,
    }, 207 if erros else 200)


# ─── Inspeções de liderança em lote ─────────────────────────────────────────

@bp.post("/api/sync/lideranca")
@requer_auth
def sync_lideranca():
    """
    Recebe lista de inspeções de liderança geradas offline e insere no banco.

    Payload esperado (array JSON):
    [
      {
        "local_id": "local_1717000001_xyz789",
        "data_inspecao": "2026-06-11",
        "lider_id": 7,
        "inspetor_id": 5,
        "contrato_id": 1,
        "local_descricao": "Subestação B",
        "equipe_inspecionada": "Equipe Beta",
        "total_itens": 20,
        "itens_conformes": 18,
        "observacoes": "",
        "acoes_imediatas": ""
      },
      ...
    ]
    """
    lista = request.json
    if not isinstance(lista, list):
        return err("Esperado array JSON")

    inseridos = 0
    ignorados = 0
    erros     = []
    mapa      = {}

    for item in lista:
        local_id = item.get("local_id")
        if not local_id:
            erros.append({"erro": "local_id ausente", "item": item})
            continue

        try:
            existente = db_fetchone(
                "SELECT id FROM inspecoes_lideranca WHERE local_id = %s", (local_id,)
            )
            if existente:
                mapa[local_id] = existente["id"]
                ignorados += 1
                continue

            ano    = _ano_de(item.get("data_inspecao", ""))
            codigo = next_seq("inspecoes_lideranca", "IL", ano)

            row = db_returning("""
                INSERT INTO inspecoes_lideranca
                    (codigo, data_inspecao, lider_id, inspetor_id, contrato_id,
                     local_descricao, equipe_inspecionada, total_itens, itens_conformes,
                     observacoes, acoes_imediatas, local_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (local_id) DO NOTHING
                RETURNING id
            """, (
                codigo,
                item.get("data_inspecao"),
                item.get("lider_id"),
                item.get("inspetor_id"),
                item.get("contrato_id"),
                item.get("local_descricao"),
                item.get("equipe_inspecionada"),
                item.get("total_itens"),
                item.get("itens_conformes"),
                item.get("observacoes"),
                item.get("acoes_imediatas"),
                local_id,
            ))

            if row:
                mapa[local_id] = row["id"]
                inseridos += 1
            else:
                existente2 = db_fetchone(
                    "SELECT id FROM inspecoes_lideranca WHERE local_id = %s", (local_id,)
                )
                if existente2:
                    mapa[local_id] = existente2["id"]
                ignorados += 1

        except Exception as e:
            erros.append({"local_id": local_id, "erro": str(e)})

    return ok({
        "inseridos": inseridos,
        "ignorados": ignorados,
        "erros":     len(erros),
        "detalhes":  erros,
        "mapa":      mapa,
    }, 207 if erros else 200)
