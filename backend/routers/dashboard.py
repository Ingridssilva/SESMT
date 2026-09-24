"""routes/dashboard.py — Rotas de lookup e dashboard."""

from datetime import date
from flask import Blueprint
from database import db_fetch, db_fetchone, get_conn
from helpers import ok, err, calc_ndgs, fmt_mes_ano
from auth import requer_auth

bp = Blueprint("dashboard", __name__)


# ── Lookup ────────────────────────────────────────────────────────────────────

@bp.get("/api/lookup/municipios")
@requer_auth
def lookup_municipios():
    return ok(db_fetch("SELECT id, nome FROM municipios ORDER BY nome"))


@bp.get("/api/lookup/contratos")
@requer_auth
def lookup_contratos():
    return ok(db_fetch("SELECT id, codigo, descricao FROM contratos ORDER BY codigo"))


@bp.get("/api/lookup/usuarios")
@requer_auth
def lookup_usuarios():
    return ok(db_fetch("SELECT id, nome, cargo FROM usuarios ORDER BY nome"))


# ── Dashboard ─────────────────────────────────────────────────────────────────

@bp.get("/api/dashboard/")
@requer_auth
def dashboard():
    """
    Consolidado em 2 queries via CTE para reduzir round-trips ao banco.
    Anteriormente fazia 6 queries sequenciais.
    """
    hoje    = date.today()
    mes_ini = date(hoje.year, hoje.month, 1)

    # Query 1 — contadores principais (CTE única)
    resumo = db_fetchone("""
        WITH
          insp_mes AS (
            SELECT COUNT(*) AS total
            FROM inspecoes
            WHERE data_inspecao >= %(mes_ini)s
          ),
          lid_mes AS (
            SELECT COUNT(*) AS total
            FROM inspecoes_lideranca
            WHERE data_inspecao >= %(mes_ini)s
          ),
          nc_stats AS (
            SELECT
              COUNT(*) FILTER (WHERE status != 'ENCERRADA')                           AS abertas,
              COUNT(*) FILTER (WHERE status != 'ENCERRADA' AND prazo < CURRENT_DATE)  AS vencidas,
              COUNT(*) FILTER (WHERE gravidade = 'CRÍTICA'  AND status != 'ENCERRADA') AS criticas
            FROM nao_conformidades
          ),
          ind AS (
            SELECT ndgs_geral
            FROM indicadores_mensais
            WHERE ano = %(ano)s AND mes = %(mes)s
            LIMIT 1
          )
        SELECT
          (SELECT total FROM insp_mes)   AS total_insp_mes,
          (SELECT total FROM lid_mes)    AS total_il_mes,
          (SELECT abertas  FROM nc_stats) AS ncs_abertas,
          (SELECT vencidas FROM nc_stats) AS ncs_vencidas,
          (SELECT criticas FROM nc_stats) AS ncs_criticas,
          (SELECT ndgs_geral FROM ind)    AS ndgs_geral
    """, {"mes_ini": mes_ini, "ano": hoje.year, "mes": hoje.month}) or {}

    ndgs_atual = round(float(resumo["ndgs_geral"]), 2) if resumo.get("ndgs_geral") is not None else None

    # Query 2 — listas (podem ser paralelas se migrar para async; por ora sequenciais)
    ultimas_insp = db_fetch("""
        SELECT i.id, i.codigo, i.data_inspecao AS data, i.tipo_inspecao AS tipo,
               COALESCE(m.nome, i.local_descricao) AS local,
               COUNT(nc.id) AS qty_ncs
        FROM inspecoes i
        LEFT JOIN municipios m ON m.id = i.municipio_id
        LEFT JOIN nao_conformidades nc ON nc.inspecao_id = i.id
        GROUP BY i.id, i.codigo, i.data_inspecao, i.tipo_inspecao, m.nome, i.local_descricao
        ORDER BY i.data_inspecao DESC LIMIT 8
    """)

    ultimas_ncs = db_fetch("""
        SELECT id, codigo, descricao, gravidade, status
        FROM nao_conformidades
        WHERE status != 'ENCERRADA'
        ORDER BY created_at DESC LIMIT 6
    """)

    return ok({
        "ndgs_atual":     ndgs_atual,
        "total_insp_mes": resumo.get("total_insp_mes", 0),
        "total_il_mes":   resumo.get("total_il_mes", 0),
        "ncs_abertas":    resumo.get("ncs_abertas", 0),
        "ncs_vencidas":   resumo.get("ncs_vencidas", 0),
        "ncs_criticas":   resumo.get("ncs_criticas", 0),
        "ultimas_insp":   ultimas_insp,
        "ultimas_ncs":    ultimas_ncs,
    })


@bp.get("/api/dashboard/ndgs-historico")
@requer_auth
def ndgs_historico():
    """
    CORRIGIDO: removidas as chaves 'icad' e 'icit' que causavam KeyError —
    calc_ndgs() nunca retornou esses campos.
    """
    rows = db_fetch(
        "SELECT * FROM indicadores_mensais ORDER BY ano DESC, mes DESC LIMIT 12"
    )
    result = []
    for r in reversed(rows):
        calc = calc_ndgs(r)
        result.append({
            "mes":  fmt_mes_ano(r["ano"], r["mes"]),
            "ndgs": calc["ndgs"],
            # icad / icit removidos — não existem em calc_ndgs() nem na tabela
        })
    return ok(result)


@bp.get("/api/dashboard/kpis")
@requer_auth
def dashboard_kpis():
    """
    Consolidado de 8 queries sequenciais para 2 queries via CTE.
    """
    hoje    = date.today()
    mes_ini = date(hoje.year, hoje.month, 1)
    ano_ini = date(hoje.year, 1, 1)

    # Query 1 — todos os contadores em uma CTE
    stats = db_fetchone("""
        WITH
          insp_ano AS (
            SELECT COUNT(*) AS n FROM inspecoes WHERE data_inspecao >= %(ano_ini)s
          ),
          insp_mes AS (
            SELECT COUNT(*) AS n FROM inspecoes WHERE data_inspecao >= %(mes_ini)s
          ),
          insp_total AS (
            SELECT COUNT(*) AS n FROM inspecoes
          ),
          lid_ano AS (
            SELECT COUNT(*) AS n FROM inspecoes_lideranca WHERE data_inspecao >= %(ano_ini)s
          ),
          nc_stats AS (
            SELECT
              COUNT(*) FILTER (WHERE status != 'ENCERRADA')                           AS abertas,
              COUNT(*) FILTER (WHERE status != 'ENCERRADA' AND prazo < NOW())         AS vencidas,
              COUNT(*) FILTER (WHERE gravidade = 'CRÍTICA'  AND status != 'ENCERRADA') AS criticas
            FROM nao_conformidades
          ),
          cl_mes AS (
            SELECT COUNT(*) AS n FROM checklist_preenchimentos WHERE created_at >= %(mes_ini)s
          ),
          cl_ano AS (
            SELECT COUNT(*) AS n FROM checklist_preenchimentos WHERE created_at >= %(ano_ini)s
          ),
          cols AS (
            SELECT COUNT(*) AS n FROM colaboradores WHERE ativo = TRUE
          ),
          ind AS (
            SELECT ndgs_geral FROM indicadores_mensais
            WHERE ano = %(ano)s AND mes = %(mes)s LIMIT 1
          )
        SELECT
          (SELECT n FROM insp_ano)   AS inspecoes_campo,
          (SELECT n FROM insp_mes)   AS inspecoes_mes,
          (SELECT n FROM insp_total) AS inspecoes_total,
          (SELECT n FROM lid_ano)    AS inspecoes_lid,
          (SELECT abertas  FROM nc_stats) AS ncs_abertas,
          (SELECT vencidas FROM nc_stats) AS ncs_vencidas,
          (SELECT criticas FROM nc_stats) AS ncs_criticas,
          (SELECT n FROM cl_mes)  AS checklists_mes,
          (SELECT n FROM cl_ano)  AS checklists_ano,
          (SELECT n FROM cols)    AS colaboradores,
          (SELECT ndgs_geral FROM ind) AS ndgs_geral
    """, {"mes_ini": mes_ini, "ano_ini": ano_ini, "ano": hoje.year, "mes": hoje.month}) or {}

    k = {
        "inspecoes_campo":  stats.get("inspecoes_campo", 0),
        "inspecoes_mes":    stats.get("inspecoes_mes", 0),
        "inspecoes_ano":    stats.get("inspecoes_campo", 0),   # mesmo que campo (ano atual)
        "inspecoes_lid":    stats.get("inspecoes_lid", 0),
        "inspecoes_total":  stats.get("inspecoes_total", 0),
        "ncs_abertas":      stats.get("ncs_abertas", 0),
        "ncs_vencidas":     stats.get("ncs_vencidas", 0),
        "ncs_criticas":     stats.get("ncs_criticas", 0),
        "checklists_mes":   stats.get("checklists_mes", 0),
        "checklists_ano":   stats.get("checklists_ano", 0),
        "colaboradores":    stats.get("colaboradores", 0),
        "ndgs_mes": (
            round(float(stats["ndgs_geral"]), 2)
            if stats.get("ndgs_geral") is not None else None
        ),
    }

    # Query 2 — por município (não dá para colocar na CTE acima por ser lista)
    muns = db_fetch("""
        SELECT m.nome AS municipio, COUNT(*) AS total
        FROM inspecoes i
        JOIN municipios m ON m.id = i.municipio_id
        WHERE i.data_inspecao >= %s
        GROUP BY m.nome ORDER BY total DESC LIMIT 8
    """, (ano_ini,))
    k["por_municipio"] = muns

    return ok(k)


@bp.get("/api/dashboard/tendencia")
@requer_auth
def dashboard_tendencia():
    rows = db_fetch("""
        WITH meses AS (
            SELECT generate_series(
                date_trunc('month', NOW() - interval '11 months'),
                date_trunc('month', NOW()),
                interval '1 month'
            ) AS mes
        )
        SELECT
            EXTRACT(YEAR  FROM m.mes)::int AS ano,
            EXTRACT(MONTH FROM m.mes)::int AS mes,
            COUNT(DISTINCT i.id) AS inspecoes,
            COUNT(DISTINCT n.id) AS ncs
        FROM meses m
        LEFT JOIN inspecoes i          ON date_trunc('month', i.data_inspecao) = m.mes
        LEFT JOIN nao_conformidades n  ON date_trunc('month', n.created_at)    = m.mes
        GROUP BY m.mes ORDER BY m.mes
    """)
    return ok(rows)


@bp.get("/api/dashboard/checklists-analytics")
@requer_auth
def checklists_analytics():
    """
    Analytics de checklists para o dashboard:
    - Itens mais não conformes (ranking)
    - Preenchimentos por modelo
    - Evolução mensal dos checklists lançados
    - Top colaboradores com NCs
    """
    hoje    = date.today()
    ano_ini = date(hoje.year, 1, 1)

    # 1. Itens mais não conformes no ano
    top_ncs = db_fetch("""
        SELECT
            ci.descricao AS item,
            cs.titulo    AS secao,
            cm.titulo    AS modelo,
            COUNT(*)     AS total_nc
        FROM checklist_respostas cr
        JOIN checklist_itens  ci ON ci.id = cr.item_id
        JOIN checklist_secoes cs ON cs.id = ci.secao_id
        JOIN checklist_modelos cm ON cm.id = cs.modelo_id
        JOIN checklist_preenchimentos cp ON cp.id = cr.preenchimento_id
        WHERE cr.situacao IN ('NÃO CONFORME', 'RUIM', 'NAO CONFORME')
          AND cp.created_at >= %s
        GROUP BY ci.id, ci.descricao, cs.titulo, cm.titulo
        ORDER BY total_nc DESC
        LIMIT 10
    """, (ano_ini,))

    # 2. Preenchimentos por modelo (ano)
    por_modelo = db_fetch("""
        SELECT
            cm.titulo AS modelo,
            cm.codigo AS codigo,
            COUNT(cp.id) AS total,
            COUNT(cp.id) FILTER (WHERE cp.resultado_geral IN ('NÃO CONFORME', 'NAO CONFORME')) AS total_nc
        FROM checklist_preenchimentos cp
        JOIN checklist_modelos cm ON cm.id = cp.modelo_id
        WHERE cp.created_at >= %s
        GROUP BY cm.id, cm.titulo, cm.codigo
        ORDER BY total DESC
    """, (ano_ini,))

    # 3. Evolução mensal (últimos 6 meses)
    evolucao = db_fetch("""
        SELECT
            EXTRACT(YEAR  FROM cp.created_at)::int AS ano,
            EXTRACT(MONTH FROM cp.created_at)::int AS mes,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE cp.resultado_geral IN ('NÃO CONFORME', 'NAO CONFORME')) AS total_nc
        FROM checklist_preenchimentos cp
        WHERE cp.created_at >= NOW() - INTERVAL '6 months'
        GROUP BY ano, mes
        ORDER BY ano, mes
    """)

    # 4. Taxa de conformidade por modelo (ano)
    taxa = db_fetch("""
        SELECT
            cm.titulo AS modelo,
            COUNT(cr.id) AS total_respostas,
            COUNT(cr.id) FILTER (WHERE cr.situacao IN ('CONFORME','BOM')) AS conformes,
            COUNT(cr.id) FILTER (WHERE cr.situacao IN ('NÃO CONFORME','RUIM','NAO CONFORME')) AS nao_conformes,
            ROUND(
                100.0 * COUNT(cr.id) FILTER (WHERE cr.situacao IN ('CONFORME','BOM'))
                / NULLIF(COUNT(cr.id) FILTER (WHERE cr.situacao NOT IN ('N/A','NÃO SE APLICA')), 0),
            1) AS taxa_conformidade
        FROM checklist_respostas cr
        JOIN checklist_preenchimentos cp ON cp.id = cr.preenchimento_id
        JOIN checklist_modelos cm ON cm.id = cp.modelo_id
        WHERE cp.created_at >= %s
        GROUP BY cm.id, cm.titulo
        ORDER BY taxa_conformidade ASC NULLS LAST
    """, (ano_ini,))

    return ok({
        "top_ncs":     top_ncs,
        "por_modelo":  por_modelo,
        "evolucao":    evolucao,
        "taxa":        taxa,
        "ano":         hoje.year,
    })
