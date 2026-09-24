"""
gunicorn.conf.py — Configuração do servidor WSGI
SESMT Empresa Exemplo

IMPORTANTE: O pool de conexões psycopg2 NÃO pode ser inicializado antes do fork
dos workers. Conexões compartilhadas entre processos forked causam comportamento
indefinido (queries misturadas, deadlocks silenciosos).
A solução é inicializar o pool no hook post_fork, executado em cada worker
APÓS o fork, garantindo que cada worker tem seu próprio pool independente.
"""

import os

workers     = int(os.environ.get("GUNICORN_WORKERS", "2"))
timeout     = int(os.environ.get("GUNICORN_TIMEOUT", "120"))
bind        = f"0.0.0.0:{os.environ.get('PORT', '10000')}"
worker_class = "sync"
loglevel    = "info"
accesslog   = "-"
errorlog    = "-"

# Formato de log com request ID para correlacionar logs de requests paralelas
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" rid=%({X-Request-ID}i)s'


def post_fork(server, worker):
    """
    Executado em cada worker após o fork.
    Inicializa o pool de conexões AQUI — não no módulo principal.
    """
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
    import database
    database.init_pool(minconn=2, maxconn=10)
    server.log.info("Worker %s: pool de conexões inicializado", worker.pid)


def worker_exit(server, worker):
    """Fecha o pool ao encerrar um worker para liberar conexões limpamente."""
    try:
        import database
        if database._pool:
            database._pool.closeall()
            server.log.info("Worker %s: pool fechado", worker.pid)
    except Exception:
        pass
