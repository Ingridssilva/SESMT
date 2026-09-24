"""
helpers.py — Funções utilitárias compartilhadas
SESMT Empresa Exemplo
"""

import json
from datetime import date, datetime
from database import DateEncoder


# ══════════════════════════════════════════════════════════════════════════════
# NDGS — fonte única de verdade
# Colunas reais da tabela indicadores_mensais:
#   ano, mes, ndgs_geral, inspecoes_realizadas, ncs_abertas,
#   ncs_encerradas, treinamentos, pessoas_treinadas, observacoes
# ══════════════════════════════════════════════════════════════════════════════

def calc_ndgs(row: dict) -> dict:
    """
    Calcula / enriquece um registro de indicadores_mensais com o NDGS.

    Como a tabela já armazena ndgs_geral diretamente, simplesmente
    retornamos os campos formatados. Campos derivados são calculados
    quando possível.
    """
    ndgs = row.get("ndgs_geral")

    insp  = row.get("inspecoes_realizadas") or 0
    ncs_a = row.get("ncs_abertas")          or 0
    ncs_e = row.get("ncs_encerradas")       or 0
    trein = row.get("treinamentos")         or 0
    pess  = row.get("pessoas_treinadas")    or 0

    def r2(v):
        return round(float(v), 2) if v is not None else None

    return {
        "ndgs":                r2(ndgs),
        "inspecoes_realizadas": insp,
        "ncs_abertas":          ncs_a,
        "ncs_encerradas":       ncs_e,
        "treinamentos":         trein,
        "pessoas_treinadas":    pess,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Formatação de datas
# ══════════════════════════════════════════════════════════════════════════════

MES_PT = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
                "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def fmt_mes_ano(ano: int, mes: int) -> str:
    """Formata ano+mes inteiros como 'Jan/2026'."""
    if not ano or not mes:
        return "—"
    return f"{MES_PT[mes]}/{ano}"


def fmt_competencia(d) -> str:
    """Compatibilidade com código antigo que passa um date."""
    if not d:
        return "—"
    if isinstance(d, str):
        d = date.fromisoformat(d)
    if isinstance(d, date):
        return f"{MES_PT[d.month]}/{d.year}"
    return "—"


# ══════════════════════════════════════════════════════════════════════════════
# Respostas JSON padronizadas
# ══════════════════════════════════════════════════════════════════════════════

def ok(data, code: int = 200):
    from flask import current_app
    return current_app.response_class(
        json.dumps(data, cls=DateEncoder, ensure_ascii=False),
        status=code,
        mimetype="application/json",
    )


def err(msg: str, code: int = 400):
    from flask import jsonify
    return jsonify({"erro": msg}), code
