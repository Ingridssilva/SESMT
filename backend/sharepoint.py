"""
sharepoint.py — Integração Microsoft Graph API + Geração de PDF
SESMT Empresa Exemplo

Estrutura de pastas criada no SharePoint:
    Departamento de SESMT/
    ├── Campo/
    │   └── 2026-05/                              ← ano-mês
    │       ├── INSP-2026-0001/                   ← código da inspeção
    │       │   ├── INSP-2026-0001_SESMT_CHECKLIST_01_JOAO_DA_SILVA.pdf
    │       │   ├── INSP-2026-0001_SESMT_CHECKLIST_02_MARIA_OLIVEIRA.pdf
    │       │   └── fotos/
    │       │       └── SESMT_CHECKLIST_01_JOAO_DA_SILVA/
    │       │           ├── item42.jpeg
    │       │           └── item15.jpeg
    │       └── INSP-2026-0002/
    │           └── ...
    └── Lideranca/
        └── 2026-05/
            └── IL-2026-0001/
                └── IL-2026-0001_SESMT_CHECKLIST_02_CARLOS_SOUZA.pdf

Uso no app.py:
    from sharepoint import SharePointClient, gerar_pdf_checklist
"""

import os
import json
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, date
from io import BytesIO


# ── Configuração via .env ─────────────────────────────────────────────────────
SP_TENANT_ID    = os.environ.get('SP_TENANT_ID', '')
SP_CLIENT_ID    = os.environ.get('SP_CLIENT_ID', '')
SP_CLIENT_SECRET= os.environ.get('SP_CLIENT_SECRET', '')
# SP_PASTA_BASE: caminho DENTRO da biblioteca "Documentos Compartilhados".
# NÃO incluir "Documentos Compartilhados/" — o drive já é essa biblioteca.
# Exemplo: 'Departamento de SESMT'  → cria  .../Documentos Compartilhados/Departamento de SESMT/Campo/...
# ERRO COMUM: definir 'Documentos Compartilhados/Departamento de SESMT' duplicaria o prefixo.
SP_PASTA_BASE   = os.environ.get('SP_PASTA_BASE', 'Departamento de SESMT')

# SP_DRIVE_ID não é mais necessário — descoberto automaticamente igual ao NewRh.
# SP_SITE_ID também não precisa ser o ID completo — pode ser a URL do site.
_SP_SITE_URL = 'empresaexemplo.sharepoint.com:/sites/Intranet'

# Nomes aceitos para a biblioteca de documentos (ordem de preferência)
_DRIVE_NAMES = ('Documentos Compartilhados', 'Shared Documents', 'Documents', 'Documentos')


# ═════════════════════════════════════════════════════════════════════════════
# Cliente SharePoint
# ═════════════════════════════════════════════════════════════════════════════
class SharePointClient:
    def __init__(self):
        self._token      = None
        self._token_exp  = 0
        self._drive_id   = None   # descoberto automaticamente na primeira chamada

    def _configurado(self):
        return all([SP_TENANT_ID, SP_CLIENT_ID, SP_CLIENT_SECRET])

    def token(self):
        """Obtém token de acesso com cache (renova 60s antes de expirar)."""
        import time
        if self._token and time.time() < self._token_exp - 60:
            return self._token

        data = urllib.parse.urlencode({
            'grant_type':    'client_credentials',
            'client_id':     SP_CLIENT_ID,
            'client_secret': SP_CLIENT_SECRET,
            'scope':         'https://graph.microsoft.com/.default',
        }).encode()

        req = urllib.request.Request(
            f'https://login.microsoftonline.com/{SP_TENANT_ID}/oauth2/v2.0/token',
            data=data, method='POST'
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            resp            = json.loads(r.read())
            self._token     = resp['access_token']
            self._token_exp = time.time() + resp.get('expires_in', 3600)
            return self._token

    def _req(self, method, path, body=None, content_type='application/json'):
        """Requisição genérica ao Graph API."""
        tok = self.token()
        headers = {
            'Authorization': f'Bearer {tok}',
            'Accept':        'application/json',
        }
        if body is not None:
            headers['Content-Type'] = content_type

        data = None
        if body is not None:
            data = body if isinstance(body, bytes) else json.dumps(body).encode()

        req = urllib.request.Request(
            f'https://graph.microsoft.com/v1.0{path}',
            data=data, method=method, headers=headers
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                content = r.read()
                return json.loads(content) if content else {}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode()
            raise Exception(f"Graph API {e.code}: {err_body}")

    def _get_drive_id(self) -> str:
        """
        Descobre o Drive ID da biblioteca 'Documentos Compartilhados' automaticamente.
        Resultado fica em cache na instância — busca só uma vez por processo.
        Igual à lógica do NewRh (_get_drive_id).
        """
        if self._drive_id:
            return self._drive_id

        # 1. Buscar ID do site pelo hostname/path
        site = self._req('GET', f'/sites/{_SP_SITE_URL}')
        site_id = site['id']

        # 2. Listar drives e escolher "Documentos Compartilhados"
        drives_resp = self._req('GET', f'/sites/{site_id}/drives')
        drives = drives_resp.get('value', [])

        drive_id = None
        for nome_alvo in _DRIVE_NAMES:
            for d in drives:
                if d.get('name') == nome_alvo:
                    drive_id = d['id']
                    import logging as _lg; _lg.getLogger(__name__).info('[SharePoint] Drive encontrado: %s → %s', nome_alvo, drive_id)
                    break
            if drive_id:
                break

        # Fallback: pega o primeiro da lista
        if not drive_id and drives:
            drive_id = drives[0]['id']
            import logging as _lg2; _lg2.getLogger(__name__).info('[SharePoint] Drive fallback: %s → %s', drives[0].get('name'), drive_id)

        if not drive_id:
            # Estratégia B: drive padrão do site (não requer listar drives)
            try:
                import logging
                drive          = self._req('GET', f'/sites/{site_id}/drives')
                # tenta buscar drive padrão diretamente
                drive_default  = self._req('GET', f'/sites/{site_id}/drive')
                self._drive_id = drive_default['id']
                logging.getLogger(__name__).info(
                    '[SharePoint] Drive padrão usado: %s → %s',
                    drive_default.get("name"), self._drive_id
                )
                return self._drive_id
            except Exception as e2:
                raise Exception(
                    f"Não foi possível descobrir o Drive ID. "
                    f"Verifique permissão Sites.ReadWrite.All no Azure AD. Erro: {e2}"
                )

        self._drive_id = drive_id
        return self._drive_id

    def _garantir_pasta(self, caminho_partes):
        """
        Garante que a hierarquia de pastas existe, criando se necessário.
        caminho_partes: lista de strings, ex: ['Departamento de SESMT', 'Campo', '2026-05', 'INSP-2026-0001']
        Usa o caminho relativo via Graph API root:/{path} para criar diretamente,
        sem precisar navegar pasta a pasta (mais eficiente).
        """
        drive_id = self._get_drive_id()
        caminho  = '/'.join(caminho_partes)

        # Tenta criar via PUT no caminho completo (cria toda a hierarquia de uma vez)
        try:
            caminho_enc = urllib.parse.quote(caminho, safe='/:.-_')
            resp = self._req(
                'PATCH',
                f'/drives/{drive_id}/root:/{caminho_enc}',
                body={'folder': {}, '@microsoft.graph.conflictBehavior': 'replace'}
            )
            return resp.get('id')
        except Exception:
            pass

        # Fallback: criar pasta a pasta (mais lento mas mais compatível)
        pasta_atual_id = 'root'
        for parte in caminho_partes:
            body = {
                'name':   parte,
                'folder': {},
                '@microsoft.graph.conflictBehavior': 'fail'
            }
            try:
                resp = self._req(
                    'POST',
                    f'/drives/{drive_id}/items/{pasta_atual_id}/children',
                    body=body
                )
                pasta_atual_id = resp['id']
            except Exception as e:
                if '409' in str(e) or 'nameAlreadyExists' in str(e):
                    resp = self._req('GET', f'/drives/{drive_id}/items/{pasta_atual_id}/children')
                    for item in resp.get('value', []):
                        if item['name'] == parte and 'folder' in item:
                            pasta_atual_id = item['id']
                            break
                else:
                    raise

        return pasta_atual_id

    def upload(self, conteudo_bytes, nome_arquivo, aba, data_evento, codigo_inspecao=''):
        """
        Faz upload de um arquivo para a pasta correta no SharePoint.

        Estrutura criada:
            SP_PASTA_BASE / {aba} / {ano-mes} / {codigo_inspecao} / {nome_arquivo}

        Exemplo:
            Documentos Compartilhados/Departamento de SESMT/Campo/2026-05/INSP-2026-0001/
                INSP-2026-0001_SESMT_CHECKLIST_01_JOAO_DA_SILVA.pdf

        Retorna: { 'url': str, 'item_id': str } ou None se não configurado
        """
        if not self._configurado():
            return None

        try:
            drive_id    = self._get_drive_id()
            partes_base = [p for p in SP_PASTA_BASE.split('/') if p]

            # Formatar ano-mês
            if isinstance(data_evento, str):
                ano_mes = data_evento[:7]   # "2026-05-30" → "2026-05"
            else:
                ano_mes = data_evento.strftime('%Y-%m')

            pasta_insp = codigo_inspecao.strip() if codigo_inspecao and codigo_inspecao.strip() else 'SEM-CODIGO'
            caminho    = partes_base + [aba, ano_mes, pasta_insp]

            # Garantir hierarquia de pastas
            self._garantir_pasta(caminho)

            # Upload direto pelo caminho
            caminho_str = '/'.join(caminho)
            # Encode espaços e caracteres especiais no caminho (RFC 3986)
            caminho_enc  = urllib.parse.quote(f'{caminho_str}/{nome_arquivo}', safe='/:.-_')
            url_upload   = f'/drives/{drive_id}/root:/{caminho_enc}:/content'
            import logging as _log
            _log.getLogger(__name__).info(
                "[SharePoint] Iniciando upload: %s (%d bytes)",
                url_upload, len(conteudo_bytes)
            )
            resp = self._req(
                'PUT',
                url_upload,
                body=conteudo_bytes,
                content_type='application/octet-stream'
            )
            _log.getLogger(__name__).info(
                "[SharePoint] Upload OK: %s", resp.get('webUrl', '(sem url)')
            )
            return {
                'url':     resp.get('webUrl', ''),
                'item_id': resp.get('id', ''),
            }

        except Exception as e:
            import logging, traceback
            logging.getLogger(__name__).error(
                "[SharePoint] Erro no upload de '%s': %s\n%s",
                nome_arquivo, e, traceback.format_exc()
            )
            return None

    def upload_foto(self, conteudo_bytes, nome_arquivo, subpasta_foto,
                    aba, data_evento, codigo_inspecao=''):
        """
        Faz upload de foto para subpasta dentro da pasta da inspeção.

        Estrutura:
            base / aba / ano-mes / codigo_inspecao / fotos / {modelo_colaborador} / item{n}.jpg

        Exemplo:
            Departamento de SESMT/Campo/2026-05/INSP-2026-0004/
                fotos/
                    SESMT_FISC_RET_ANTONIO_LOUZADA/
                        item01.jpeg
        """
        if not self._configurado():
            return None

        try:
            drive_id    = self._get_drive_id()
            partes_base = [p for p in SP_PASTA_BASE.split('/') if p]

            if isinstance(data_evento, str):
                ano_mes = data_evento[:7]
            else:
                ano_mes = data_evento.strftime('%Y-%m')

            pasta_insp = codigo_inspecao.strip() if codigo_inspecao and codigo_inspecao.strip() else 'SEM-CODIGO'

            # Hierarquia completa incluindo subpasta de fotos
            caminho = partes_base + [aba, ano_mes, pasta_insp] + subpasta_foto.split('/')

            self._garantir_pasta(caminho)

            caminho_str = '/'.join(caminho)
            caminho_enc = urllib.parse.quote(f'{caminho_str}/{nome_arquivo}', safe='/:.-_')
            import logging as _log
            _log.getLogger(__name__).info(
                "[SharePoint] Upload foto: %s (%d bytes)", caminho_enc, len(conteudo_bytes)
            )
            resp = self._req(
                'PUT',
                f'/drives/{drive_id}/root:/{caminho_enc}:/content',
                body=conteudo_bytes,
                content_type='application/octet-stream'
            )
            _log.getLogger(__name__).info(
                "[SharePoint] Foto OK: %s", resp.get('webUrl', '')
            )
            return {
                'url':     resp.get('webUrl', ''),
                'item_id': resp.get('id', ''),
            }

        except Exception as e:
            import logging, traceback
            logging.getLogger(__name__).error(
                "[SharePoint] Erro upload foto '%s': %s\n%s",
                nome_arquivo, e, traceback.format_exc()
            )
            return None

    def deletar(self, item_id):
        """Remove um arquivo do SharePoint pelo item_id."""
        if not self._configurado() or not item_id:
            return
        try:
            drive_id = self._get_drive_id()
            self._req('DELETE', f'/drives/{drive_id}/items/{item_id}')
        except Exception as e:
            print(f"[SharePoint] Erro ao deletar: {e}")


# Instância global (singleton)
sp = SharePointClient()


# ═════════════════════════════════════════════════════════════════════════════
# Helpers de PDF
# ═════════════════════════════════════════════════════════════════════════════

def _c(color) -> str:
    """
    Converte um objeto Color do ReportLab para string '#rrggbb' usável
    em tags <font color="..."> de Paragraph.

    reportlab.lib.colors.HexColor.hexval() retorna '0xrrggbb' (com prefixo '0x'),
    mas o parser interno de Paragraph exige '#rrggbb'. Esta função garante o
    formato correto independentemente da versão do ReportLab.
    """
    h = color.hexval()          # ex: '0x1a7c4f'
    return '#' + h[2:].zfill(6) # ex: '#1a7c4f'


def _fmt_data(s) -> str:
    """Converte 'YYYY-MM-DD' → 'DD/MM/YYYY'. Retorna '—' se vazio ou inválido."""
    try:
        s = str(s or '').strip()[:10]
        if len(s) == 10 and s[4] == '-':
            return f"{s[8:10]}/{s[5:7]}/{s[:4]}"
    except Exception:
        pass
    return s or '—'


# ═════════════════════════════════════════════════════════════════════════════
# Geração de PDF do Checklist
# ═════════════════════════════════════════════════════════════════════════════
def gerar_pdf_checklist(dados):
    """
    Gera um PDF do checklist preenchido usando ReportLab.

    dados: dict com:
        - codigo_inspecao: str
        - tipo_aba: 'Campo' | 'Liderança'
        - data_inspecao: str (YYYY-MM-DD)
        - modelo_titulo: str
        - modelo_codigo: str
        - resultado_geral: str
        - observacoes_extras: str
        - preenchido_por_nome: str
        - cabecalho: dict
        - secoes: list de { titulo, itens: [ { descricao, situacao, quantidade, observacao, foto_url } ] }

    Retorna: bytes do PDF
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle, Paragraph,
            Spacer, HRFlowable
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT

        buf = BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            leftMargin=15*mm, rightMargin=15*mm,
            topMargin=15*mm, bottomMargin=15*mm,
        )

        LARANJA  = colors.HexColor('#F7931E')
        PRETO    = colors.HexColor('#0D0D0D')
        CINZA1   = colors.HexColor('#F5F6FA')
        CINZA3   = colors.HexColor('#B0B7C6')
        VERDE    = colors.HexColor('#1A7C4F')
        VERMELHO = colors.HexColor('#C0392B')
        AMARELO  = colors.HexColor('#C49A00')
        BRANCO   = colors.white

        styles = getSampleStyleSheet()
        sNormal = ParagraphStyle('normal', fontName='Helvetica', fontSize=8, leading=10)
        sBold   = ParagraphStyle('bold',   fontName='Helvetica-Bold', fontSize=8, leading=10)
        sSmall  = ParagraphStyle('small',  fontName='Helvetica', fontSize=7, leading=9, textColor=CINZA3)

        story = []

        # ── Cabeçalho ─────────────────────────────────────────────────────────
        header_data = [
            [
                Paragraph('<b>SESMT — EMPRESA EXEMPLO</b>', ParagraphStyle('h', fontName='Helvetica-Bold', fontSize=11, textColor=BRANCO)),
                Paragraph(f'<b>{dados.get("modelo_titulo") or ""}</b><br/><font size="7">{dados.get("modelo_codigo","")}</font>',
                          ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=9, textColor=BRANCO, alignment=TA_CENTER)),
                Paragraph(f'<b>{dados.get("tipo_aba") or ""}</b><br/><font size="7">{dados.get("data_inspecao","")}</font>',
                          ParagraphStyle('h3', fontName='Helvetica-Bold', fontSize=9, textColor=BRANCO, alignment=TA_CENTER)),
            ]
        ]
        header_table = Table(header_data, colWidths=[80*mm, 80*mm, 35*mm])
        header_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), PRETO),
            ('LEFTPADDING',  (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
            ('TOPPADDING',   (0,0), (-1,-1), 8),
            ('BOTTOMPADDING',(0,0), (-1,-1), 8),
            ('ROUNDEDCORNERS', (0,0), (-1,-1), [4,4,4,4]),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 4*mm))

        # ── Info da inspeção ─────────────────────────────────────────────────
        resultado = dados.get('resultado_geral','—')
        cor_res   = VERDE if resultado == 'CONFORME' else (VERMELHO if resultado == 'NÃO CONFORME' else CINZA3)

        info_data = [
            ['Código', dados.get('codigo_inspecao','—'),
             'Preenchido por', dados.get('preenchido_por_nome','—')],
            ['Resultado', Paragraph(f'<b><font color="{_c(cor_res)}">{resultado}</font></b>', sNormal),
             'Observações', dados.get('observacoes_extras','—')],
        ]
        # Adicionar campos do cabeçalho extra (equipe, contrato etc)
        cab = dados.get('cabecalho') or {}
        for k, v in cab.items():
            if v:
                info_data.append([k.replace('_',' ').title(), str(v), '', ''])

        info_table = Table(info_data, colWidths=[30*mm, 65*mm, 30*mm, 65*mm])
        info_table.setStyle(TableStyle([
            ('FONTNAME',  (0,0), (-1,-1), 'Helvetica'),
            ('FONTNAME',  (0,0), (0,-1), 'Helvetica-Bold'),
            ('FONTNAME',  (2,0), (2,-1), 'Helvetica-Bold'),
            ('FONTSIZE',  (0,0), (-1,-1), 8),
            ('BACKGROUND',(0,0), (0,-1), CINZA1),
            ('BACKGROUND',(2,0), (2,-1), CINZA1),
            ('GRID',      (0,0), (-1,-1), 0.3, CINZA3),
            ('TOPPADDING',(0,0), (-1,-1), 4),
            ('BOTTOMPADDING',(0,0),(-1,-1), 4),
            ('LEFTPADDING',(0,0), (-1,-1), 6),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 5*mm))

        # ── Seções e itens ────────────────────────────────────────────────────
        COR_SIT = {
            'BOM':          VERDE,
            'CONFORME':     VERDE,
            'RUIM':         VERMELHO,
            'NÃO CONFORME': VERMELHO,
            'N/A':          CINZA3,
        }

        for secao in dados.get('secoes', []):
            # Título da seção
            sec_data = [[Paragraph(f'<b>{secao["titulo"]}</b>',
                          ParagraphStyle('st', fontName='Helvetica-Bold', fontSize=8,
                                         textColor=BRANCO))]]
            sec_table = Table(sec_data, colWidths=[190*mm])
            sec_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), LARANJA),
                ('TOPPADDING', (0,0), (-1,-1), 5),
                ('BOTTOMPADDING',(0,0),(-1,-1),5),
                ('LEFTPADDING',(0,0), (-1,-1), 8),
            ]))
            story.append(sec_table)

            # Cabeçalho da tabela de itens
            tem_quant = any(i.get('quantidade') for i in secao.get('itens',[]))
            cols  = ['Item', 'Situação']
            cwidths = [120*mm, 30*mm]
            if tem_quant:
                cols.append('Qtd'); cwidths.append(18*mm)
            cols.append('Observação')
            cwidths.append(190*mm - sum(cwidths))

            rows = [cols]
            for item in secao.get('itens', []):
                sit  = item.get('situacao') or '—'
                cor  = COR_SIT.get(sit, CINZA3)
                row  = [
                    Paragraph(item.get('descricao') or '', sNormal),
                    Paragraph(f'<b><font color="{_c(cor)}">{sit}</font></b>', sNormal),
                ]
                if tem_quant:
                    row.append(Paragraph(str(item.get('quantidade') or ''), sNormal))
                row.append(Paragraph(item.get('observacao') or '', sSmall))
                rows.append(row)

            items_table = Table(rows, colWidths=cwidths, repeatRows=1)
            items_table.setStyle(TableStyle([
                ('FONTNAME',  (0,0), (-1,0), 'Helvetica-Bold'),
                ('FONTSIZE',  (0,0), (-1,-1), 7),
                ('BACKGROUND',(0,0), (-1,0), CINZA1),
                ('GRID',      (0,0), (-1,-1), 0.3, CINZA3),
                ('TOPPADDING',(0,0), (-1,-1), 3),
                ('BOTTOMPADDING',(0,0),(-1,-1),3),
                ('LEFTPADDING',(0,0), (-1,-1), 5),
                ('ROWBACKGROUNDS', (0,1), (-1,-1), [BRANCO, colors.HexColor('#FAFAFA')]),
                # Colorir linhas NÃO CONFORME / RUIM
                *[
                    ('BACKGROUND', (0, i+1), (-1, i+1), colors.HexColor('#FFF0F0'))
                    for i, item in enumerate(secao.get('itens', []))
                    if item.get('situacao') in ('RUIM', 'NÃO CONFORME')
                ]
            ]))
            story.append(items_table)
            story.append(Spacer(1, 3*mm))

        # ── Resumo final ──────────────────────────────────────────────────────
        story.append(HRFlowable(width='100%', thickness=1, color=CINZA3))
        story.append(Spacer(1, 3*mm))

        todos_itens = [i for s in dados.get('secoes',[]) for i in s.get('itens',[])]
        cnt_conf  = sum(1 for i in todos_itens if i.get('situacao') in ('BOM','CONFORME'))
        cnt_nconf = sum(1 for i in todos_itens if i.get('situacao') in ('RUIM','NÃO CONFORME'))
        cnt_na    = sum(1 for i in todos_itens if i.get('situacao') == 'N/A')
        cnt_blank = sum(1 for i in todos_itens if not i.get('situacao'))

        resumo_data = [[
            Paragraph(f'<b>Total de Itens:</b> {len(todos_itens)}', sNormal),
            Paragraph(f'<font color="{_c(VERDE)}"><b>✓ Conformes: {cnt_conf}</b></font>', sNormal),
            Paragraph(f'<font color="{_c(VERMELHO)}"><b>✗ Não Conformes: {cnt_nconf}</b></font>', sNormal),
            Paragraph(f'N/A: {cnt_na}  |  Em branco: {cnt_blank}', sSmall),
        ]]
        resumo_table = Table(resumo_data, colWidths=[40*mm, 45*mm, 55*mm, 50*mm])
        resumo_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), CINZA1),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING',(0,0),(-1,-1),6),
            ('LEFTPADDING',(0,0), (-1,-1), 8),
            ('BOX', (0,0), (-1,-1), 0.5, CINZA3),
        ]))
        story.append(resumo_table)
        story.append(Spacer(1, 6*mm))

        # ── Assinaturas ───────────────────────────────────────────────────────
        ass_data = [[
            Paragraph('____________________________\nResponsável pelo Preenchimento', sSmall),
            Paragraph('____________________________\nEncarregado / Líder', sSmall),
            Paragraph('____________________________\nResponsável SESMT (QSMS)', sSmall),
        ]]
        ass_table = Table(ass_data, colWidths=[63*mm, 63*mm, 64*mm])
        ass_table.setStyle(TableStyle([
            ('ALIGN',  (0,0), (-1,-1), 'CENTER'),
            ('TOPPADDING', (0,0), (-1,-1), 8),
        ]))
        story.append(ass_table)

        # ── Rodapé ────────────────────────────────────────────────────────────
        story.append(Spacer(1, 4*mm))
        story.append(Paragraph(
            f'Gerado pelo Sistema SESMT em {datetime.now().strftime("%d/%m/%Y %H:%M")}  |  '
            f'Empresa Exemplo — CNPJ 00.000.000/0001-00',
            ParagraphStyle('footer', fontName='Helvetica', fontSize=6,
                           textColor=CINZA3, alignment=TA_CENTER)
        ))

        doc.build(story)
        return buf.getvalue()

    except ImportError:
        # ReportLab não instalado — retornar PDF mínimo placeholder
        return _pdf_simples(dados)


def _pdf_simples(dados):
    """PDF mínimo sem ReportLab (texto puro em bytes PDF)."""
    linhas = [
        f"SESMT — Empresa Exemplo",
        f"Checklist: {dados.get('modelo_titulo','')}",
        f"Código: {dados.get('codigo_inspecao','')}",
        f"Data: {dados.get('data_inspecao','')}",
        f"Resultado: {dados.get('resultado_geral','')}",
        "",
    ]
    for secao in dados.get('secoes', []):
        linhas.append(f"== {secao['titulo']} ==")
        for item in secao.get('itens', []):
            sit = item.get('situacao') or 'em branco'
            linhas.append(f"  {item['descricao']}: {sit}")
    texto = '\n'.join(linhas)
    # PDF mínimo válido
    content = f"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length {len(texto)+20}>>
stream
BT /F1 9 Tf 40 800 Td ({texto[:500]}) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Courier>>endobj
xref
0 6
trailer<</Size 6/Root 1 0 R>>
startxref 0
%%EOF"""
    return content.encode('latin-1', errors='replace')


# ── Relatório PDF completo de Inspeção de Campo ───────────────────────────────

def gerar_pdf_inspecao(dados):
    """
    Gera PDF completo de uma Inspeção de Campo.

    dados: dict com:
        - codigo, data_inspecao, tipo_inspecao, municipio, contrato,
          responsavel, local, equipe, pontos_positivos, observacoes
        - checklists: list de { modelo_titulo, modelo_codigo, resultado_geral,
                                 observacoes_extras, preenchido_por_nome,
                                 nome_avaliado, cargo_avaliado, cabecalho, secoes }
        - ncs: list de dicts de nao_conformidades

    Retorna: bytes do PDF
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle, Paragraph,
            Spacer, HRFlowable, PageBreak, KeepTogether
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

        buf = BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            leftMargin=15*mm, rightMargin=15*mm,
            topMargin=15*mm,  bottomMargin=15*mm,
        )

        # ── Paleta ────────────────────────────────────────────────────────────
        LARANJA  = colors.HexColor('#F7931E')
        PRETO    = colors.HexColor('#0D0D0D')
        CINZA1   = colors.HexColor('#F5F6FA')
        CINZA2   = colors.HexColor('#E2E5EE')
        CINZA3   = colors.HexColor('#B0B7C6')
        CINZA4   = colors.HexColor('#6B7280')
        VERDE    = colors.HexColor('#1A7C4F')
        VERMELHO = colors.HexColor('#C0392B')
        AMARELO  = colors.HexColor('#C49A00')
        BRANCO   = colors.white

        COR_SIT = {
            'BOM':          VERDE,
            'CONFORME':     VERDE,
            'RUIM':         VERMELHO,
            'NÃO CONFORME': VERMELHO,
            'N/A':          CINZA3,
            'Não se Aplica': CINZA3,
        }
        COR_GRAV = {
            'CRÍTICA': VERMELHO,
            'ALTA':    colors.HexColor('#E67E22'),
            'MÉDIA':   AMARELO,
            'BAIXA':   VERDE,
        }

        # ── Estilos ───────────────────────────────────────────────────────────
        sNormal  = ParagraphStyle('n',  fontName='Helvetica',      fontSize=8,  leading=10)
        sBold    = ParagraphStyle('b',  fontName='Helvetica-Bold',  fontSize=8,  leading=10)
        sSmall   = ParagraphStyle('s',  fontName='Helvetica',      fontSize=7,  leading=9,  textColor=CINZA3)
        sWhite   = ParagraphStyle('w',  fontName='Helvetica-Bold',  fontSize=9,  textColor=BRANCO)
        sWhiteS  = ParagraphStyle('ws', fontName='Helvetica-Bold',  fontSize=8,  textColor=BRANCO, alignment=TA_CENTER)
        sCenter  = ParagraphStyle('c',  fontName='Helvetica',      fontSize=7,  leading=9,  alignment=TA_CENTER, textColor=CINZA4)
        sTitle   = ParagraphStyle('t',  fontName='Helvetica-Bold',  fontSize=10, leading=13, textColor=BRANCO, alignment=TA_CENTER)

        story = []
        W = 180*mm  # largura útil

        # ════════════════════════════════════════════════════════════════════
        # 1. CABEÇALHO PRINCIPAL
        # ════════════════════════════════════════════════════════════════════
        hdr = Table([[
            Paragraph('<b>SESMT — EMPRESA EXEMPLO</b>', ParagraphStyle(
                'hh', fontName='Helvetica-Bold', fontSize=13, textColor=LARANJA)),
            Paragraph(
                f'<b>RELATÓRIO DE INSPEÇÃO DE CAMPO</b><br/>'
                f'<font size="8">{dados.get("codigo") or ""}</font>',
                sTitle),
            Paragraph(
                f'<font size="7">Data:<br/></font>'
                f'<b>{_fmt_data(dados.get("data_inspecao",""))}</b>',
                ParagraphStyle('hr', fontName='Helvetica-Bold', fontSize=9,
                               textColor=BRANCO, alignment=TA_RIGHT)),
        ]], colWidths=[70*mm, 80*mm, 30*mm])
        hdr.setStyle(TableStyle([
            ('BACKGROUND',  (0,0), (-1,-1), PRETO),
            ('LEFTPADDING',  (0,0), (-1,-1), 10),
            ('RIGHTPADDING', (0,0), (-1,-1), 10),
            ('TOPPADDING',   (0,0), (-1,-1), 10),
            ('BOTTOMPADDING',(0,0), (-1,-1), 10),
        ]))
        story.append(hdr)
        story.append(Spacer(1, 4*mm))

        # ════════════════════════════════════════════════════════════════════
        # 2. INFORMAÇÕES DA INSPEÇÃO
        # ════════════════════════════════════════════════════════════════════
        info_rows = [
            ['Tipo de Inspeção', dados.get('tipo_inspecao','—'),
             'Responsável',      dados.get('responsavel','—')],
            ['Município',        dados.get('municipio','—'),
             'Contrato',         dados.get('contrato','—')],
            ['Local / Frente',   dados.get('local','—'),
             'Equipe',           dados.get('equipe','—')],
        ]
        info_table = Table(
            [[Paragraph(c if i%2==0 else str(c or '—'), sBold if i%2==0 else sNormal)
              for i, c in enumerate(row)]
             for row in info_rows],
            colWidths=[32*mm, 58*mm, 32*mm, 58*mm]
        )
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (0,-1), CINZA1),
            ('BACKGROUND', (2,0), (2,-1), CINZA1),
            ('FONTSIZE',   (0,0), (-1,-1), 8),
            ('GRID',       (0,0), (-1,-1), 0.3, CINZA2),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING',(0,0),(-1,-1), 5),
            ('LEFTPADDING', (0,0),(-1,-1),  7),
        ]))
        story.append(info_table)

        # Pontos positivos / observações
        pos  = (dados.get('pontos_positivos') or '').strip()
        obs_ = (dados.get('observacoes') or '').strip()
        if pos or obs_:
            story.append(Spacer(1, 3*mm))
            extra_rows = []
            if pos:
                extra_rows.append([
                    Paragraph('<b>Pontos Positivos</b>', sBold),
                    Paragraph(pos, sNormal),
                ])
            if obs_:
                extra_rows.append([
                    Paragraph('<b>Observações</b>', sBold),
                    Paragraph(obs_, sNormal),
                ])
            et = Table(extra_rows, colWidths=[32*mm, 148*mm])
            et.setStyle(TableStyle([
                ('GRID',         (0,0), (-1,-1), 0.3, CINZA2),
                ('BACKGROUND',   (0,0), (0,-1),  CINZA1),
                ('TOPPADDING',   (0,0), (-1,-1),  5),
                ('BOTTOMPADDING',(0,0), (-1,-1),  5),
                ('LEFTPADDING',  (0,0), (-1,-1),  7),
                ('VALIGN',       (0,0), (-1,-1), 'TOP'),
            ]))
            story.append(et)

        story.append(Spacer(1, 5*mm))

        # ════════════════════════════════════════════════════════════════════
        # 3. RESUMO GERAL DOS CHECKLISTS
        # ════════════════════════════════════════════════════════════════════
        checklists = dados.get('checklists', [])
        ncs        = dados.get('ncs', [])

        if checklists:
            # Barra de título
            sec_hdr = Table([[Paragraph(
                '<b>📋  CHECKLISTS PREENCHIDOS</b>',
                ParagraphStyle('sh', fontName='Helvetica-Bold', fontSize=9, textColor=BRANCO)
            )]], colWidths=[W])
            sec_hdr.setStyle(TableStyle([
                ('BACKGROUND',   (0,0), (-1,-1), LARANJA),
                ('TOPPADDING',   (0,0), (-1,-1), 6),
                ('BOTTOMPADDING',(0,0), (-1,-1), 6),
                ('LEFTPADDING',  (0,0), (-1,-1), 10),
            ]))
            story.append(sec_hdr)

            # Tabela resumo dos checklists
            res_head = [['Modelo', 'Avaliado / Identificação', 'Preenchido por', 'Resultado']]
            res_rows = []
            for cl in checklists:
                resultado = cl.get('resultado_geral') or '—'
                cor_r     = COR_SIT.get(resultado, CINZA3)
                avaliado  = cl.get('nome_avaliado') or ''
                cab       = cl.get('cabecalho') or {}
                if not avaliado:
                    avaliado = (cab.get('responsavel_maquina') or
                                cab.get('responsavel_veiculo') or
                                cab.get('placa') or '—')
                res_rows.append([
                    Paragraph(f'<b>{cl.get("modelo_codigo") or ""}</b><br/>'
                               f'<font size="7">{cl.get("modelo_titulo","")}</font>', sNormal),
                    Paragraph(avaliado, sNormal),
                    Paragraph(cl.get('preenchido_por_nome') or '—', sNormal),
                    Paragraph(f'<b><font color="{_c(cor_r)}">{resultado}</font></b>', sNormal),
                ])
            rt = Table(res_head + res_rows, colWidths=[55*mm, 60*mm, 45*mm, 20*mm], repeatRows=1)
            rt.setStyle(TableStyle([
                ('BACKGROUND',   (0,0), (-1,0), CINZA1),
                ('FONTNAME',     (0,0), (-1,0), 'Helvetica-Bold'),
                ('FONTSIZE',     (0,0), (-1,-1), 7),
                ('GRID',         (0,0), (-1,-1), 0.3, CINZA2),
                ('TOPPADDING',   (0,0), (-1,-1), 4),
                ('BOTTOMPADDING',(0,0), (-1,-1), 4),
                ('LEFTPADDING',  (0,0), (-1,-1), 6),
                ('ROWBACKGROUNDS', (0,1), (-1,-1), [BRANCO, colors.HexColor('#FAFAFA')]),
            ]))
            story.append(rt)
            story.append(Spacer(1, 5*mm))

        # ════════════════════════════════════════════════════════════════════
        # 4. NÃO CONFORMIDADES
        # ════════════════════════════════════════════════════════════════════
        if ncs:
            nc_hdr = Table([[Paragraph(
                f'<b>⚠  NÃO CONFORMIDADES  ({len(ncs)})</b>',
                ParagraphStyle('nch', fontName='Helvetica-Bold', fontSize=9, textColor=BRANCO)
            )]], colWidths=[W])
            nc_hdr.setStyle(TableStyle([
                ('BACKGROUND',   (0,0), (-1,-1), VERMELHO),
                ('TOPPADDING',   (0,0), (-1,-1), 6),
                ('BOTTOMPADDING',(0,0), (-1,-1), 6),
                ('LEFTPADDING',  (0,0), (-1,-1), 10),
            ]))
            story.append(nc_hdr)

            nc_head = [['Código', 'Descrição', 'Gravidade', 'Status', 'Prazo']]
            nc_rows = []
            for nc in ncs:
                grav    = nc.get('gravidade','—')
                cor_g   = COR_GRAV.get(grav, CINZA3)
                prazo   = str(nc.get('prazo_correcao','') or '')[:10]
                nc_rows.append([
                    Paragraph(nc.get('codigo') or '—', sBold),
                    Paragraph(nc.get('descricao') or '—', sNormal),
                    Paragraph(f'<b><font color="{_c(cor_g)}">{grav}</font></b>', sNormal),
                    Paragraph(nc.get('status') or '—', sNormal),
                    Paragraph(_fmt_data(prazo), sSmall),
                ])
            nct = Table(nc_head + nc_rows, colWidths=[28*mm, 90*mm, 22*mm, 24*mm, 16*mm], repeatRows=1)
            nct.setStyle(TableStyle([
                ('BACKGROUND',   (0,0), (-1,0), colors.HexColor('#FDECEA')),
                ('FONTNAME',     (0,0), (-1,0), 'Helvetica-Bold'),
                ('FONTSIZE',     (0,0), (-1,-1), 7),
                ('GRID',         (0,0), (-1,-1), 0.3, CINZA2),
                ('TOPPADDING',   (0,0), (-1,-1), 4),
                ('BOTTOMPADDING',(0,0), (-1,-1), 4),
                ('LEFTPADDING',  (0,0), (-1,-1), 6),
                ('VALIGN',       (0,0), (-1,-1), 'TOP'),
                ('ROWBACKGROUNDS', (0,1), (-1,-1), [BRANCO, colors.HexColor('#FFF8F8')]),
            ]))
            story.append(nct)
            story.append(Spacer(1, 5*mm))

        # ════════════════════════════════════════════════════════════════════
        # 5. DETALHAMENTO DOS CHECKLISTS (um bloco por checklist)
        # ════════════════════════════════════════════════════════════════════
        for cl_idx, cl in enumerate(checklists):
            avaliado = cl.get('nome_avaliado') or ''
            cab      = cl.get('cabecalho') or {}
            if not avaliado:
                avaliado = (cab.get('responsavel_maquina') or
                            cab.get('responsavel_veiculo') or
                            cab.get('placa') or '—')
            cargo = cl.get('cargo_avaliado') or cab.get('equipe') or ''

            bloco = []

            # Título do checklist
            cl_hdr = Table([[
                Paragraph(f'<b>{cl.get("modelo_codigo") or ""} — {cl.get("modelo_titulo","")}</b>',
                          ParagraphStyle('clh', fontName='Helvetica-Bold', fontSize=8, textColor=BRANCO)),
                Paragraph(
                    f'<b>{cl.get("resultado_geral") or "—"}</b>',
                    ParagraphStyle('clr', fontName='Helvetica-Bold', fontSize=8,
                                   textColor=LARANJA, alignment=TA_RIGHT)),
            ]], colWidths=[140*mm, 40*mm])
            cl_hdr.setStyle(TableStyle([
                ('BACKGROUND',   (0,0), (-1,-1), PRETO),
                ('TOPPADDING',   (0,0), (-1,-1), 6),
                ('BOTTOMPADDING',(0,0), (-1,-1), 6),
                ('LEFTPADDING',  (0,0), (-1,-1), 10),
                ('RIGHTPADDING', (0,0), (-1,-1), 10),
            ]))
            bloco.append(cl_hdr)

            # Info do avaliado / máquina
            avaliado_rows = [
                [Paragraph('<b>Avaliado / Identificação</b>', sBold),
                 Paragraph(avaliado, sNormal),
                 Paragraph('<b>Cargo / Equipe</b>', sBold),
                 Paragraph(cargo, sNormal)],
            ]
            if cl.get('observacoes_extras'):
                avaliado_rows.append([
                    Paragraph('<b>Observações</b>', sBold),
                    Paragraph(cl['observacoes_extras'], sNormal), '', '',
                ])
            # Campos extras do cabeçalho (placa, horímetro etc)
            for k, v in cab.items():
                if v and k not in ('equipe',):
                    avaliado_rows.append([
                        Paragraph(f'<b>{k.replace("_"," ").title()}</b>', sBold),
                        Paragraph(str(v), sNormal), '', '',
                    ])
            av_t = Table(avaliado_rows, colWidths=[35*mm, 55*mm, 35*mm, 55*mm])
            av_t.setStyle(TableStyle([
                ('BACKGROUND',   (0,0), (0,-1), CINZA1),
                ('BACKGROUND',   (2,0), (2,-1), CINZA1),
                ('GRID',         (0,0), (-1,-1), 0.3, CINZA2),
                ('FONTSIZE',     (0,0), (-1,-1), 7),
                ('TOPPADDING',   (0,0), (-1,-1), 4),
                ('BOTTOMPADDING',(0,0), (-1,-1), 4),
                ('LEFTPADDING',  (0,0), (-1,-1), 6),
                ('SPAN',         (1,len(avaliado_rows)-1 if len(avaliado_rows)>1 and not cab else 0),
                                 (3,len(avaliado_rows)-1 if len(avaliado_rows)>1 and not cab else 0)),
            ]))
            bloco.append(av_t)
            bloco.append(Spacer(1, 3*mm))

            # Seções e itens
            for secao in cl.get('secoes', []):
                itens = secao.get('itens', [])
                if not itens:
                    continue

                sec_t = Table([[Paragraph(f'<b>{secao["titulo"]}</b>',
                                ParagraphStyle('s2', fontName='Helvetica-Bold', fontSize=7, textColor=BRANCO))
                                ]], colWidths=[W])
                sec_t.setStyle(TableStyle([
                    ('BACKGROUND',   (0,0), (-1,-1), LARANJA),
                    ('TOPPADDING',   (0,0), (-1,-1), 4),
                    ('BOTTOMPADDING',(0,0), (-1,-1), 4),
                    ('LEFTPADDING',  (0,0), (-1,-1), 8),
                ]))
                bloco.append(sec_t)

                tem_quant = any(i.get('quantidade') for i in itens)
                cols = ['Item', 'Situação']
                cw   = [118*mm, 28*mm]
                if tem_quant:
                    cols.append('Qtd'); cw.append(16*mm)
                cols.append('Observação')
                cw.append(W - sum(cw))

                rows_i = [cols]
                for item in itens:
                    sit = item.get('situacao') or '—'
                    cor = COR_SIT.get(sit, CINZA3)
                    row = [
                        Paragraph(item.get('descricao') or '', sNormal),
                        Paragraph(f'<b><font color="{_c(cor)}">{sit}</font></b>', sNormal),
                    ]
                    if tem_quant:
                        row.append(Paragraph(str(item.get('quantidade') or ''), sNormal))
                    row.append(Paragraph(item.get('observacao') or '', sSmall))
                    rows_i.append(row)

                ts_extra = [
                    ('BACKGROUND', (0, i+1), (-1, i+1), colors.HexColor('#FFF0F0'))
                    for i, item in enumerate(itens)
                    if item.get('situacao') in ('RUIM','NÃO CONFORME')
                ]
                it_t = Table(rows_i, colWidths=cw, repeatRows=1)
                it_t.setStyle(TableStyle([
                    ('FONTNAME',     (0,0), (-1,0), 'Helvetica-Bold'),
                    ('FONTSIZE',     (0,0), (-1,-1), 7),
                    ('BACKGROUND',   (0,0), (-1,0), CINZA1),
                    ('GRID',         (0,0), (-1,-1), 0.3, CINZA2),
                    ('TOPPADDING',   (0,0), (-1,-1), 3),
                    ('BOTTOMPADDING',(0,0), (-1,-1), 3),
                    ('LEFTPADDING',  (0,0), (-1,-1), 5),
                    ('VALIGN',       (0,0), (-1,-1), 'TOP'),
                    ('ROWBACKGROUNDS', (0,1), (-1,-1), [BRANCO, colors.HexColor('#FAFAFA')]),
                    *ts_extra,
                ]))
                bloco.append(it_t)
                bloco.append(Spacer(1, 2*mm))

            # Resumo do checklist
            todos = [i for s in cl.get('secoes',[]) for i in s.get('itens',[])]
            cnt_c  = sum(1 for i in todos if i.get('situacao') in ('BOM','CONFORME'))
            cnt_nc = sum(1 for i in todos if i.get('situacao') in ('RUIM','NÃO CONFORME'))
            cnt_na = sum(1 for i in todos if i.get('situacao') == 'N/A')
            cnt_b  = sum(1 for i in todos if not i.get('situacao'))
            res_d  = [[
                Paragraph(f'<b>Total:</b> {len(todos)}', sNormal),
                Paragraph(f'<font color="{_c(VERDE)}"><b>✓ {cnt_c}</b></font>', sNormal),
                Paragraph(f'<font color="{_c(VERMELHO)}"><b>✗ {cnt_nc}</b></font>', sNormal),
                Paragraph(f'N/A: {cnt_na}  |  Em branco: {cnt_b}', sSmall),
            ]]
            res_t = Table(res_d, colWidths=[35*mm, 30*mm, 40*mm, 75*mm])
            res_t.setStyle(TableStyle([
                ('BACKGROUND',   (0,0), (-1,-1), CINZA1),
                ('TOPPADDING',   (0,0), (-1,-1), 5),
                ('BOTTOMPADDING',(0,0), (-1,-1), 5),
                ('LEFTPADDING',  (0,0), (-1,-1), 8),
                ('BOX',          (0,0), (-1,-1), 0.5, CINZA2),
            ]))
            bloco.append(res_t)
            bloco.append(Spacer(1, 6*mm))

            # Inserir bloco inteiro (tenta manter junto na página)
            story.append(KeepTogether(bloco[:6]))  # cabeçalho + avaliado + primeiras seções
            if len(bloco) > 6:
                story.extend(bloco[6:])

            # Quebra de página entre checklists (exceto último)
            if cl_idx < len(checklists) - 1:
                story.append(PageBreak())

        # ════════════════════════════════════════════════════════════════════
        # 6. ASSINATURAS
        # ════════════════════════════════════════════════════════════════════
        story.append(HRFlowable(width='100%', thickness=0.5, color=CINZA2))
        story.append(Spacer(1, 8*mm))
        ass_d = [[
            Paragraph('____________________________<br/>Responsável SESMT (QSMS)', sCenter),
            Paragraph('____________________________<br/>Encarregado / Líder', sCenter),
            Paragraph('____________________________<br/>Fiscalização / Aprovação', sCenter),
        ]]
        ass_t = Table(ass_d, colWidths=[60*mm, 60*mm, 60*mm])
        ass_t.setStyle(TableStyle([
            ('ALIGN',        (0,0), (-1,-1), 'CENTER'),
            ('TOPPADDING',   (0,0), (-1,-1), 10),
        ]))
        story.append(ass_t)

        # ── Rodapé ────────────────────────────────────────────────────────
        story.append(Spacer(1, 5*mm))
        story.append(Paragraph(
            f'Gerado pelo Sistema SESMT em {datetime.now().strftime("%d/%m/%Y %H:%M")}  |  '
            f'Empresa Exemplo — CNPJ 00.000.000/0001-00  |  Documento de uso interno',
            ParagraphStyle('footer', fontName='Helvetica', fontSize=6,
                           textColor=CINZA3, alignment=TA_CENTER)
        ))

        doc.build(story)
        return buf.getvalue()

    except ImportError:
        return _pdf_simples_inspecao(dados)


def _pdf_simples_inspecao(dados):
    """PDF mínimo sem ReportLab."""
    linhas = [
        f"RELATORIO DE INSPECAO - {dados.get('codigo','')}",
        f"Data: {dados.get('data_inspecao','')}",
        f"Tipo: {dados.get('tipo_inspecao','')}",
        f"Municipio: {dados.get('municipio','')}",
        f"Responsavel: {dados.get('responsavel','')}",
        "",
        f"Checklists: {len(dados.get('checklists',[]))}",
        f"NCs: {len(dados.get('ncs',[]))}",
    ]
    texto = "\n".join(linhas).encode('latin-1', errors='replace')
    return (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R"
        b"/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
        b"4 0 obj<</Length " + str(len(texto)+30).encode() + b">>\nstream\nBT /F1 10 Tf 40 800 Td\n"
        + texto + b"\nET\nendstream\nendobj\n"
        b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
        b"xref\n0 6\ntrailer<</Size 6/Root 1 0 R>>\n%%EOF"
    )
