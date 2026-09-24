"""routes/ncs.py — Não Conformidades com histórico de auditoria."""

import os
import io
import csv
from datetime import date, datetime
from flask import Blueprint, request, Response, g
from database import db_fetch, db_fetchone, db_exec, db_returning, next_seq, get_conn, db_fetch_cursor
from helpers import ok, err
from auth import requer_auth, usuario_atual

bp = Blueprint("ncs", __name__)


@bp.get("/api/ncs/")
@requer_auth
def listar_ncs():
    filtros = request.args
    where, params = ["1=1"], []

    if filtros.get("status"):
        where.append("n.status = %s");      params.append(filtros["status"])
    if filtros.get("gravidade"):
        where.append("n.gravidade = %s");   params.append(filtros["gravidade"])
    if filtros.get("contrato_id"):
        where.append("n.contrato_id = %s"); params.append(int(filtros["contrato_id"]))
    if filtros.get("vencidas") == "1":
        where.append("n.prazo < CURRENT_DATE AND n.status != 'ENCERRADA'")

    limit  = min(int(filtros.get("limit",  "300")), 1000)
    offset = int(filtros.get("offset", "0"))

    sql = f"""
        SELECT n.*, c.codigo AS contrato_cod,
               u.nome AS responsavel_nome,
               i.codigo AS inspecao_cod
        FROM nao_conformidades n
        LEFT JOIN contratos c  ON c.id = n.contrato_id
        LEFT JOIN usuarios u   ON u.id = n.responsavel_id
        LEFT JOIN inspecoes i  ON i.id = n.inspecao_id
        WHERE {' AND '.join(where)}
        ORDER BY
            CASE n.gravidade
                WHEN 'CRÍTICA' THEN 1 WHEN 'ALTA' THEN 2
                WHEN 'MÉDIA'   THEN 3 ELSE 4
            END,
            n.created_at DESC
        LIMIT %s OFFSET %s
    """
    params += [limit, offset]
    rows = db_fetch(sql, params)

    today = date.today()
    for r in rows:
        prazo = r.get("prazo")
        if prazo and r.get("status") != "ENCERRADA":
            if isinstance(prazo, str):
                prazo = date.fromisoformat(prazo)
            r["dias_prazo"] = (prazo - today).days
        else:
            r["dias_prazo"] = None
    return ok(rows)


@bp.get("/api/ncs/<int:id>")
@requer_auth
def obter_nc(id):
    row = db_fetchone("""
        SELECT n.*, c.codigo AS contrato_cod, u.nome AS responsavel_nome
        FROM nao_conformidades n
        LEFT JOIN contratos c ON c.id = n.contrato_id
        LEFT JOIN usuarios u  ON u.id = n.responsavel_id
        WHERE n.id = %s
    """, (id,))
    if not row:
        return err("NC não encontrada", 404)
    row["historico"] = db_fetch("""
        SELECT h.*, u.nome AS usuario_nome
        FROM nc_historico h
        LEFT JOIN usuarios u ON u.id = h.usuario_id
        WHERE h.nc_id = %s ORDER BY h.created_at
    """, (id,))
    return ok(row)


@bp.post("/api/ncs/")
@requer_auth
def criar_nc():
    d = request.json or {}
    for f in ["descricao", "gravidade"]:
        if not d.get(f):
            return err(f"Campo obrigatório: {f}")

    codigo = next_seq("nao_conformidades", "NC", date.today().year)

    # responsavel_id vem do body (pode ser outro usuário atribuído),
    # mas registramos também quem criou (usuario_atual da sessão).
    usuario = usuario_atual()
    criado_por_id = _resolver_usuario_id(usuario["email"])

    row = db_returning("""
        INSERT INTO nao_conformidades
            (codigo, descricao, gravidade, status, prazo, responsavel_id,
             contrato_id, inspecao_id, causa_raiz, acao_corretiva, evidencia_url,
             criado_por_id)
        VALUES (%s,%s,%s,'ABERTA',%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (
        codigo, d["descricao"], d["gravidade"],
        d.get("prazo"), d.get("responsavel_id"),
        d.get("contrato_id"), d.get("inspecao_id"),
        d.get("causa_raiz"), d.get("acao_corretiva"), d.get("evidencia_url"),
        criado_por_id,
    ))
    return ok({"id": row["id"], "codigo": codigo}, 201)


@bp.post("/api/ncs/<int:id>/status")
@requer_auth
def mudar_status_nc(id):
    d = request.json or {}
    novo_status = d.get("status")
    if not novo_status:
        return err("status obrigatório")

    # Usar ID do usuário da sessão — não confiar no body
    usuario = usuario_atual()
    usuario_id = _resolver_usuario_id(usuario["email"])

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status FROM nao_conformidades WHERE id = %s FOR UPDATE", (id,)
            )
            row = cur.fetchone()
            if not row:
                return err("NC não encontrada", 404)
            status_anterior = row["status"]

            cur.execute(
                "UPDATE nao_conformidades SET status = %s, updated_at = NOW() WHERE id = %s",
                (novo_status, id),
            )
            cur.execute("""
                INSERT INTO nc_historico
                    (nc_id, status_anterior, status_novo, observacao, usuario_id)
                VALUES (%s, %s, %s, %s, %s)
            """, (id, status_anterior, novo_status, d.get("observacao"), usuario_id))

    return ok({"ok": True, "de": status_anterior, "para": novo_status})


@bp.delete("/api/ncs/<int:id>")
@requer_auth
def deletar_nc(id):
    nc = db_fetchone("SELECT id, status FROM nao_conformidades WHERE id = %s", (id,))
    if not nc:
        return err("NC não encontrada", 404)

    usuario = usuario_atual()
    usuario_id = _resolver_usuario_id(usuario["email"])

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE nao_conformidades SET status = 'CANCELADA', updated_at = NOW() WHERE id = %s",
                (id,),
            )
            cur.execute(
                """INSERT INTO nc_historico (nc_id, status_anterior, status_novo, observacao, usuario_id)
                   VALUES (%s, %s, 'CANCELADA', 'Registro excluído via sistema', %s)""",
                (id, nc["status"], usuario_id),
            )
    return ok({"ok": True})


@bp.get("/api/ncs/verificar-vencidas")
def verificar_ncs_vencidas():
    """Endpoint para Render Cron Job — protegido por X-Cron-Secret."""
    cron_secret = os.environ.get("CRON_SECRET", "")
    if not cron_secret or request.headers.get("X-Cron-Secret") != cron_secret:
        return err("Não autorizado", 401)

    vencidas = db_fetch("""
        SELECT n.codigo, n.descricao, n.gravidade,
               n.prazo, u.nome AS responsavel, u.email
        FROM nao_conformidades n
        LEFT JOIN usuarios u ON u.id = n.responsavel_id
        WHERE n.status != 'ENCERRADA'
          AND n.prazo IS NOT NULL
          AND n.prazo < NOW()
          AND (n.ultima_notificacao IS NULL
               OR n.ultima_notificacao < NOW() - INTERVAL '24 hours')
        ORDER BY n.prazo ASC LIMIT 50
    """)

    if vencidas:
        codigos = [v["codigo"] for v in vencidas]
        db_exec("""
            UPDATE nao_conformidades
            SET ultima_notificacao = NOW()
            WHERE codigo = ANY(%s)
        """, (codigos,))

    return ok({
        "total_vencidas": len(vencidas),
        "ncs": vencidas,
        "msg": f"{len(vencidas)} NC(s) vencida(s) identificada(s)",
    })


@bp.get("/api/exportar/ncs")
@requer_auth
def exportar_ncs():
    sql = """
        SELECT n.codigo, n.gravidade, n.status, n.descricao,
               n.causa_raiz, n.acao_corretiva, n.prazo,
               u.nome AS responsavel, n.created_at
        FROM nao_conformidades n
        LEFT JOIN usuarios u ON u.id = n.responsavel_id
        ORDER BY n.created_at DESC
    """
    fieldnames = [
        "codigo","gravidade","status","descricao","causa_raiz",
        "acao_corretiva","prazo","responsavel","created_at",
    ]

    def _gerar():
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        yield output.getvalue()
        output.truncate(0); output.seek(0)
        for r in db_fetch_cursor(sql):
            for k, v in r.items():
                if isinstance(v, (date, datetime)):
                    r[k] = v.strftime("%d/%m/%Y")
                elif v is None:
                    r[k] = ""
            writer.writerow(r)
            yield output.getvalue()
            output.truncate(0); output.seek(0)

    return Response(
        _gerar(), mimetype="text/csv",
        headers={"Content-Disposition": 'attachment; filename="nao_conformidades.csv"'},
    )


# ── Helper interno ────────────────────────────────────────────────────────────

def _resolver_usuario_id(email: str) -> int | None:
    """Retorna o ID do usuário na tabela usuarios pelo email, ou None."""
    row = db_fetchone("SELECT id FROM usuarios WHERE email = %s LIMIT 1", (email,))
    return row["id"] if row else None
