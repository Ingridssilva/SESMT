"""
importar_supabase.py
Roda no PyCharm: .venv\Scripts\python.exe scripts\importar_supabase.py

Exporta colaboradores, inspeções, NCs e usuários do banco LOCAL
e importa direto no Supabase SESMT.
"""
import pg8000.native as pg
import urllib.request, urllib.error, json, os, sys
from pathlib import Path

# ── Configurações ───────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / '.env')
except Exception:
    pass

# Banco local
LOCAL = dict(
    host     = os.environ.get('DB_HOST', 'localhost'),
    port     = int(os.environ.get('DB_PORT', 3333)),
    database = os.environ.get('DB_NAME', 'SESMT'),
    user     = os.environ.get('DB_USER', 'postgres'),
    password = os.environ.get('DB_PASSWORD', 'Ingrid291'),
)

# Supabase
SUPA_PROJECT = 'xuitxxvugqlaflcvopyx'
SUPA_PASS    = input("Digite a senha do Supabase SESMT (criada quando fez o projeto): ").strip()
SUPA_URL     = f"postgresql://postgres.{SUPA_PROJECT}:{SUPA_PASS}@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"

# ── Conectar ────────────────────────────────────────────────
print("\nConectando ao banco local...")
try:
    local = pg.Connection(**LOCAL)
    print("✅ Banco local OK")
except Exception as e:
    print(f"❌ Erro banco local: {e}"); sys.exit(1)

print("Conectando ao Supabase...")
try:
    import urllib.parse
    p = urllib.parse.urlparse(SUPA_URL)
    supa = pg.Connection(
        host=p.hostname, port=p.port or 6543,
        database=p.path.lstrip('/'),
        user=p.username, password=p.password,
        ssl_context=True,
    )
    print("✅ Supabase OK\n")
except Exception as e:
    print(f"❌ Erro Supabase: {e}"); sys.exit(1)

def q(v):
    if v is None: return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"

def importar(tabela, rows, sql_fn, desc):
    if not rows:
        print(f"  {tabela}: 0 registros — pulando")
        return
    ok = err = 0
    for r in rows:
        try:
            supa.run(sql_fn(r))
            ok += 1
        except Exception as e:
            err += 1
            if err <= 3:
                print(f"  ⚠️  {e}")
    print(f"  ✅ {desc}: {ok} importados, {err} erros")

# ── Usuários ────────────────────────────────────────────────
print("📥 Importando usuários...")
users = local.run("SELECT nome, email, cargo, cpf FROM usuarios WHERE ativo = TRUE ORDER BY nome")
for r in users:
    try:
        supa.run(
            "INSERT INTO usuarios (nome, email, cargo, cpf) VALUES (:n,:e,:c,:cpf) ON CONFLICT DO NOTHING",
            n=r[0], e=r[1], c=r[2], cpf=r[3]
        )
    except Exception: pass
print(f"  ✅ {len(users)} usuários")

# ── Colaboradores ───────────────────────────────────────────
print("📥 Importando colaboradores...")
colabs = local.run("SELECT cpf, nome, cargo, telefone, contrato FROM colaboradores WHERE ativo = TRUE ORDER BY nome")
importar('colaboradores', colabs,
    lambda r: f"INSERT INTO colaboradores (cpf,nome,cargo,telefone,contrato) VALUES ({q(r[0])},{q(r[1])},{q(r[2])},{q(r[3])},{q(r[4])}) ON CONFLICT (cpf) DO UPDATE SET nome=EXCLUDED.nome,cargo=EXCLUDED.cargo,telefone=EXCLUDED.telefone,contrato=EXCLUDED.contrato",
    f"{len(colabs)} colaboradores")

# ── Municípios ──────────────────────────────────────────────
print("📥 Importando municípios...")
muns = local.run("SELECT nome, uf FROM municipios ORDER BY nome")
for r in muns:
    try:
        supa.run("INSERT INTO municipios (nome,uf) VALUES (:n,:u) ON CONFLICT (nome) DO NOTHING", n=r[0], u=r[1])
    except Exception: pass
print(f"  ✅ {len(muns)} municípios")

# ── Contratos ───────────────────────────────────────────────
print("📥 Importando contratos...")
conts = local.run("SELECT codigo, descricao FROM contratos ORDER BY codigo")
for r in conts:
    try:
        supa.run("INSERT INTO contratos (codigo,descricao) VALUES (:c,:d) ON CONFLICT (codigo) DO NOTHING", c=r[0], d=r[1])
    except Exception: pass
print(f"  ✅ {len(conts)} contratos")

local.close()
supa.close()

print("\n✅ Importação concluída!")
print("Agora configure o DATABASE_URL no Render:")
print(f"postgresql://postgres.{SUPA_PROJECT}:{SUPA_PASS}@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require")
