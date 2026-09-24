"""routes/indicadores.py — Indicadores mensais NDGS.

Colunas reais da tabela indicadores_mensais:
  id, ano, mes, ndgs_geral, inspecoes_realizadas, ncs_abertas,
  ncs_encerradas, treinamentos, pessoas_treinadas, observacoes,
  created_at, updated_at
"""

from datetime import date
from flask import Blueprint, request
from database import db_fetch, db_fetchone, db_exec, db_returning
from helpers import ok, err, calc_ndgs, fmt_mes_ano
from auth import requer_auth

bp = Blueprint("indicadores", __name__)


@bp.get("/api/indicadores/")
@requer_auth
def listar_indicadores():
    rows = db_fetch("""
        SELECT * FROM indicadores_mensais
        ORDER BY ano DESC, mes DESC
    """)
    result = []
    for r in rows:
        r.update(calc_ndgs(r))
        r["competencia_fmt"] = fmt_mes_ano(r.get("ano"), r.get("mes"))
        result.append(r)
    return ok(result)


@bp.get("/api/indicadores/<int:id>")
@requer_auth
def obter_indicador(id):
    row = db_fetchone("SELECT * FROM indicadores_mensais WHERE id = %s", (id,))
    if not row:
        return err("Não encontrado", 404)
    row.update(calc_ndgs(row))
    row["competencia_fmt"] = fmt_mes_ano(row.get("ano"), row.get("mes"))
    return ok(row)


@bp.post("/api/indicadores/")
@requer_auth
def criar_indicador():
    d = request.json or {}
    mes = int(d.get("mes", 0))
    ano = int(d.get("ano", 0))
    if not mes or not ano:
        return err("mes e ano obrigatórios")

    # Verificar se já existe registro para esse mês/ano
    existente = db_fetchone(
        "SELECT id FROM indicadores_mensais WHERE ano = %s AND mes = %s", (ano, mes)
    )
    if existente:
        return err(f"Já existe um registro para {mes:02d}/{ano}. Use PUT para atualizar.", 409)

    row = db_returning("""
        INSERT INTO indicadores_mensais
            (ano, mes, ndgs_geral, inspecoes_realizadas, ncs_abertas,
             ncs_encerradas, treinamentos, pessoas_treinadas, observacoes)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (
        ano, mes,
        d.get("ndgs_geral"),
        d.get("inspecoes_realizadas", 0),
        d.get("ncs_abertas", 0),
        d.get("ncs_encerradas", 0),
        d.get("treinamentos", 0),
        d.get("pessoas_treinadas", 0),
        d.get("observacoes"),
    ))
    return ok({"id": row["id"]}, 201)


@bp.put("/api/indicadores/<int:id>")
@requer_auth
def atualizar_indicador(id):
    d = request.json or {}
    db_exec("""
        UPDATE indicadores_mensais SET
            ndgs_geral=%s,
            inspecoes_realizadas=%s,
            ncs_abertas=%s,
            ncs_encerradas=%s,
            treinamentos=%s,
            pessoas_treinadas=%s,
            observacoes=%s,
            updated_at=NOW()
        WHERE id=%s
    """, (
        d.get("ndgs_geral"),
        d.get("inspecoes_realizadas", 0),
        d.get("ncs_abertas", 0),
        d.get("ncs_encerradas", 0),
        d.get("treinamentos", 0),
        d.get("pessoas_treinadas", 0),
        d.get("observacoes"),
        id,
    ))
    return ok({"ok": True})


@bp.delete("/api/indicadores/<int:id>")
@requer_auth
def deletar_indicador(id):
    db_exec("DELETE FROM indicadores_mensais WHERE id = %s", (id,))
    return ok({"ok": True})


@bp.get("/api/indicadores/auto")
@requer_auth
def indicadores_auto():
    """Retorna o indicador do mês atual (ou do mês/ano informado)."""
    ano = int(request.args.get("ano", date.today().year))
    mes = int(request.args.get("mes", date.today().month))

    row = db_fetchone("""
        SELECT * FROM indicadores_mensais
        WHERE ano = %s AND mes = %s
        LIMIT 1
    """, (ano, mes))

    if not row:
        return ok({"ano": ano, "mes": mes, "ndgs": None,
                   "msg": "Sem dados para este período"})

    row.update(calc_ndgs(row))
    row["competencia_fmt"] = fmt_mes_ano(ano, mes)
    return ok(row)
