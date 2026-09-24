"""routes/checklists.py — Checklists, fotos, assinaturas, sync offline, PDF, admin."""

import json
import io
import csv
import base64
import threading
from datetime import date, datetime
from flask import Blueprint, request, Response
from database import db_fetch, db_fetchone, db_exec, db_returning, get_conn
from helpers import ok, err
from auth import requer_auth, usuario_atual

bp = Blueprint("checklists", __name__)

try:
    from sharepoint import sp, gerar_pdf_checklist
except ImportError:
    try:
        from backend.sharepoint import sp, gerar_pdf_checklist
    except ImportError:
        sp = None
        gerar_pdf_checklist = None


# ── Modelos ───────────────────────────────────────────────────────────────────

@bp.get("/api/checklists/modelos")
@requer_auth
def checklist_modelos():
    tipo   = request.args.get("tipo")
    params = []
    where  = "ativo = TRUE"
    if tipo:
        where += " AND (tipo = %s OR tipo = 'ambos')"
        params.append(tipo)
    rows = db_fetch(f"SELECT * FROM checklist_modelos WHERE {where} ORDER BY codigo", params)
    for r in rows:
        if isinstance(r.get("tipo_situacao"), str):
            r["tipo_situacao"] = json.loads(r["tipo_situacao"])
    return ok(rows)


@bp.get("/api/checklists/modelo/<int:mid>")
@requer_auth
def checklist_modelo_estrutura(mid):
    modelo = db_fetchone("SELECT * FROM checklist_modelos WHERE id = %s", (mid,))
    if not modelo:
        return err("Modelo não encontrado", 404)
    if isinstance(modelo.get("tipo_situacao"), str):
        modelo["tipo_situacao"] = json.loads(modelo["tipo_situacao"])
    secoes = db_fetch(
        "SELECT * FROM checklist_secoes WHERE modelo_id = %s ORDER BY ordem", (mid,)
    )
    for s in secoes:
        s["itens"] = db_fetch(
            "SELECT * FROM checklist_itens WHERE secao_id = %s ORDER BY ordem", (s["id"],)
        )
    modelo["secoes"] = secoes
    return ok(modelo)


@bp.get("/api/checklists/modelos/<int:mid>/itens")
@requer_auth
def checklist_modelo_itens_flat(mid):
    """
    Retorna lista flat de todos os itens do modelo com secao_titulo incluído.
    Usado pelo módulo de lançamento mobile (checklist-lancamento.js).
    """
    modelo = db_fetchone(
        "SELECT id, tipo_situacao FROM checklist_modelos WHERE id = %s", (mid,)
    )
    if not modelo:
        return err("Modelo não encontrado", 404)

    rows = db_fetch("""
        SELECT
            i.id,
            i.descricao,
            i.tem_quant,
            i.ordem AS item_ordem,
            s.id    AS secao_id,
            s.titulo AS secao_titulo,
            s.ordem  AS secao_ordem
        FROM checklist_itens i
        JOIN checklist_secoes s ON s.id = i.secao_id
        WHERE s.modelo_id = %s
        ORDER BY s.ordem, i.ordem
    """, (mid,))
    return ok(rows)


# ── Preenchimentos ────────────────────────────────────────────────────────────

@bp.get("/api/checklists/preenchimentos")
@requer_auth
def listar_preenchimentos():
    filtros = request.args
    where, params = ["1=1"], []
    if filtros.get("inspecao_id"):
        where.append("cp.inspecao_id = %s"); params.append(int(filtros["inspecao_id"]))
    if filtros.get("lideranca_id"):
        where.append("cp.lideranca_id = %s"); params.append(int(filtros["lideranca_id"]))

    rows = db_fetch(f"""
        SELECT cp.*, cm.titulo AS modelo_titulo, cm.codigo AS modelo_codigo,
               u.nome AS preenchido_por_nome,
               COUNT(cr.id) FILTER (WHERE cr.situacao IN ('RUIM','NÃO CONFORME')) AS qty_nao_conformes
        FROM checklist_preenchimentos cp
        JOIN checklist_modelos cm ON cm.id = cp.modelo_id
        LEFT JOIN usuarios u ON u.id = cp.preenchido_por
        LEFT JOIN checklist_respostas cr ON cr.preenchimento_id = cp.id
        WHERE {' AND '.join(where)}
        GROUP BY cp.id, cm.titulo, cm.codigo, u.nome
        ORDER BY cp.created_at DESC
    """, params)
    return ok(rows)


@bp.get("/api/checklists/preenchimento/<int:pid>")
@requer_auth
def obter_preenchimento(pid):
    prench = db_fetchone("""
        SELECT cp.*, cm.titulo AS modelo_titulo, cm.codigo AS modelo_codigo, cm.tipo_situacao
        FROM checklist_preenchimentos cp
        JOIN checklist_modelos cm ON cm.id = cp.modelo_id
        WHERE cp.id = %s
    """, (pid,))
    if not prench:
        return err("Não encontrado", 404)
    if isinstance(prench.get("tipo_situacao"), str):
        prench["tipo_situacao"] = json.loads(prench["tipo_situacao"])
    prench["respostas"] = db_fetch("""
        SELECT cr.*, ci.descricao AS item_descricao, ci.tem_quant, cs.titulo AS secao_titulo
        FROM checklist_respostas cr
        JOIN checklist_itens ci ON ci.id = cr.item_id
        JOIN checklist_secoes cs ON cs.id = ci.secao_id
        WHERE cr.preenchimento_id = %s
        ORDER BY cs.ordem, ci.ordem
    """, (pid,))
    return ok(prench)


def _upsert_fotos_respostas(conn, pid: int, respostas: list):
    """
    Processa fotos base64 embutidas nas respostas do payload de lançamento mobile.
    Cada item pode ter uma lista de fotos em base64 — salva no SharePoint em background
    e atualiza checklist_respostas.foto_url com a URL final.
    Silencioso: erros são logados mas não interrompem o fluxo principal.
    """
    import logging
    log = logging.getLogger(__name__)

    for r in respostas:
        fotos = r.get("fotos") or []
        if not fotos:
            continue
        item_id = int(r["item_id"])

        def _upload_fotos_item(pid=pid, item_id=item_id, fotos=fotos):
            try:
                if not sp:
                    return
                prench = db_fetchone("""
                    SELECT cp.*, cm.codigo AS modelo_codigo,
                           i.codigo AS insp_codigo, i.data_inspecao AS insp_data,
                           l.codigo AS lid_codigo,  l.data_inspecao AS lid_data
                    FROM checklist_preenchimentos cp
                    JOIN checklist_modelos cm ON cm.id = cp.modelo_id
                    LEFT JOIN inspecoes i ON i.id = cp.inspecao_id
                    LEFT JOIN inspecoes_lideranca l ON l.id = cp.lideranca_id
                    WHERE cp.id = %s
                """, (pid,))
                if not prench:
                    return

                aba     = "Campo" if prench.get("inspecao_id") else "Lideranca"
                data_ev = prench.get("insp_data") or prench.get("lid_data") or date.today()
                cod_insp = prench.get("insp_codigo") or prench.get("lid_codigo") or f"CK{pid}"

                cab = prench.get("cabecalho") or {}
                if isinstance(cab, str):
                    try: cab = json.loads(cab)
                    except: cab = {}

                nome_col = _identificar_nome({
                    "nome_avaliado": prench.get("nome_avaliado"),
                    "cabecalho":     cab,
                })
                subpasta = f"fotos/{prench['modelo_codigo']}_{nome_col}"
                urls = []

                for idx, b64 in enumerate(fotos):
                    try:
                        raw = base64.b64decode(
                            b64.split(",", 1)[-1] if "," in b64 else b64
                        )
                        nome_arq = f"item{item_id}_foto{idx+1}.jpg"
                        result = sp.upload_foto(raw, nome_arq, subpasta, aba, data_ev, cod_insp)
                        if result:
                            urls.append(result["url"])
                    except Exception as e:
                        log.error("[FOTO] Erro upload item %s foto %s pid %s: %s", item_id, idx, pid, e)

                if urls:
                    # Salvar primeira URL no campo foto_url, demais como JSON extra
                    db_exec("""
                        UPDATE checklist_respostas
                        SET foto_url = %s
                        WHERE preenchimento_id = %s AND item_id = %s
                    """, (urls[0], pid, item_id))
            except Exception as e:
                log.error("[FOTO] Erro geral pid %s item %s: %s", pid, item_id, e)

        threading.Thread(target=_upload_fotos_item, daemon=True).start()


def _upsert_respostas(conn, pid: int, respostas: list):
    with conn.cursor() as cur:
        for r in respostas:
            cur.execute("""
                INSERT INTO checklist_respostas
                    (preenchimento_id, item_id, situacao, quantidade, observacao)
                VALUES (%s,%s,%s,%s,%s)
                ON CONFLICT (preenchimento_id, item_id)
                DO UPDATE SET situacao=EXCLUDED.situacao,
                              quantidade=EXCLUDED.quantidade,
                              observacao=EXCLUDED.observacao
            """, (pid, int(r["item_id"]), r.get("situacao"),
                  r.get("quantidade"), r.get("observacao")))


@bp.post("/api/checklists/preenchimentos")
@requer_auth
def criar_preenchimento():
    d = request.json or {}
    if not d.get("modelo_id"):
        return err("modelo_id obrigatorio")

    # preenchido_por: preferir o da sessão para garantir rastreabilidade
    preenchido_por = d.get("preenchido_por")
    if not preenchido_por:
        u = usuario_atual()
        row_u = db_fetchone("SELECT id FROM usuarios WHERE email = %s LIMIT 1", (u["email"],))
        preenchido_por = row_u["id"] if row_u else None

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO checklist_preenchimentos
                    (inspecao_id, lideranca_id, modelo_id, cabecalho,
                     resultado_geral, observacoes_extras, preenchido_por,
                     cpf_avaliado, nome_avaliado, cargo_avaliado,
                     telefone_colaborador, local_id, sync_status)
                VALUES (%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,%s,%s,%s,'synced')
                RETURNING id
            """, (
                d.get("inspecao_id"), d.get("lideranca_id"), int(d["modelo_id"]),
                json.dumps(d.get("cabecalho") or {}),
                d.get("resultado_geral"), d.get("observacoes_extras"), preenchido_por,
                d.get("cpf_avaliado"), d.get("nome_avaliado"), d.get("cargo_avaliado"),
                d.get("telefone_colaborador"), d.get("local_id"),
            ))
            pid = cur.fetchone()["id"]
        _upsert_respostas(conn, pid, d.get("respostas", []))
        _upsert_fotos_respostas(conn, pid, d.get("respostas", []))

    # Marcar pdf_status como pendente antes de disparar a thread.
    db_exec("UPDATE checklist_preenchimentos SET pdf_status='pendente' WHERE id=%s", (pid,))
    threading.Thread(target=_gerar_e_subir_pdf, args=(pid,), daemon=True).start()

    # Notificação por email se houver itens não conformes
    resultado = d.get("resultado_geral") or d.get("resultado")
    respostas_payload = d.get("respostas", [])
    nao_conformes = [r for r in respostas_payload
                     if r.get("situacao") in ("NÃO CONFORME", "RUIM", "NAO CONFORME")]
    if nao_conformes:
        threading.Thread(
            target=_notificar_nc_checklist,
            args=(pid, d.get("modelo_id"), resultado, nao_conformes, d.get("cabecalho", {})),
            daemon=True
        ).start()

    return ok({"id": pid}, 201)


@bp.put("/api/checklists/preenchimento/<int:pid>")
@requer_auth
def atualizar_preenchimento(pid):
    d = request.json or {}
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE checklist_preenchimentos SET
                    resultado_geral=%s, observacoes_extras=%s, cabecalho=%s::jsonb,
                    cpf_avaliado=%s, nome_avaliado=%s, cargo_avaliado=%s,
                    telefone_colaborador=%s, updated_at=NOW()
                WHERE id=%s
            """, (
                d.get("resultado_geral"), d.get("observacoes_extras"),
                json.dumps(d.get("cabecalho") or {}),
                d.get("cpf_avaliado"), d.get("nome_avaliado"), d.get("cargo_avaliado"),
                d.get("telefone_colaborador"), pid,
            ))
        _upsert_respostas(conn, pid, d.get("respostas", []))
        _upsert_fotos_respostas(conn, pid, d.get("respostas", []))

    db_exec("UPDATE checklist_preenchimentos SET pdf_status='pendente' WHERE id=%s", (pid,))
    threading.Thread(target=_gerar_e_subir_pdf, args=(pid,), daemon=True).start()
    return ok({"ok": True})


@bp.delete("/api/checklists/preenchimento/<int:pid>")
@requer_auth
def deletar_preenchimento(pid):
    # Registrar URL do PDF antes de deletar (para auditoria/cleanup manual se necessário)
    prench = db_fetchone("SELECT pdf_url FROM checklist_preenchimentos WHERE id = %s", (pid,))
    if prench and prench.get("pdf_url"):
        import logging
        logging.getLogger(__name__).info(
            "[DELETE] Preenchimento %s removido — PDF orphan no SharePoint: %s",
            pid, prench["pdf_url"]
        )
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM checklist_respostas WHERE preenchimento_id = %s", (pid,))
            cur.execute("DELETE FROM checklist_preenchimentos WHERE id = %s", (pid,))
    return ok({"ok": True})


# ── Fotos ─────────────────────────────────────────────────────────────────────

@bp.post("/api/checklists/foto")
@requer_auth
def upload_foto_nc():
    d = request.json or {}
    for f in ["preenchimento_id", "item_id", "filename", "base64"]:
        if not d.get(f):
            return err(f"Campo obrigatorio: {f}")
    try:
        content = base64.b64decode(d["base64"])
    except Exception:
        return err("base64 invalido")

    prench = db_fetchone("""
        SELECT cp.*, cm.codigo AS modelo_codigo,
               i.codigo AS insp_codigo, i.data_inspecao AS insp_data,
               l.codigo AS lid_codigo,  l.data_inspecao AS lid_data
        FROM checklist_preenchimentos cp
        JOIN checklist_modelos cm ON cm.id = cp.modelo_id
        LEFT JOIN inspecoes i ON i.id = cp.inspecao_id
        LEFT JOIN inspecoes_lideranca l ON l.id = cp.lideranca_id
        WHERE cp.id = %s
    """, (int(d["preenchimento_id"]),))
    if not prench:
        return err("Preenchimento nao encontrado", 404)

    aba      = "Campo" if prench.get("inspecao_id") else "Lideranca"
    data_ev  = prench.get("insp_data") or prench.get("lid_data") or date.today()
    cod_insp = prench.get("insp_codigo") or prench.get("lid_codigo") or "SEM_CODIGO"

    cab_prench = prench.get("cabecalho") or {}
    if isinstance(cab_prench, str):
        try:
            cab_prench = json.loads(cab_prench)
        except Exception:
            cab_prench = {}

    nome_colaborador = _identificar_nome({
        "nome_avaliado": prench.get("nome_avaliado"),
        "cabecalho":     cab_prench,
    })
    ext_original = d["filename"].rsplit(".", 1)[-1].lower() if "." in d["filename"] else "jpg"
    nome_arq     = f"item{d['item_id']}.{ext_original}"
    subpasta_foto = f"fotos/{prench['modelo_codigo']}_{nome_colaborador}"

    # Upload da foto em background
    preenchimento_id = int(d["preenchimento_id"])
    item_id          = int(d["item_id"])

    def _upload_foto():
        foto_url = foto_spid = None
        if sp:
            result    = sp.upload_foto(content, nome_arq, subpasta_foto, aba, data_ev, cod_insp)
            foto_url  = result["url"]     if result else None
            foto_spid = result["item_id"] if result else None
        db_exec("""
            UPDATE checklist_respostas
            SET foto_url = %s, foto_sharepoint_id = %s
            WHERE preenchimento_id = %s AND item_id = %s
        """, (foto_url, foto_spid, preenchimento_id, item_id))

    threading.Thread(target=_upload_foto, daemon=True).start()

    return ok({"ok": True, "sharepoint": "pendente"})


def _notificar_nc_checklist(pid: int, modelo_id, resultado: str, nao_conformes: list, cabecalho: dict):
    """
    Envia email ao SESMT quando um checklist lançado contém itens não conformes.
    Usa Microsoft Graph API com Client Credentials (mesmo fluxo do SharePoint).
    Variável necessária: SESMT_EMAIL_NOTIF (destinatário, ex: sesmt@empresaexemplo.com.br)
    """
    import os, logging
    log  = logging.getLogger(__name__)
    dest = os.environ.get("SESMT_EMAIL_NOTIF", "")
    if not dest:
        log.info("[EMAIL] SESMT_EMAIL_NOTIF não definida — notificação ignorada")
        return
    if not sp:
        return

    try:
        # Buscar descrições dos itens não conformes
        item_ids = [int(r["item_id"]) for r in nao_conformes if r.get("item_id")]
        itens_db = {}
        if item_ids:
            from database import db_fetch
            rows = db_fetch(
                f"SELECT id, descricao FROM checklist_itens WHERE id = ANY(%s)",
                (item_ids,)
            )
            itens_db = {r["id"]: r["descricao"] for r in rows}

        # Buscar modelo
        modelo = db_fetchone("SELECT titulo, codigo FROM checklist_modelos WHERE id = %s", (modelo_id,))
        modelo_nome = modelo["titulo"] if modelo else f"Modelo {modelo_id}"

        # Montar corpo do email
        cab = cabecalho if isinstance(cabecalho, dict) else {}
        nome_colab = (cab.get("colaborador_nome") or cab.get("nome_avaliado") or
                      cab.get("responsavel_maquina") or "—")
        equipe  = cab.get("equipe", "—")
        local   = cab.get("local", cab.get("local_descricao", "—"))
        data_ck = cab.get("data", str(date.today()))

        linhas_nc = "".join(
            f"<li style='margin-bottom:6px'><b>{itens_db.get(int(r.get('item_id',0)), r.get('item_id','?'))}</b>"
            f" — {r.get('situacao','')}"
            f"{': ' + r['obs'] if r.get('obs') else ''}</li>"
            for r in nao_conformes
        )

        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#E8500A;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0;font-size:18px">⚠️ Checklist com Não Conformidades</h2>
            <p style="margin:4px 0 0;font-size:13px;opacity:.9">{modelo_nome}</p>
          </div>
          <div style="background:#fff;border:1px solid #eee;border-top:none;padding:20px;border-radius:0 0 8px 8px">
            <table style="width:100%;font-size:13px;margin-bottom:16px">
              <tr><td style="color:#888;padding:4px 0">Colaborador/Responsável</td>
                  <td style="font-weight:700">{nome_colab}</td></tr>
              <tr><td style="color:#888;padding:4px 0">Equipe</td>
                  <td>{equipe}</td></tr>
              <tr><td style="color:#888;padding:4px 0">Local</td>
                  <td>{local}</td></tr>
              <tr><td style="color:#888;padding:4px 0">Data</td>
                  <td>{data_ck}</td></tr>
              <tr><td style="color:#888;padding:4px 0">Resultado</td>
                  <td style="color:#C0392B;font-weight:700">{resultado}</td></tr>
            </table>
            <div style="background:#FFF0E8;border-left:4px solid #E8500A;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:16px">
              <p style="margin:0 0 8px;font-weight:700;color:#E8500A">{len(nao_conformes)} item(s) não conforme(s):</p>
              <ul style="margin:0;padding-left:18px;font-size:13px;color:#333">{linhas_nc}</ul>
            </div>
            <a href="https://seu-app.onrender.com/#checklists"
               style="display:inline-block;background:#E8500A;color:white;padding:10px 20px;
                      border-radius:6px;text-decoration:none;font-weight:700;font-size:13px">
              Ver no SESMT →
            </a>
          </div>
          <p style="font-size:11px;color:#999;margin-top:12px;text-align:center">
            SESMT Empresa Exemplo · Checklist #{pid}
          </p>
        </div>"""

        sp._req("POST", f"/users/{dest}/sendMail", {
            "message": {
                "subject": f"[SESMT] Checklist com NCs — {modelo_nome} — {nome_colab}",
                "body": {"contentType": "HTML", "content": html},
                "toRecipients": [{"emailAddress": {"address": dest}}],
                "ccRecipients": [],
            },
            "saveToSentItems": False,
        })
        log.info("[EMAIL] Notificação NC enviada para %s (pid=%s, %s NCs)", dest, pid, len(nao_conformes))
    except Exception as e:
        log.error("[EMAIL] Falha ao enviar notificação NC (pid=%s): %s", pid, e)


# ── PDF ───────────────────────────────────────────────────────────────────────

@bp.get("/api/checklists/preenchimento/<int:pid>/pdf")
@requer_auth
def baixar_pdf(pid):
    if not gerar_pdf_checklist:
        return err("Módulo de PDF não disponível", 503)
    dados = _montar_dados_pdf(pid)
    if not dados:
        return err("Preenchimento nao encontrado", 404)
    pdf_bytes = gerar_pdf_checklist(dados)
    nome_col  = _identificar_nome(dados)
    nome      = f"{dados.get('codigo_inspecao','checklist')}_{dados.get('modelo_codigo','')}_{nome_col}.pdf"
    return Response(pdf_bytes, mimetype="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{nome}"'})


# ── Assinaturas ───────────────────────────────────────────────────────────────

@bp.put("/api/checklists/preenchimento/<int:pid>/assinaturas")
@requer_auth
def salvar_assinaturas(pid):
    d = request.json or {}
    db_exec("""
        UPDATE checklist_preenchimentos SET
            assinatura_inspetor=%s, assinatura_avaliado=%s,
            cpf_avaliado=%s, nome_avaliado=%s, cargo_avaliado=%s, updated_at=NOW()
        WHERE id=%s
    """, (
        d.get("assinatura_inspetor"), d.get("assinatura_avaliado"),
        d.get("cpf_avaliado"), d.get("nome_avaliado"), d.get("cargo_avaliado"), pid,
    ))
    db_exec("UPDATE checklist_preenchimentos SET pdf_status='pendente' WHERE id=%s", (pid,))
    threading.Thread(target=_gerar_e_subir_pdf, args=(pid,), daemon=True).start()
    return ok({"ok": True})


# ── Busca por CPF ─────────────────────────────────────────────────────────────

@bp.get("/api/checklists/buscar-colaborador/<cpf>")
@requer_auth
def buscar_colaborador_cpf(cpf):
    limpo = "".join(c for c in cpf if c.isdigit())
    fmt   = f"{limpo[:3]}.{limpo[3:6]}.{limpo[6:9]}-{limpo[9:]}" if len(limpo) == 11 else limpo
    row   = db_fetchone("""
        SELECT id, nome, cargo, telefone FROM colaboradores
        WHERE cpf = %s OR cpf = %s LIMIT 1
    """, (fmt, limpo))
    return ok({"encontrado": True, **row} if row else {"encontrado": False})


# ── Sync offline ──────────────────────────────────────────────────────────────

@bp.post("/api/checklists/preenchimentos/sync")
@requer_auth
def sync_preenchimentos():
    lista = request.json or []
    if not isinstance(lista, list):
        lista = [lista]

    inseridos, erros = 0, []
    pids_para_pdf    = []

    for d in lista:
        try:
            local_id = d.get("local_id")
            if local_id:
                existente = db_fetchone(
                    "SELECT id FROM checklist_preenchimentos WHERE local_id = %s", (local_id,)
                )
                if existente:
                    continue

            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO checklist_preenchimentos
                            (inspecao_id, lideranca_id, modelo_id, cabecalho,
                             resultado_geral, observacoes_extras, preenchido_por,
                             cpf_avaliado, nome_avaliado, cargo_avaliado,
                             assinatura_inspetor, assinatura_avaliado,
                             local_id, sync_status)
                        VALUES (%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,%s,%s,%s,%s,'synced')
                        ON CONFLICT (local_id) DO NOTHING
                        RETURNING id
                    """, (
                        d.get("inspecao_id"), d.get("lideranca_id"), int(d["modelo_id"]),
                        json.dumps(d.get("cabecalho") or {}),
                        d.get("resultado_geral"), d.get("observacoes_extras"),
                        d.get("preenchido_por"), d.get("cpf_avaliado"),
                        d.get("nome_avaliado"), d.get("cargo_avaliado"),
                        d.get("assinatura_inspetor"), d.get("assinatura_avaliado"),
                        local_id,
                    ))
                    row = cur.fetchone()
                    if row:
                        pid = row["id"]
                        _upsert_respostas(conn, pid, d.get("respostas", []))
                        inseridos += 1
                        pids_para_pdf.append(pid)
        except Exception as e:
            erros.append(str(e))

    # PDFs em background após sync — marcar pendente antes de disparar
    for pid in pids_para_pdf:
        db_exec("UPDATE checklist_preenchimentos SET pdf_status='pendente' WHERE id=%s", (pid,))
        threading.Thread(target=_gerar_e_subir_pdf, args=(pid,), daemon=True).start()

    return ok({"inseridos": inseridos, "erros": len(erros), "detalhes": erros})


@bp.get("/api/checklists/preenchimento/<int:pid>/historico")
@requer_auth
def historico_preenchimento(pid):
    rows = db_fetch(
        "SELECT * FROM checklist_historico WHERE preenchimento_id = %s ORDER BY created_at DESC",
        (pid,)
    )
    return ok(rows)


# ── Export CSV com cursor em lote (não carrega tudo na memória) ───────────────

@bp.get("/api/exportar/checklists")
@requer_auth
def exportar_checklists():
    from database import db_fetch_cursor

    sql = """
        SELECT cp.id, cm.codigo AS modelo, cm.titulo AS checklist,
               cp.cpf_avaliado, cp.nome_avaliado, cp.cargo_avaliado,
               cp.resultado_geral, cp.observacoes_extras,
               u.nome AS inspetor, i.codigo AS inspecao, cp.created_at,
               COUNT(cr.id) FILTER (WHERE cr.situacao IN ('RUIM','NÃO CONFORME')) AS nao_conformes
        FROM checklist_preenchimentos cp
        JOIN checklist_modelos cm ON cm.id = cp.modelo_id
        LEFT JOIN usuarios u ON u.id = cp.preenchido_por
        LEFT JOIN inspecoes i ON i.id = cp.inspecao_id
        LEFT JOIN checklist_respostas cr ON cr.preenchimento_id = cp.id
        GROUP BY cp.id, cm.codigo, cm.titulo, u.nome, i.codigo
        ORDER BY cp.created_at DESC
    """
    fieldnames = [
        "id","modelo","checklist","cpf_avaliado","nome_avaliado","cargo_avaliado",
        "resultado_geral","nao_conformes","inspetor","inspecao","created_at","observacoes_extras",
    ]

    def _gerar():
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        yield output.getvalue()
        output.truncate(0); output.seek(0)
        for r in db_fetch_cursor(sql):
            for k, v in r.items():
                if isinstance(v, datetime):
                    r[k] = v.strftime("%d/%m/%Y %H:%M")
                elif isinstance(v, date):
                    r[k] = v.strftime("%d/%m/%Y")
                elif v is None:
                    r[k] = ""
            writer.writerow(r)
            yield output.getvalue()
            output.truncate(0); output.seek(0)

    return Response(
        _gerar(), mimetype="text/csv",
        headers={"Content-Disposition": 'attachment; filename="checklists.csv"'},
    )


# ── Webhook ZapSign ───────────────────────────────────────────────────────────

@bp.post("/api/zapsign/webhook")
def zapsign_webhook():
    """
    Recebe notificação do ZapSign quando todos assinam.
    Baixa o PDF certificado e substitui o original no SharePoint.
    """
    import os
    import logging
    log = logging.getLogger(__name__)

    # Validar token de segurança (header ou query param)
    token_esperado = os.environ.get("ZAPSIGN_TOKEN", "")
    token_recebido = (
        request.headers.get("X-ZapSign-Token", "")
        or request.args.get("token", "")
    )
    if token_esperado and token_recebido != token_esperado:
        return err("Não autorizado", 401)

    payload = request.json or {}
    status  = payload.get("status", "")
    doc_token = payload.get("token", "")

    log.info("[ZapSign] Webhook recebido: status=%s doc_token=%s", status, doc_token)

    # Só processa quando todos assinaram
    if status not in ("signed", "completed"):
        return ok({"ok": True, "msg": "ignorado"})

    # external_id foi enviado como preenchimento_id na criação
    external_id = payload.get("external_id", "")
    if not external_id:
        log.warning("[ZapSign] external_id ausente no webhook")
        return ok({"ok": True, "msg": "sem external_id"})

    def _processar():
        try:
            from zapsign import baixar_pdf_assinado
            pdf_bytes = baixar_pdf_assinado(doc_token)
            if not pdf_bytes:
                log.error("[ZapSign] Não foi possível baixar PDF assinado: %s", doc_token)
                return

            pid = int(external_id)
            dados = _montar_dados_pdf(pid)
            if not dados or not sp:
                return

            nome_col = _identificar_nome(dados)
            nome_pdf = (
                f"{dados['codigo_inspecao']}"
                f"_{dados['modelo_codigo']}"
                f"_{nome_col}_ASSINADO.pdf"
            )
            result = sp.upload(
                pdf_bytes, nome_pdf,
                dados["tipo_aba"], dados["data_inspecao"], dados["codigo_inspecao"],
            )
            if result:
                db_exec(
                    "UPDATE checklist_preenchimentos SET pdf_url=%s WHERE id=%s",
                    (result["url"], pid)
                )
                log.info("[ZapSign] PDF assinado salvo no SharePoint: %s", result["url"])
        except Exception as e:
            log.exception("[ZapSign] Erro ao processar webhook: %s", e)

    threading.Thread(target=_processar, daemon=True).start()
    return ok({"ok": True})


# ── Helpers internos ──────────────────────────────────────────────────────────

def _normalizar_nome(nome: str) -> str:
    import unicodedata
    sem_acento = ''.join(
        c for c in unicodedata.normalize('NFD', nome)
        if unicodedata.category(c) != 'Mn'
    )
    return ''.join(c if c.isalnum() else '_' for c in sem_acento.upper()).strip('_')


def _identificar_nome(dados: dict) -> str:
    """
    Determina o identificador para nome de arquivo:
    - Checklists de pessoa: usa nome_avaliado
    - Checklists de máquina/veículo: usa placa ou responsável do cabeçalho
    - Limita a 25 caracteres para não truncar no SharePoint
    """
    nome = (dados.get("nome_avaliado") or "").strip()
    if not nome:
        cab = dados.get("cabecalho") or {}
        if isinstance(cab, str):
            try:
                cab = json.loads(cab)
            except Exception:
                cab = {}
        for campo in ("responsavel_maquina", "responsavel_veiculo",
                      "responsavel", "motorista", "operador", "encarregado", "placa"):
            val = (cab.get(campo) or "").strip()
            if val:
                nome = val
                break
    if not nome:
        nome = "SEM_ID"
    return _normalizar_nome(nome)[:25].rstrip("_")


def _montar_dados_pdf(pid: int) -> dict | None:
    prench = db_fetchone("""
        SELECT cp.*, cm.titulo AS modelo_titulo, cm.codigo AS modelo_codigo,
               u.nome AS preenchido_por_nome,
               i.codigo AS insp_codigo, i.data_inspecao AS insp_data,
               l.codigo AS lid_codigo,  l.data_inspecao AS lid_data
        FROM checklist_preenchimentos cp
        JOIN checklist_modelos cm ON cm.id = cp.modelo_id
        LEFT JOIN usuarios u ON u.id = cp.preenchido_por
        LEFT JOIN inspecoes i ON i.id = cp.inspecao_id
        LEFT JOIN inspecoes_lideranca l ON l.id = cp.lideranca_id
        WHERE cp.id = %s
    """, (pid,))
    if not prench:
        return None

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
        """, (pid,))
    }

    secoes = []
    for s in secoes_raw:
        itens = db_fetch(
            "SELECT * FROM checklist_itens WHERE secao_id = %s ORDER BY ordem", (s["id"],)
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

    aba      = "Campo" if prench.get("inspecao_id") else "Lideranca"
    cod_insp = prench.get("insp_codigo") or prench.get("lid_codigo") or "sem_codigo"
    data_ins = prench.get("insp_data") or prench.get("lid_data")

    cab = prench.get("cabecalho") or {}
    if isinstance(cab, str):
        try:
            cab = json.loads(cab)
        except Exception:
            cab = {}

    nome_avaliado = (prench.get("nome_avaliado") or "").strip()
    if not nome_avaliado:
        for campo in ("responsavel_maquina", "responsavel_veiculo",
                      "responsavel", "motorista", "operador", "encarregado", "placa"):
            val = (cab.get(campo) or "").strip()
            if val:
                nome_avaliado = val
                break

    return {
        "codigo_inspecao":     cod_insp,
        "tipo_aba":            aba,
        "data_inspecao":       str(data_ins)[:10] if data_ins else "",
        "modelo_titulo":       prench.get("modelo_titulo", ""),
        "modelo_codigo":       prench.get("modelo_codigo", ""),
        "resultado_geral":     prench.get("resultado_geral", ""),
        "observacoes_extras":  prench.get("observacoes_extras", ""),
        "preenchido_por_nome": prench.get("preenchido_por_nome", ""),
        "nome_avaliado":       nome_avaliado,
        "cargo_avaliado":      prench.get("cargo_avaliado", ""),
        "cabecalho":           cab,
        "secoes":              secoes,
    }


def _gerar_e_subir_pdf(pid: int) -> None:
    """
    Gera o PDF do preenchimento e faz upload para o SharePoint.
    Deve ser chamado sempre em thread daemon separada.

    Rastreamento via coluna pdf_status:
      'pendente' -> definido antes de disparar a thread
      'ok'       -> upload concluido com sucesso
      'erro'     -> falha na geracao ou upload (detalhes no log)
    """
    import logging, traceback
    log = logging.getLogger(__name__)
    try:
        if not gerar_pdf_checklist:
            db_exec("UPDATE checklist_preenchimentos SET pdf_status='erro' WHERE id=%s", (pid,))
            return
        dados = _montar_dados_pdf(pid)
        if not dados:
            db_exec("UPDATE checklist_preenchimentos SET pdf_status='erro' WHERE id=%s", (pid,))
            return
        pdf_bytes = gerar_pdf_checklist(dados)

        cab = dados.get("cabecalho") or {}
        if isinstance(cab, str):
            try:
                cab = json.loads(cab)
            except Exception:
                cab = {}
        dados["cabecalho"] = cab

        nome_colaborador = _identificar_nome(dados)
        nome_pdf = (
            f"{dados['codigo_inspecao']}"
            f"_{dados['modelo_codigo']}"
            f"_{nome_colaborador}.pdf"
        )

        if sp:
            result = sp.upload(
                pdf_bytes, nome_pdf,
                dados["tipo_aba"], dados["data_inspecao"], dados["codigo_inspecao"],
            )
            if result:
                db_exec(
                    "UPDATE checklist_preenchimentos SET pdf_url=%s, pdf_status='ok' WHERE id=%s",
                    (result["url"], pid)
                )
                log.info("[SP] PDF enviado: %s", result["url"])
            else:
                db_exec("UPDATE checklist_preenchimentos SET pdf_status='erro' WHERE id=%s", (pid,))
                log.warning("[SP] Upload retornou vazio (pid=%s)", pid)
        else:
            db_exec("UPDATE checklist_preenchimentos SET pdf_status='erro' WHERE id=%s", (pid,))
    except Exception as e:
        log.error(
            "[PDF/SP] Erro ao gerar/subir PDF (pid=%s): %s\n%s",
            pid, e, traceback.format_exc()
        )
        try:
            db_exec("UPDATE checklist_preenchimentos SET pdf_status='erro' WHERE id=%s", (pid,))
        except Exception:
            pass


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — CRUD de Modelos, Seções e Itens
# ══════════════════════════════════════════════════════════════════════════════

@bp.post("/api/admin/checklists/modelos")
@requer_auth
def admin_criar_modelo():
    d = request.json or {}
    if not d.get("codigo") or not d.get("titulo"):
        return err("codigo e titulo são obrigatórios")
    if not d.get("tipo"):
        return err("tipo é obrigatório (campo | lideranca | ambos)")

    tipo_sit = d.get("tipo_situacao", ["BOM", "RUIM", "N/A"])
    if not isinstance(tipo_sit, list):
        tipo_sit = ["BOM", "RUIM", "N/A"]

    row = db_returning("""
        INSERT INTO checklist_modelos
            (codigo, titulo, descricao, tipo, tipo_situacao, ativo)
        VALUES (%s, %s, %s, %s, %s::jsonb, TRUE)
        RETURNING id, codigo, titulo, tipo, ativo
    """, (
        d["codigo"].strip(), d["titulo"].strip(),
        d.get("descricao", ""),
        d["tipo"],
        json.dumps(tipo_sit),
    ))
    return ok(row, 201)


@bp.put("/api/admin/checklists/modelos/<int:mid>")
@requer_auth
def admin_atualizar_modelo(mid):
    d = request.json or {}
    modelo = db_fetchone("SELECT id FROM checklist_modelos WHERE id = %s", (mid,))
    if not modelo:
        return err("Modelo não encontrado", 404)

    sets, params = [], []
    if "codigo"    in d: sets.append("codigo = %s");    params.append(d["codigo"].strip())
    if "titulo"    in d: sets.append("titulo = %s");    params.append(d["titulo"].strip())
    if "descricao" in d: sets.append("descricao = %s"); params.append(d["descricao"] or "")
    if "tipo"      in d: sets.append("tipo = %s");      params.append(d["tipo"])
    if "ativo"     in d: sets.append("ativo = %s");     params.append(bool(d["ativo"]))
    if "tipo_situacao" in d:
        ts = d["tipo_situacao"]
        if not isinstance(ts, list):
            ts = ["BOM", "RUIM", "N/A"]
        sets.append("tipo_situacao = %s::jsonb"); params.append(json.dumps(ts))

    if not sets:
        return err("Nenhum campo para atualizar")

    params.append(mid)
    db_exec(f"UPDATE checklist_modelos SET {', '.join(sets)} WHERE id = %s", params)
    return ok({"ok": True})


@bp.delete("/api/admin/checklists/modelos/<int:mid>")
@requer_auth
def admin_deletar_modelo(mid):
    modelo = db_fetchone("SELECT id FROM checklist_modelos WHERE id = %s", (mid,))
    if not modelo:
        return err("Modelo não encontrado", 404)

    uso = db_fetchone(
        "SELECT COUNT(*) AS n FROM checklist_preenchimentos WHERE modelo_id = %s", (mid,)
    )
    if uso and uso.get("n", 0) > 0:
        return err("Este modelo possui preenchimentos registrados. Desative-o em vez de excluir.", 409)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM checklist_itens
                WHERE secao_id IN (
                    SELECT id FROM checklist_secoes WHERE modelo_id = %s
                )
            """, (mid,))
            cur.execute("DELETE FROM checklist_secoes WHERE modelo_id = %s", (mid,))
            cur.execute("DELETE FROM checklist_modelos WHERE id = %s", (mid,))
    return ok({"ok": True})


@bp.post("/api/admin/checklists/secoes")
@requer_auth
def admin_criar_secao():
    d = request.json or {}
    if not d.get("modelo_id") or not d.get("titulo"):
        return err("modelo_id e titulo são obrigatórios")

    modelo = db_fetchone("SELECT id FROM checklist_modelos WHERE id = %s", (int(d["modelo_id"]),))
    if not modelo:
        return err("Modelo não encontrado", 404)

    row = db_returning("""
        INSERT INTO checklist_secoes (modelo_id, titulo, ordem)
        VALUES (%s, %s, %s)
        RETURNING id, titulo, ordem
    """, (int(d["modelo_id"]), d["titulo"].strip(), int(d.get("ordem", 1))))
    return ok(row, 201)


@bp.put("/api/admin/checklists/secoes/<int:sid>")
@requer_auth
def admin_atualizar_secao(sid):
    d = request.json or {}
    secao = db_fetchone("SELECT id FROM checklist_secoes WHERE id = %s", (sid,))
    if not secao:
        return err("Seção não encontrada", 404)

    sets, params = [], []
    if "titulo" in d: sets.append("titulo = %s"); params.append(d["titulo"].strip())
    if "ordem"  in d: sets.append("ordem = %s");  params.append(int(d["ordem"]))
    if not sets:
        return err("Nenhum campo para atualizar")

    params.append(sid)
    db_exec(f"UPDATE checklist_secoes SET {', '.join(sets)} WHERE id = %s", params)
    return ok({"ok": True})


@bp.delete("/api/admin/checklists/secoes/<int:sid>")
@requer_auth
def admin_deletar_secao(sid):
    secao = db_fetchone("SELECT id FROM checklist_secoes WHERE id = %s", (sid,))
    if not secao:
        return err("Seção não encontrada", 404)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM checklist_itens WHERE secao_id = %s", (sid,))
            cur.execute("DELETE FROM checklist_secoes WHERE id = %s", (sid,))
    return ok({"ok": True})


@bp.post("/api/admin/checklists/itens")
@requer_auth
def admin_criar_item():
    d = request.json or {}
    if not d.get("secao_id") or not d.get("descricao"):
        return err("secao_id e descricao são obrigatórios")

    secao = db_fetchone("SELECT id FROM checklist_secoes WHERE id = %s", (int(d["secao_id"]),))
    if not secao:
        return err("Seção não encontrada", 404)

    row = db_returning("""
        INSERT INTO checklist_itens (secao_id, descricao, ordem, tem_quant)
        VALUES (%s, %s, %s, %s)
        RETURNING id, descricao, ordem, tem_quant
    """, (
        int(d["secao_id"]), d["descricao"].strip(),
        int(d.get("ordem", 1)), bool(d.get("tem_quant", False)),
    ))
    return ok(row, 201)


@bp.put("/api/admin/checklists/itens/<int:iid>")
@requer_auth
def admin_atualizar_item(iid):
    d = request.json or {}
    item = db_fetchone("SELECT id FROM checklist_itens WHERE id = %s", (iid,))
    if not item:
        return err("Item não encontrado", 404)

    sets, params = [], []
    if "descricao" in d: sets.append("descricao = %s"); params.append(d["descricao"].strip())
    if "ordem"     in d: sets.append("ordem = %s");     params.append(int(d["ordem"]))
    if "tem_quant" in d: sets.append("tem_quant = %s"); params.append(bool(d["tem_quant"]))
    if not sets:
        return err("Nenhum campo para atualizar")

    params.append(iid)
    db_exec(f"UPDATE checklist_itens SET {', '.join(sets)} WHERE id = %s", params)
    return ok({"ok": True})


@bp.delete("/api/admin/checklists/itens/<int:iid>")
@requer_auth
def admin_deletar_item(iid):
    item = db_fetchone("SELECT id FROM checklist_itens WHERE id = %s", (iid,))
    if not item:
        return err("Item não encontrado", 404)

    db_exec("DELETE FROM checklist_respostas WHERE item_id = %s", (iid,))
    db_exec("DELETE FROM checklist_itens WHERE id = %s", (iid,))
    return ok({"ok": True})
