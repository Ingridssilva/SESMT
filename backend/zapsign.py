"""
zapsign.py — Integração ZapSign API
SESMT Empresa Exemplo

Fluxo:
  1. Checklist salvo + PDF gerado
  2. PDF enviado para ZapSign via base64
  3. ZapSign cria documento com 2 signatários (inspetor + colaborador)
  4. ZapSign envia WhatsApp para cada um com link de assinatura
  5. Webhook notifica quando todos assinaram
  6. PDF certificado salvo no SharePoint

Docs: https://docs.zapsign.com.br
"""

import os
import json
import urllib.request
import urllib.parse
import urllib.error
import base64

# ── Configuração ──────────────────────────────────────────────
ZAPSIGN_TOKEN   = os.environ.get('ZAPSIGN_TOKEN', '')
ZAPSIGN_SANDBOX = os.environ.get('ZAPSIGN_SANDBOX', 'false').lower() == 'true'
# URL de sandbox diferente da produção — ZAPSIGN_SANDBOX=true usa o ambiente de testes
ZAPSIGN_API_URL = (
    'https://sandbox.api.zapsign.com.br/api/v1'
    if ZAPSIGN_SANDBOX
    else 'https://api.zapsign.com.br/api/v1'
)

# URL pública do sistema para receber webhooks
# Ex: https://sesmt.onrender.com/api/zapsign/webhook
WEBHOOK_URL = os.environ.get('ZAPSIGN_WEBHOOK_URL', '')


def _post(endpoint, payload):
    """POST para ZapSign API."""
    if not ZAPSIGN_TOKEN:
        return None

    url  = f"{ZAPSIGN_API_URL}{endpoint}"
    data = json.dumps(payload).encode('utf-8')
    req  = urllib.request.Request(
        url, data=data, method='POST',
        headers={
            'Content-Type':  'application/json',
            'Authorization': f'Bearer {ZAPSIGN_TOKEN}',
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[ZapSign] HTTP {e.code}: {body}")
        return None
    except Exception as e:
        print(f"[ZapSign] Erro: {e}")
        return None


def _get(endpoint):
    """GET para ZapSign API."""
    if not ZAPSIGN_TOKEN:
        return None

    req = urllib.request.Request(
        f"{ZAPSIGN_API_URL}{endpoint}",
        headers={'Authorization': f'Bearer {ZAPSIGN_TOKEN}'}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"[ZapSign] GET erro: {e}")
        return None


def enviar_para_assinatura(
    pdf_bytes,
    nome_documento,
    inspetor_nome,
    inspetor_telefone,
    colaborador_nome,
    colaborador_telefone,
    colaborador_cpf='',
    metadata=None,
):
    """
    Envia PDF para ZapSign e cria fluxo de assinatura com 2 signatários.

    Parâmetros:
        pdf_bytes           : bytes do PDF gerado
        nome_documento      : título do documento no ZapSign
        inspetor_nome       : nome completo do inspetor
        inspetor_telefone   : WhatsApp do inspetor (somente dígitos, ex: 91999999999)
        colaborador_nome    : nome do colaborador avaliado
        colaborador_telefone: WhatsApp do colaborador (somente dígitos)
        colaborador_cpf     : CPF do colaborador (opcional, aumenta segurança)
        metadata            : dict extra para rastreamento

    Retorna:
        dict com { token, open_id, signers } ou None em caso de falha
    """
    if not ZAPSIGN_TOKEN:
        print("[ZapSign] Token não configurado — pulando envio")
        return None

    # Converter PDF para base64
    pdf_b64 = base64.b64encode(pdf_bytes).decode('utf-8')

    # Signatários
    tel_i = _limpar_telefone(inspetor_telefone)
    tel_c = _limpar_telefone(colaborador_telefone)
    print(f"[ZapSign] Inspetor tel: 55{tel_i}")
    print(f"[ZapSign] Colaborador tel: 55{tel_c}")

    signers = [
        {
            "name":                    inspetor_nome,
            "phone_country":           "55",
            "phone_number":            tel_i,
            "send_automatic_whatsapp": True,
            "auth_mode":               "assinaturaTela",
        },
        {
            "name":                    colaborador_nome,
            "phone_country":           "55",
            "phone_number":            tel_c,
            "send_automatic_whatsapp": True,
            "auth_mode":               "assinaturaTela",
            **({"cpf": _limpar_cpf(colaborador_cpf)} if colaborador_cpf else {}),
        },
    ]

    payload = {
        "name":        nome_documento,
        "base64_pdf":  pdf_b64,
        "signers":     signers,
        "lang":        "pt-br",
        # Webhook para notificar quando todos assinarem
        **({"webhook_url": WEBHOOK_URL} if WEBHOOK_URL else {}),
        # Metadados para rastrear no sistema
        **({"external_id": str(metadata.get('preenchimento_id', ''))} if metadata else {}),
    }

    result = _post('/docs/', payload)

    if result:
        print(f"[ZapSign] Documento criado: {result.get('token')} — {nome_documento}")
        return {
            'token':    result.get('token'),
            'open_id':  result.get('open_id'),
            'status':   result.get('status'),
            'signers':  [
                {
                    'token':  s.get('token'),
                    'nome':   s.get('name'),
                    'status': s.get('status'),
                    'sign_url': s.get('sign_url'),
                }
                for s in result.get('signers', [])
            ],
        }
    return None


def verificar_status(doc_token):
    """Verifica status de assinatura de um documento."""
    result = _get(f'/docs/{doc_token}/')
    if not result:
        return None
    return {
        'token':  result.get('token'),
        'status': result.get('status'),
        'signers': [
            {
                'nome':   s.get('name'),
                'status': s.get('status'),
                'signed_at': s.get('signed_at'),
            }
            for s in result.get('signers', [])
        ],
        'signed_file_url': result.get('signed_file_url'),
    }


def baixar_pdf_assinado(doc_token):
    """Baixa o PDF assinado e certificado do ZapSign."""
    result = _get(f'/docs/{doc_token}/')
    if not result:
        return None

    signed_url = result.get('signed_file_url')
    if not signed_url:
        return None

    try:
        req = urllib.request.Request(signed_url)
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()  # bytes do PDF assinado
    except Exception as e:
        print(f"[ZapSign] Erro ao baixar PDF: {e}")
        return None


# ── Helpers ───────────────────────────────────────────────────
def _limpar_telefone(tel):
    """Remove formatação do telefone, mantém só dígitos."""
    if not tel:
        return ''
    return ''.join(c for c in str(tel) if c.isdigit())


def _limpar_cpf(cpf):
    """Remove formatação do CPF."""
    if not cpf:
        return ''
    return ''.join(c for c in str(cpf) if c.isdigit())


def configurado():
    """Retorna True se o ZapSign está configurado."""
    return bool(ZAPSIGN_TOKEN)
