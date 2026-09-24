"""
auth.py — Autenticação híbrida: JWT (primeira vez) + Sessão Flask (subsequentes)
SESMT Empresa Exemplo
"""

import os
import time
import logging
import functools

import jwt
import requests
from flask import request, jsonify, g, session

log = logging.getLogger(__name__)

TENANT_ID  = os.environ.get("AZURE_TENANT_ID", "")
CLIENT_ID  = os.environ.get("AZURE_CLIENT_ID", "")
JWKS_URL   = f"https://login.microsoftonline.com/{TENANT_ID}/discovery/v2.0/keys"
DOMINIO    = os.environ.get("DOMINIO_EMAIL", "empresaexemplo.com.br")

# Cache JWKS com TTL de 24 horas
# CORRIGIDO: antes o cache nunca expirava — se a Microsoft rotacionasse as chaves,
# todos os novos logins falhariam com "Chave pública não encontrada".
_jwks_cache: dict | None = None
_jwks_cache_time: float = 0
_JWKS_TTL = 86400  # 24 horas em segundos


def _get_jwks() -> dict:
    global _jwks_cache, _jwks_cache_time
    agora = time.time()

    if _jwks_cache is not None and agora - _jwks_cache_time < _JWKS_TTL:
        return _jwks_cache

    try:
        resp = requests.get(JWKS_URL, timeout=5)
        resp.raise_for_status()
        _jwks_cache      = resp.json()
        _jwks_cache_time = agora
        log.info("JWKS Microsoft carregado (%d chaves)", len(_jwks_cache.get("keys", [])))
    except Exception as e:
        log.error("Falha ao carregar JWKS: %s", e)
        # Mantém cache antigo se existir; caso contrário retorna vazio
        if _jwks_cache is None:
            _jwks_cache = {"keys": []}
    return _jwks_cache


def _decode_token(token: str) -> dict:
    if not TENANT_ID or not CLIENT_ID:
        # CORRIGIDO: antes aceitava qualquer token sem validação quando as variáveis
        # Azure não estavam configuradas (verify_signature=False silencioso).
        # Agora levanta erro explícito — é preferível falhar de forma óbvia
        # do que aceitar tokens não verificados em produção.
        raise ValueError(
            "Autenticação não configurada — defina AZURE_TENANT_ID e AZURE_CLIENT_ID "
            "nas variáveis de ambiente do Render."
        )

    jwks   = _get_jwks()
    header = jwt.get_unverified_header(token)
    kid    = header.get("kid")

    public_key = None
    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == kid:
            public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)
            break

    if public_key is None:
        # Chave não encontrada — forçar recarregamento do cache na próxima tentativa
        global _jwks_cache_time
        _jwks_cache_time = 0
        raise ValueError("Chave pública não encontrada para o token informado")

    return jwt.decode(
        token,
        key=public_key,
        algorithms=["RS256"],
        audience=CLIENT_ID,
        issuer=f"https://login.microsoftonline.com/{TENANT_ID}/v2.0",
    )


def requer_auth(f):
    """
    Decorator que protege rotas da API.
    Aceita:
      1. Sessão Flask válida (cookie) — gerada após primeiro login com JWT
      2. Bearer token JWT no header Authorization
    """
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        # ── 1. Verificar sessão Flask (mais rápido, sem validação JWT) ────────
        if session.get("usuario_email"):
            g.usuario = {
                "email": session["usuario_email"],
                "nome":  session.get("usuario_nome", session["usuario_email"]),
                "oid":   session.get("usuario_oid", ""),
            }
            return f(*args, **kwargs)

        # ── 2. Validar JWT e criar sessão ─────────────────────────────────────
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"erro": "Token de autenticação ausente"}), 401

        token = auth_header[7:]
        try:
            payload = _decode_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({"erro": "Token expirado — faça login novamente"}), 401
        except (jwt.InvalidTokenError, ValueError) as e:
            log.warning("Token inválido: %s", e)
            return jsonify({"erro": "Token inválido"}), 401

        email = payload.get("preferred_username", payload.get("email", ""))
        if DOMINIO and not email.endswith(f"@{DOMINIO}"):
            return jsonify({"erro": "Acesso restrito a usuários da Empresa Exemplo"}), 403

        # Salvar na sessão Flask para próximas requisições
        session.permanent = True
        session["usuario_email"] = email
        session["usuario_nome"]  = payload.get("name", email)
        session["usuario_oid"]   = payload.get("oid", "")

        g.usuario = {
            "email": email,
            "nome":  payload.get("name", email),
            "oid":   payload.get("oid", ""),
        }
        return f(*args, **kwargs)

    return decorated


def usuario_atual() -> dict:
    return getattr(g, "usuario", {"email": "dev@local", "nome": "Dev Local", "oid": ""})
