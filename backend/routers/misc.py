"""routes/misc.py — Liderança, Ações SESMT, Colaboradores, Busca global."""

import io
import csv
from datetime import date, datetime
from flask import Blueprint, request, Response
from database import db_fetch, db_fetchone, db_exec, db_returning, next_seq, get_conn
from helpers import ok, err
from auth import requer_auth, usuario_atual

bp = Blueprint("misc", __name__)


# ── Helper: resolve ID do usuário da sessão ───────────────────────────────────

def _usuario_id_sessao() -> int | None:
    usuario = usuario_atual()
    row = db_fetchone("SELECT id FROM usuarios WHERE email = %s LIMIT 1", (usuario["email"],))
    return row["id"] if row else None


# ══════════════════════════════════════════════════════════════════════════════
# Inspeções de Liderança
# ══════════════════════════════════════════════════════════════════════════════

@bp.get("/api/me")
@requer_auth
def me():
    """
    Retorna dados do usuário logado + colaborador vinculado pelo email (se existir).
    Usado pelo módulo mobile de checklist para pré-preencher o cabeçalho.
    """
    usuario = usuario_atual()
    email = usuario.get("email", "")

    # Tenta achar o colaborador pelo nome do Azure AD (match parcial)
    # A tabela colaboradores não tem email, usa nome como ponte
    nome_azure = usuario.get("nome", "")
    colab = None
    if nome_azure:
        # Tenta match exato primeiro, depois parcial
        colab = db_fetchone("""
            SELECT id, nome, cpf, cargo
            FROM colaboradores
            WHERE ativo = TRUE AND nome ILIKE %s
            LIMIT 1
        """, (nome_azure,))
        if not colab:
            partes = nome_azure.strip().split()
            if len(partes) >= 2:
                colab = db_fetchone("""
                    SELECT id, nome, cpf, cargo
                    FROM colaboradores
                    WHERE ativo = TRUE
                      AND nome ILIKE %s AND nome ILIKE %s
                    LIMIT 1
                """, (f"%{partes[0]}%", f"%{partes[-1]}%"))

    return ok({
        "email": email,
        "nome":  usuario.get("nome", ""),
        "colaborador": colab,  # pode ser None se não achar
    })


@bp.get("/api/lideranca/")
@requer_auth
def listar_lideranca():
    filtros = request.args
    where, params = ["1=1"], []

    if filtros.get("contrato_id"):
        where.append("l.contrato_id = %s"); params.append(int(filtros["contrato_id"]))
    if filtros.get("usuario_id"):
        where.append("l.lider_id = %s");    params.append(int(filtros["usuario_id"]))
    if filtros.get("data_ini"):
        where.append("l.data_inspecao >= %s"); params.append(filtros["data_ini"])
    if filtros.get("data_fim"):
        where.append("l.data_inspecao <= %s"); params.append(filtros["data_fim"])

    limit  = min(int(filtros.get("limit",  "200")), 500)
    offset = int(filtros.get("offset", "0"))

    sql = f"""
        SELECT l.*, c.codigo AS contrato_cod,
               u1.nome AS lider_nome, u2.nome AS inspetor_nome
        FROM inspecoes_lideranca l
        LEFT JOIN contratos c ON c.id = l.contrato_id
        LEFT JOIN usuarios u1 ON u1.id = l.lider_id
        LEFT JOIN usuarios u2 ON u2.id = l.inspetor_id
        WHERE {' AND '.join(where)}
        ORDER BY l.data_inspecao DESC
        LIMIT %s OFFSET %s
    """
    params += [limit, offset]
    return ok(db_fetch(sql, params))


@bp.get("/api/lideranca/<int:id>")
@requer_auth
def obter_lideranca(id):
    row = db_fetchone("""
        SELECT l.*, c.codigo AS contrato_cod,
               u1.nome AS lider_nome, u2.nome AS inspetor_nome
        FROM inspecoes_lideranca l
        LEFT JOIN contratos c ON c.id = l.contrato_id
        LEFT JOIN usuarios u1 ON u1.id = l.lider_id
        LEFT JOIN usuarios u2 ON u2.id = l.inspetor_id
        WHERE l.id = %s
    """, (id,))
    if not row:
        return err("Registro não encontrado", 404)
    return ok(row)


@bp.post("/api/lideranca/")
@requer_auth
def criar_lideranca():
    d = request.json or {}
    if not d.get("data_inspecao"):
        return err("data_inspecao obrigatória")

    ano    = int(d["data_inspecao"][:4])
    codigo = next_seq("inspecoes_lideranca", "IL", ano)
    local_id = d.get("local_id") or None

    # inspetor_id: usa o da sessão se não informado explicitamente
    inspetor_id = d.get("inspetor_id") or _usuario_id_sessao()

    # ON CONFLICT DO UPDATE garante RETURNING id mesmo em race condition de sync duplo.
    row = db_returning("""
        INSERT INTO inspecoes_lideranca
            (codigo, data_inspecao, lider_id, inspetor_id, contrato_id,
             local_descricao, equipe_inspecionada, total_itens, itens_conformes,
             observacoes, acoes_imediatas, local_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (local_id) DO UPDATE
            SET updated_at = NOW(),
                codigo     = inspecoes_lideranca.codigo
        RETURNING id, codigo
    """, (
        codigo, d["data_inspecao"], d.get("lider_id"), inspetor_id,
        d.get("contrato_id"), d.get("local_descricao"), d.get("equipe_inspecionada"),
        d.get("total_itens"), d.get("itens_conformes"),
        d.get("observacoes"), d.get("acoes_imediatas"), local_id,
    ))
    status = 201 if not local_id else 200
    return ok({"id": row["id"], "codigo": row["codigo"]}, status)


@bp.put("/api/lideranca/<int:id>")
@requer_auth
def atualizar_lideranca(id):
    d = request.json or {}
    db_exec("""
        UPDATE inspecoes_lideranca SET
            data_inspecao=%s, lider_id=%s, inspetor_id=%s, contrato_id=%s,
            local_descricao=%s, equipe_inspecionada=%s, total_itens=%s,
            itens_conformes=%s, observacoes=%s, acoes_imediatas=%s, updated_at=NOW()
        WHERE id=%s
    """, (
        d.get("data_inspecao"), d.get("lider_id"), d.get("inspetor_id"),
        d.get("contrato_id"), d.get("local_descricao"), d.get("equipe_inspecionada"),
        d.get("total_itens"), d.get("itens_conformes"),
        d.get("observacoes"), d.get("acoes_imediatas"), id,
    ))
    return ok({"ok": True})


@bp.delete("/api/lideranca/<int:id>")
@requer_auth
def deletar_lideranca(id):
    # Verificar que o registro existe antes de deletar
    if not db_fetchone("SELECT id FROM inspecoes_lideranca WHERE id = %s", (id,)):
        return err("Registro não encontrado", 404)
    db_exec("DELETE FROM inspecoes_lideranca WHERE id = %s", (id,))
    return ok({"ok": True})


# ══════════════════════════════════════════════════════════════════════════════
# Ações SESMT
# ══════════════════════════════════════════════════════════════════════════════

@bp.get("/api/acoes/")
@requer_auth
def listar_acoes():
    filtros = request.args
    where, params = ["1=1"], []

    if filtros.get("tipo"):
        where.append("a.tipo = %s");           params.append(filtros["tipo"])
    if filtros.get("contrato"):
        where.append("a.contrato = %s");       params.append(filtros["contrato"])
    if filtros.get("colaborador_id"):
        where.append("a.colaborador_id = %s"); params.append(int(filtros["colaborador_id"]))
    if filtros.get("data_ini"):
        where.append("a.data_evento >= %s");   params.append(filtros["data_ini"])
    if filtros.get("data_fim"):
        where.append("a.data_evento <= %s");   params.append(filtros["data_fim"])
    if filtros.get("q"):
        where.append("(LOWER(a.evento) LIKE %s OR LOWER(a.observacoes) LIKE %s)")
        like = f"%{filtros['q'].lower()}%"
        params += [like, like]

    limit  = min(int(filtros.get("limit",  "500")), 1000)
    offset = int(filtros.get("offset", "0"))

    sql = f"""
        SELECT a.*, u.nome AS colaborador_nome_lookup, u.cargo AS cargo_lookup
        FROM acoes_sesmt a
        LEFT JOIN usuarios u ON u.id = a.colaborador_id
        WHERE {' AND '.join(where)}
        ORDER BY a.data_evento DESC, a.id DESC
        LIMIT %s OFFSET %s
    """
    params += [limit, offset]
    return ok(db_fetch(sql, params))


@bp.get("/api/acoes/stats")
@requer_auth
def stats_acoes():
    ano = date.today().year
    por_tipo = db_fetch("""
        SELECT tipo, COUNT(*) AS qtd, SUM(pessoas_impactadas) AS pessoas
        FROM acoes_sesmt WHERE EXTRACT(YEAR FROM data_evento) = %s
        GROUP BY tipo ORDER BY qtd DESC
    """, (ano,))
    mensal = db_fetch("""
        SELECT EXTRACT(MONTH FROM data_evento)::int AS mes,
               SUM(pessoas_impactadas) AS pessoas, COUNT(*) AS acoes
        FROM acoes_sesmt WHERE EXTRACT(YEAR FROM data_evento) = %s
        GROUP BY mes ORDER BY mes
    """, (ano,))
    totais = db_fetchone("""
        SELECT COUNT(*) AS total_acoes, SUM(pessoas_impactadas) AS total_pessoas
        FROM acoes_sesmt WHERE EXTRACT(YEAR FROM data_evento) = %s
    """, (ano,)) or {}
    return ok({"por_tipo": por_tipo, "mensal": mensal, "totais": totais})


@bp.get("/api/acoes/<int:id>")
@requer_auth
def obter_acao(id):
    row = db_fetchone("""
        SELECT a.*, u.nome AS colaborador_nome_lookup
        FROM acoes_sesmt a LEFT JOIN usuarios u ON u.id = a.colaborador_id
        WHERE a.id = %s
    """, (id,))
    if not row:
        return err("Ação não encontrada", 404)
    return ok(row)


@bp.post("/api/acoes/")
@requer_auth
def criar_acao():
    d = request.json or {}
    for f in ["data_evento", "evento", "tipo"]:
        if not d.get(f):
            return err(f"Campo obrigatório: {f}")
    row = db_returning("""
        INSERT INTO acoes_sesmt
            (data_evento, evento, pessoas_impactadas, observacoes,
             colaborador_nome, cargo, contrato, tipo, colaborador_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (
        d["data_evento"], d["evento"], d.get("pessoas_impactadas", 0),
        d.get("observacoes"), d.get("colaborador_nome"), d.get("cargo"),
        d.get("contrato"), d["tipo"], d.get("colaborador_id"),
    ))
    return ok({"id": row["id"]}, 201)


@bp.put("/api/acoes/<int:id>")
@requer_auth
def atualizar_acao(id):
    d = request.json or {}
    db_exec("""
        UPDATE acoes_sesmt SET
            data_evento=%s, evento=%s, pessoas_impactadas=%s, observacoes=%s,
            colaborador_nome=%s, cargo=%s, contrato=%s, tipo=%s,
            colaborador_id=%s, updated_at=NOW()
        WHERE id=%s
    """, (
        d.get("data_evento"), d.get("evento"), d.get("pessoas_impactadas", 0),
        d.get("observacoes"), d.get("colaborador_nome"), d.get("cargo"),
        d.get("contrato"), d.get("tipo"), d.get("colaborador_id"), id,
    ))
    return ok({"ok": True})


@bp.delete("/api/acoes/<int:id>")
@requer_auth
def deletar_acao(id):
    if not db_fetchone("SELECT id FROM acoes_sesmt WHERE id = %s", (id,)):
        return err("Ação não encontrada", 404)
    db_exec("DELETE FROM acoes_sesmt WHERE id = %s", (id,))
    return ok({"ok": True})


# ══════════════════════════════════════════════════════════════════════════════
# Colaboradores
# ══════════════════════════════════════════════════════════════════════════════

@bp.get("/api/colaboradores")
@requer_auth
def listar_colaboradores():
    q = request.args.get("q", "").strip()
    if q:
        rows = db_fetch(
            """SELECT id, nome, cpf, cargo, telefone, ativo
               FROM colaboradores
               WHERE ativo = TRUE AND (
                   nome ILIKE %s OR cpf ILIKE %s OR cargo ILIKE %s
               )
               ORDER BY nome LIMIT 50""",
            (f"%{q}%", f"%{q}%", f"%{q}%")
        )
    else:
        rows = db_fetch(
            """SELECT id, nome, cpf, cargo, telefone, ativo
               FROM colaboradores
               WHERE ativo = TRUE
               ORDER BY nome"""
        )
    return ok(rows)


@bp.post("/api/colaboradores")
@requer_auth
def criar_colaborador():
    d = request.json or {}
    if not d.get("nome") or not d.get("cpf"):
        return err("nome e cpf são obrigatórios")
    try:
        row = db_returning("""
            INSERT INTO colaboradores (cpf, nome, cargo, telefone, ativo)
            VALUES (%s, %s, %s, %s, TRUE)
            ON CONFLICT (cpf) DO UPDATE SET
                nome=EXCLUDED.nome, cargo=EXCLUDED.cargo,
                telefone=EXCLUDED.telefone, ativo=TRUE
            RETURNING id
        """, (d["cpf"], d["nome"], d.get("cargo"), d.get("telefone")))
        return ok({"id": row["id"]}, 201)
    except Exception as e:
        return err(str(e))


@bp.get("/api/colaboradores/<int:id>")
@requer_auth
def obter_colaborador(id):
    row = db_fetchone("SELECT * FROM colaboradores WHERE id = %s", (id,))
    if not row:
        return err("Não encontrado", 404)
    return ok(row)


@bp.put("/api/colaboradores/<int:id>")
@requer_auth
def atualizar_colaborador(id):
    d = request.json or {}
    if "ativo" in d and len(d) == 1:
        db_exec("UPDATE colaboradores SET ativo=%s, updated_at=NOW() WHERE id=%s",
                (bool(d["ativo"]), id))
    else:
        db_exec("""
            UPDATE colaboradores SET
                nome=%s, cargo=%s, telefone=%s, contrato=%s, updated_at=NOW()
            WHERE id=%s
        """, (d.get("nome"), d.get("cargo"), d.get("telefone"), d.get("contrato"), id))
    return ok({"ok": True})


@bp.delete("/api/colaboradores/<int:id>")
@requer_auth
def deletar_colaborador(id):
    db_exec("UPDATE colaboradores SET ativo=FALSE WHERE id=%s", (id,))
    return ok({"ok": True})


# ══════════════════════════════════════════════════════════════════════════════
# Busca global com has_more e total
# ══════════════════════════════════════════════════════════════════════════════

@bp.get("/api/busca")
@requer_auth
def busca_global():
    q = request.args.get("q", "").strip()
    if not q or len(q) < 2:
        return ok({"inspecoes": [], "ncs": [], "colaboradores": [], "acoes": []})

    like = f"%{q}%"
    LIMIT = 5

    # Inspeções
    inspecoes = db_fetch("""
        SELECT i.id, i.codigo, i.data_inspecao, i.tipo_inspecao, m.nome AS municipio
        FROM inspecoes i LEFT JOIN municipios m ON m.id = i.municipio_id
        WHERE i.codigo ILIKE %s OR i.local_descricao ILIKE %s
           OR m.nome ILIKE %s OR i.tipo_inspecao ILIKE %s
        ORDER BY i.data_inspecao DESC LIMIT %s
    """, (like, like, like, like, LIMIT + 1))

    # NCs
    ncs = db_fetch("""
        SELECT id, codigo, descricao, gravidade, status
        FROM nao_conformidades
        WHERE codigo ILIKE %s OR descricao ILIKE %s
        ORDER BY created_at DESC LIMIT %s
    """, (like, like, LIMIT + 1))

    # Colaboradores
    colaboradores = db_fetch("""
        SELECT id, nome, cpf, cargo FROM colaboradores
        WHERE (nome ILIKE %s OR cpf ILIKE %s OR cargo ILIKE %s)
          AND ativo = TRUE LIMIT %s
    """, (like, like, like, LIMIT + 1))

    # Ações
    acoes = db_fetch("""
        SELECT id, evento, tipo, data_evento FROM acoes_sesmt
        WHERE evento ILIKE %s OR tipo ILIKE %s
        ORDER BY data_evento DESC LIMIT %s
    """, (like, like, LIMIT + 1))

    def _paginar(rows):
        has_more = len(rows) > LIMIT
        return {"items": rows[:LIMIT], "has_more": has_more}

    return ok({
        "inspecoes":    _paginar(inspecoes),
        "ncs":          _paginar(ncs),
        "colaboradores": _paginar(colaboradores),
        "acoes":        _paginar(acoes),
    })
