"""app.py — SESMT Empresa Exemplo"""

import os
import sys
import uuid
import logging
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from dotenv import load_dotenv
    _ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(_ROOT, ".env"))
except ImportError:
    pass

from flask import Flask, send_from_directory, jsonify, session as flask_session, g, request as _req

from flask_cors import CORS

import database
from auth import requer_auth
from routes.dashboard   import bp as bp_dashboard
from routes.inspecoes   import bp as bp_inspecoes
from routes.ncs         import bp as bp_ncs
from routes.indicadores import bp as bp_indicadores
from routes.misc        import bp as bp_misc
from routes.checklists  import bp as bp_checklists
from routes.sync        import bp as bp_sync

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s rid=%(request_id)s: %(message)s",
)

# Filtro para injetar request_id em todos os logs
class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = getattr(g, "request_id", "-") if g else "-"
        return True

for handler in logging.root.handlers:
    handler.addFilter(RequestIdFilter())

log = logging.getLogger("sesmt")

app = Flask(
    __name__,
    static_folder=os.path.join(os.path.dirname(__file__), "..", "frontend"),
    static_url_path="",
)

# ── Sessão Flask ───────────────────────────────────────────────────────────────
_secret = os.environ.get("FLASK_SECRET_KEY", "")
if not _secret:
    # CRÍTICO: sem FLASK_SECRET_KEY fixa, cada restart/deploy gera uma chave nova.
    # Resultado: todos os usuários são deslogados a cada deploy.
    # Solução: no painel do Render → Environment → Add Variable:
    #   Key:   FLASK_SECRET_KEY
    #   Value: (clique em "Generate" para gerar um valor seguro)
    log.critical(
        "FLASK_SECRET_KEY não definida! "
        "Sessões serão invalidadas a cada restart/deploy. "
        "Adicione a variável no painel do Render com 'Generate Value'."
    )
    _secret = os.urandom(32).hex()

app.secret_key = _secret
app.config["SESSION_COOKIE_HTTPONLY"]    = True
app.config["SESSION_COOKIE_SAMESITE"]   = "Lax"
app.config["SESSION_COOKIE_SECURE"]     = os.environ.get("RENDER", "") != ""
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=8)

# ── CORS restrito ──────────────────────────────────────────────────────────────
_allowed_origins = [o.strip() for o in os.environ.get(
    "CORS_ORIGINS", "https://seu-app.onrender.com"
).split(",") if o.strip()]

CORS(app, origins=_allowed_origins, supports_credentials=True)

# ── Pool inicializado pelo gunicorn.conf.py (post_fork).
#    Em desenvolvimento local (flask run / python app.py), inicializa aqui.
if os.environ.get("RENDER", "") == "" and database._pool is None:
    database.init_pool(minconn=1, maxconn=5)
    log.info("Pool inicializado no modo desenvolvimento")

log.info("Aplicação SESMT iniciada. CORS: %s", _allowed_origins)

# ── Blueprints ────────────────────────────────────────────────────────────────
app.register_blueprint(bp_dashboard)
app.register_blueprint(bp_inspecoes)
app.register_blueprint(bp_ncs)
app.register_blueprint(bp_indicadores)
app.register_blueprint(bp_misc)
app.register_blueprint(bp_checklists)
app.register_blueprint(bp_sync)

# ── Request ID — correlaciona logs de requests paralelas ──────────────────────
@app.before_request
def _set_request_id():
    rid = _req.headers.get("X-Request-ID") or str(uuid.uuid4())[:8]
    g.request_id = rid

@app.after_request
def _add_security_headers(response):
    """Headers de segurança HTTP."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"]        = "DENY"
    response.headers["Referrer-Policy"]         = "strict-origin-when-cross-origin"
    response.headers["X-Request-ID"]            = getattr(g, "request_id", "-")
    # CSP:
    # - cdn.jsdelivr.net  → MSAL (@azure/msal-browser) — script + fetch interno do MSAL
    # - login.microsoftonline.com → redirect OAuth Azure AD
    # - wss://*.supabase.co → Supabase realtime
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline'; "
        "connect-src 'self' "
            "https://cdn.jsdelivr.net "
            "wss://*.supabase.co https://*.supabase.co "
            "https://login.microsoftonline.com "
            "https://graph.microsoft.com; "
        "img-src 'self' data: blob:; "
        "font-src 'self' data:; "
        "frame-src https://login.microsoftonline.com;"
    )
    return response

# ── Healthcheck — verifica conexão real com o banco ───────────────────────────
@app.get("/health")
def health():
    try:
        database.db_fetchone("SELECT 1 AS ok")
        return jsonify({"ok": True, "db": "up"})
    except Exception as e:
        log.error("Health check falhou: %s", e)
        return jsonify({"ok": False, "db": "down", "erro": str(e)}), 503

# ── Logout ────────────────────────────────────────────────────────────────────
@app.post("/api/logout")
def logout():
    flask_session.clear()
    return jsonify({"ok": True})

# ── Handlers de erro global ───────────────────────────────────────────────────
@app.errorhandler(Exception)
def handle_exception(e):
    # Erro de pool esgotado → 503
    if "Pool de conexões esgotado" in str(e):
        return jsonify({"erro": "Serviço temporariamente sobrecarregado. Tente novamente."}), 503
    log.exception("Erro não tratado: %s", e)
    return jsonify({"erro": "Erro interno do servidor"}), 500

@app.errorhandler(404)
def not_found(e):
    from flask import request as _r
    if _r.path.startswith("/api/"):
        return jsonify({"erro": "Recurso não encontrado"}), 404
    return send_from_directory(app.static_folder, "index.html")

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"erro": "Método não permitido"}), 405

# ── Frontend SPA ──────────────────────────────────────────────────────────────
@app.get("/")
@app.get("/<path:path>")
def spa(path=""):
    static = app.static_folder
    if path and os.path.exists(os.path.join(static, path)):
        resp = send_from_directory(static, path)
        if path.endswith((".css", ".js")) and not path.endswith("chart.umd.js"):
            resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            resp.headers["Pragma"]        = "no-cache"
            resp.headers["Expires"]       = "0"
        return resp
    resp = send_from_directory(static, "index.html")
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"]        = "no-cache"
    resp.headers["Expires"]       = "0"
    return resp

# ── Rota de emergência para limpar SW e caches do browser ────────────────────
@app.get("/clear-cache")
@requer_auth
def clear_cache():
    html = """<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Limpando cache...</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
min-height:100vh;margin:0;background:#F2F5FB;flex-direction:column;gap:16px;text-align:center}
.msg{font-size:18px;font-weight:700;color:#1C1E26}.sub{font-size:13px;color:#8890A8;max-width:300px}
.spinner{width:36px;height:36px;border:3px solid #eee;border-top-color:#F7931E;
border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<div class="spinner"></div>
<div class="msg">Limpando cache...</div>
<div class="sub" id="st">Removendo Service Workers e caches antigos</div>
<script>
(async()=>{
const el=document.getElementById('st');
let ok=[];
if('serviceWorker'in navigator){
  const rs=await navigator.serviceWorker.getRegistrations();
  for(const r of rs){await r.unregister();ok.push('SW removido');}
}
if('caches'in window){
  const ks=await caches.keys();
  for(const k of ks){await caches.delete(k);ok.push('Cache removido: '+k);}
}
try{localStorage.clear();}catch(e){}
try{sessionStorage.clear();}catch(e){}
el.textContent=ok.length?ok.join(' | '):'Pronto!';
setTimeout(()=>{window.location.replace('/?nocache='+Date.now());},1800);
})();
</script></body></html>"""
    from flask import Response
    resp = Response(html, mimetype='text/html')
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"]        = "no-cache"
    return resp

if __name__ == "__main__":
    app.run(debug=True, port=5001)
