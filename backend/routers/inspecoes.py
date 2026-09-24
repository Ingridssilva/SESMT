"""routes/inspecoes.py — Inspeções de campo."""

from datetime import date
from flask import Blueprint, request, Response
from database import db_fetch, db_fetchone, db_exec, db_returning, next_seq, get_conn
from helpers import ok, err
from auth import requer_auth, usuario_atual
import io, csv
from datetime import datetime

bp = Blueprint("inspecoes", __name__)


@bp.get("/api/inspecoes/")
@requer_auth
def listar_inspecoes():
    filtros = request.args
    where, params = ["1=1"], []

    if filtros.get("municipio_id"):
        where.append("i.municipio_id = %s"); params.append(int(filtros["municipio_id"]))
    if filtros.get("contrato_id"):
        where.append("i.contrato_id = %s");  params.append(int(filtros["contrato_id"]))
    if filtros.get("tipo"):
        where.append("i.tipo_inspecao = %s"); params.append(filtros["tipo"])
    if filtros.get("data_ini"):
        where.append("i.data_inspecao >= %s"); params.append(filtros["data_ini"])
    if filtros.get("data_fim"):
        where.append("i.data_inspecao <= %s"); params.append(filtros["data_fim"])

    # Paginação
    limit  = min(int(filtros.get("limit",  "200")), 500)
    offset = int(filtros.get("offset", "0"))

    sql = f"""
        SELECT i.*, c.codigo AS contrato_cod, m.nome AS municipio_nome,
               u.nome AS inspetor_nome, COUNT(nc.id) AS qty_ncs
        FROM inspecoes i
        LEFT JOIN contratos c          ON c.id = i.contrato_id
        LEFT JOIN municipios m         ON m.id = i.municipio_id
        LEFT JOIN usuarios u           ON u.id = i.usuario_id
        LEFT JOIN nao_conformidades nc ON nc.inspecao_id = i.id
        WHERE {' AND '.join(where)}
        GROUP BY i.id, c.codigo, m.nome, u.nome
        ORDER BY i.data_inspecao DESC
        LIMIT %s OFFSET %s
    """
    params += [limit, offset]
    return ok(db_fetch(sql, params))


@bp.get("/api/inspecoes/<int:id>")
@requer_auth
def obter_inspecao(id):
    row = db_fetchone("""
        SELECT i.*, c.codigo AS contrato_cod, m.nome AS municipio_nome, u.nome AS inspetor_nome
        FROM inspecoes i
        LEFT JOIN contratos c  ON c.id = i.contrato_id
        LEFT JOIN municipios m ON m.id = i.municipio_id
        LEFT JOIN usuarios u   ON u.id = i.usuario_id
        WHERE i.id = %s
    """, (id,))
    if not row:
        return err("Inspeção não encontrada", 404)
    row["ncs"] = db_fetch(
        "SELECT * FROM nao_conformidades WHERE inspecao_id = %s ORDER BY created_at", (id,)
    )
    return ok(row)


@bp.post("/api/inspecoes/")
@requer_auth
def criar_inspecao():
    d = request.json or {}
    for f in ["data_inspecao", "tipo_inspecao"]:
        if not d.get(f):
            return err(f"Campo obrigatório: {f}")

    ano    = int(d["data_inspecao"][:4])
    codigo = next_seq("inspecoes", "INSP", ano)

    local_id = d.get("local_id") or None

    # usuario_id: usar o da sessão se não informado explicitamente
    usuario_id = d.get("usuario_id")
    if not usuario_id:
        u = usuario_atual()
        row_u = db_fetchone("SELECT id FROM usuarios WHERE email = %s LIMIT 1", (u["email"],))
        usuario_id = row_u["id"] if row_u else None

    # ON CONFLICT DO UPDATE garante que RETURNING id sempre retorna — mesmo em race condition.
    # Antes havia uma verificação prévia + ON CONFLICT DO UPDATE sem RETURNING de id,
    # o que causava retorno de None quando dois requests chegavam simultaneamente.
    row = db_returning("""
        INSERT INTO inspecoes
            (codigo, data_inspecao, tipo_inspecao, municipio_id, contrato_id,
             usuario_id, local_descricao, equipe, observacoes, pontos_positivos,
             conformidades_verificadas, conformidades_ok, local_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (local_id) DO UPDATE
            SET updated_at = NOW(),
                codigo     = inspecoes.codigo
        RETURNING id, codigo
    """, (
        codigo, d["data_inspecao"], d["tipo_inspecao"],
        d.get("municipio_id"), d.get("contrato_id"), usuario_id,
        d.get("local_descricao"), d.get("equipe"), d.get("observacoes"),
        d.get("pontos_positivos"), d.get("conformidades_verificadas"), d.get("conformidades_ok"),
        local_id,
    ))
    # row nunca é None: INSERT novo retorna 201, conflito retorna 200
    status = 201 if not local_id else 200
    return ok({"id": row["id"], "codigo": row["codigo"]}, status)


@bp.put("/api/inspecoes/<int:id>")
@requer_auth
def atualizar_inspecao(id):
    d = request.json or {}
    db_exec("""
        UPDATE inspecoes SET
            data_inspecao=%s, tipo_inspecao=%s, municipio_id=%s, contrato_id=%s,
            usuario_id=%s, local_descricao=%s, equipe=%s, observacoes=%s,
            pontos_positivos=%s, conformidades_verificadas=%s, conformidades_ok=%s,
            updated_at=NOW()
        WHERE id=%s
    """, (
        d.get("data_inspecao"), d.get("tipo_inspecao"), d.get("municipio_id"),
        d.get("contrato_id"), d.get("usuario_id"), d.get("local_descricao"),
        d.get("equipe"), d.get("observacoes"), d.get("pontos_positivos"),
        d.get("conformidades_verificadas"), d.get("conformidades_ok"), id,
    ))
    return ok({"ok": True})


@bp.delete("/api/inspecoes/<int:id>")
@requer_auth
def deletar_inspecao(id):
    # Transação explícita: deletar NCs e depois a inspeção
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM nao_conformidades WHERE inspecao_id = %s", (id,))
            cur.execute("DELETE FROM inspecoes WHERE id = %s", (id,))
    return ok({"ok": True})


@bp.get("/api/exportar/inspecoes")
@requer_auth
def exportar_inspecoes():
    from database import db_fetch_cursor
    sql = """
        SELECT i.codigo, i.data_inspecao, i.tipo_inspecao,
               m.nome AS municipio, c.codigo AS contrato,
               u.nome AS responsavel, i.local_descricao,
               i.pontos_positivos, i.observacoes,
               COUNT(n.id) AS qty_ncs
        FROM inspecoes i
        LEFT JOIN municipios m         ON m.id = i.municipio_id
        LEFT JOIN contratos c          ON c.id = i.contrato_id
        LEFT JOIN usuarios u           ON u.id = i.usuario_id
        LEFT JOIN nao_conformidades n  ON n.inspecao_id = i.id
        GROUP BY i.id, m.nome, c.codigo, u.nome
        ORDER BY i.data_inspecao DESC
    """
    fieldnames = [
        "codigo","data_inspecao","tipo_inspecao","municipio","contrato",
        "responsavel","local_descricao","pontos_positivos","observacoes","qty_ncs",
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
        headers={"Content-Disposition": 'attachment; filename="inspecoes.csv"'},
    )


# ── Relatório PDF de Inspeção ──────────────────────────────────────────────────

@bp.get("/api/inspecoes/<int:id>/relatorio-pdf")
@requer_auth
def relatorio_pdf_inspecao(id):
    """
    Gera um PDF completo da inspeção de campo:
    - Dados da inspeção (código, data, tipo, município, contrato, responsável)
    - Todos os checklists preenchidos com suas seções e itens
    - Resumo de NCs
    """
    # 1. Dados da inspeção
    insp = db_fetchone("""
        SELECT i.*, m.nome AS municipio_nome, c.codigo AS contrato_cod,
               u.nome AS inspetor_nome
        FROM inspecoes i
        LEFT JOIN municipios m  ON m.id = i.municipio_id
        LEFT JOIN contratos  c  ON c.id = i.contrato_id
        LEFT JOIN usuarios   u  ON u.id = i.usuario_id
        WHERE i.id = %s
    """, (id,))
    if not insp:
        return err("Inspeção não encontrada", 404)

    # 2. Tentar importar gerador de PDF
    try:
        from sharepoint import gerar_pdf_inspecao
    except ImportError:
        try:
            from backend.sharepoint import gerar_pdf_inspecao
        except ImportError:
            gerar_pdf_inspecao = None

    if not gerar_pdf_inspecao:
        return err("Módulo de PDF não disponível", 503)

    # 3. Checklists preenchidos desta inspeção
    preenchimentos = db_fetch("""
        SELECT cp.*, cm.titulo AS modelo_titulo, cm.codigo AS modelo_codigo,
               u.nome AS preenchido_por_nome
        FROM checklist_preenchimentos cp
        JOIN checklist_modelos cm ON cm.id = cp.modelo_id
        LEFT JOIN usuarios u ON u.id = cp.preenchido_por
        WHERE cp.inspecao_id = %s
        ORDER BY cm.codigo, cp.id
    """, (id,))

    checklists_dados = []
    for prench in preenchimentos:
        secoes_raw = db_fetch(
            "SELECT * FROM checklist_secoes WHERE modelo_id = %s ORDER BY ordem",
            (prench["modelo_id"],)
        )
        respostas_map = {
            r["item_id"]: r
            for r in db_fetch("""
                SELECT cr.*, ci.descricao, ci.tem_quant
                FROM checklist_respostas cr
                JOIN checklist_itens ci ON ci.id = cr.item_id
                WHERE cr.preenchimento_id = %s
            """, (prench["id"],))
        }
        secoes = []
        for s in secoes_raw:
            itens = db_fetch(
                "SELECT * FROM checklist_itens WHERE secao_id = %s ORDER BY ordem",
                (s["id"],)
            )
            secoes.append({
                "titulo": s["titulo"],
                "itens": [{
                    "descricao":  item["descricao"],
                    "situacao":   respostas_map.get(item["id"], {}).get("situacao"),
                    "quantidade": respostas_map.get(item["id"], {}).get("quantidade"),
                    "observacao": respostas_map.get(item["id"], {}).get("observacao"),
                    "foto_url":   respostas_map.get(item["id"], {}).get("foto_url"),
                } for item in itens],
            })
        checklists_dados.append({
            "modelo_titulo":       prench.get("modelo_titulo", ""),
            "modelo_codigo":       prench.get("modelo_codigo", ""),
            "resultado_geral":     prench.get("resultado_geral", ""),
            "observacoes_extras":  prench.get("observacoes_extras", ""),
            "preenchido_por_nome": prench.get("preenchido_por_nome", ""),
            "cabecalho":           prench.get("cabecalho") or {},
            "nome_avaliado":       prench.get("nome_avaliado", ""),
            "cargo_avaliado":      prench.get("cargo_avaliado", ""),
            "secoes":              secoes,
        })

    # 4. NCs da inspeção
    ncs = db_fetch(
        "SELECT * FROM nao_conformidades WHERE inspecao_id = %s ORDER BY gravidade, created_at",
        (id,)
    )

    # 5. Montar dict completo e gerar PDF
    dados_pdf = {
        "codigo":        insp.get("codigo", ""),
        "data_inspecao": str(insp.get("data_inspecao", ""))[:10],
        "tipo_inspecao": insp.get("tipo_inspecao", ""),
        "municipio":     insp.get("municipio_nome", ""),
        "contrato":      insp.get("contrato_cod", ""),
        "responsavel":   insp.get("inspetor_nome", ""),
        "local":         insp.get("local_descricao", ""),
        "equipe":        insp.get("equipe", ""),
        "pontos_positivos": insp.get("pontos_positivos", ""),
        "observacoes":   insp.get("observacoes", ""),
        "checklists":    checklists_dados,
        "ncs":           [dict(n) for n in ncs],
    }

    pdf_bytes = gerar_pdf_inspecao(dados_pdf)
    nome = f"{insp['codigo']}_RELATORIO.pdf"
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )
