# SESMT — Sistema de Gestão de Segurança do Trabalho

> Versão genérica/sanitizada, sem dados ou identidade de nenhuma empresa real. Todos os e-mails e domínios de exemplo usam `empresaexemplo.com.br` / `suaempresa.com.br`.

Sistema para o setor de SESMT (Segurança e Medicina do Trabalho) gerenciar checklists de inspeção de campo e de liderança, não conformidades (NCs), planos de ação, indicadores e dashboards, com assinatura digital dos documentos e arquivamento automático no SharePoint.

## Funcionalidades

- Checklists de inspeção (campo e liderança), inclusive em modo offline (PWA)
- Registro e acompanhamento de não conformidades (NCs) com prazos e verificação de vencidas
- Painel de indicadores e dashboard gerencial (Chart.js)
- Assinatura digital dos checklists via ZapSign
- Geração automática de PDF do checklist e upload para pasta do SharePoint (Microsoft Graph API)
- Login corporativo via Microsoft Entra ID (Azure AD), restrito ao domínio da empresa
- Cadastro de colaboradores e ações (comunidade, treinamento, cliente, interno)

## Stack

- **Backend:** Flask + pg8000 (PostgreSQL) + PyJWT
- **Frontend:** HTML/CSS/JS puro (sem framework) + Chart.js, com suporte a PWA/offline
- **Auth:** Microsoft MSAL (frontend) + validação JWT via JWKS (backend)
- **Assinaturas:** ZapSign
- **Armazenamento de documentos:** SharePoint via Microsoft Graph API
- **Deploy:** Render (`render.yaml`) + banco no Supabase

## Configuração

1. Instale as dependências:
   ```bash
   pip install -r backend/requirements.txt
   ```
2. Copie `.env.example` para `.env` e preencha com seus próprios valores (banco de dados, app registrado no Azure AD, SharePoint, ZapSign etc.).
3. Rode localmente:
   ```bash
   python backend/app.py
   ```
4. No frontend (`frontend/index.html`), substitua `TENANT_ID` e `CLIENT_ID` pelos valores do seu app Azure AD antes de publicar.

## Deploy

O projeto já inclui `render.yaml` e `Procfile` prontos para deploy no [Render](https://render.com/), com as variáveis de ambiente necessárias documentadas (veja também `.env.example`).

## Testes

```bash
pip install -r requirements-dev.txt
pytest
```

## Estrutura do projeto

```
backend/    → API Flask, autenticação, rotas e integrações (SharePoint, ZapSign)
frontend/   → PWA (HTML/CSS/JS) do sistema
scripts/    → scripts utilitários de importação/seed do banco de dados
tests/      → testes automatizados (pytest)
```

## Licença

Projeto pessoal para fins de portfólio.
