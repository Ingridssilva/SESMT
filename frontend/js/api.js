// Sempre usa origem relativa — Flask serve frontend + API na mesma porta.
// Sem hardcode de localhost:5001 → sem CORS.
const API_BASE = window.API_BASE || '';

async function req(method, path, body = null) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
    };

    // Adicionar token de autenticação se disponível
    const token = (window.__sesmt && window.__sesmt.token()) || '';
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    if (body !== null) opts.body = JSON.stringify(body);

    const res = await fetch(API_BASE + path, opts);
    if (!res.ok) {
        const e = await res.json().catch(() => ({ erro: res.statusText }));
        throw new Error(e.erro || `Erro ${res.status}`);
    }
    return res.json();
}

export const api = {
    // ── Lookup ──────────────────────────────────────────────
    municipios: ()        => req('GET', '/api/lookup/municipios'),
    contratos:  ()        => req('GET', '/api/lookup/contratos'),
    usuarios:   ()        => req('GET', '/api/lookup/usuarios'),

    // ── Dashboard ───────────────────────────────────────────
    dashboard:  ()        => req('GET', '/api/dashboard/'),
    ndgsHist:   ()        => req('GET', '/api/dashboard/ndgs-historico'),

    // ── Inspeções de Campo ───────────────────────────────────
    inspecoes: {
        listar:    (p={})  => req('GET',    '/api/inspecoes/?' + new URLSearchParams(p)),
        obter:     (id)    => req('GET',    `/api/inspecoes/${id}`),
        criar:     (d)     => req('POST',   '/api/inspecoes/', d),
        atualizar: (id, d) => req('PUT',    `/api/inspecoes/${id}`, d),
        deletar:   (id)    => req('DELETE', `/api/inspecoes/${id}`),
    },

    // ── Inspeções de Liderança ───────────────────────────────
    lideranca: {
        listar:    (p={})  => req('GET',    '/api/lideranca/?' + new URLSearchParams(p)),
        obter:     (id)    => req('GET',    `/api/lideranca/${id}`),
        criar:     (d)     => req('POST',   '/api/lideranca/', d),
        atualizar: (id, d) => req('PUT',    `/api/lideranca/${id}`, d),
        deletar:   (id)    => req('DELETE', `/api/lideranca/${id}`),
    },

    // ── Não Conformidades ────────────────────────────────────
    ncs: {
        listar:    (p={})  => req('GET',    '/api/ncs/?' + new URLSearchParams(p)),
        obter:     (id)    => req('GET',    `/api/ncs/${id}`),
        criar:     (d)     => req('POST',   '/api/ncs/', d),
        status:    (id, d) => req('POST',   `/api/ncs/${id}/status`, d),
        deletar:   (id)    => req('DELETE', `/api/ncs/${id}`),
    },

    // ── Ações SESMT ──────────────────────────────────────────
    acoes: {
        listar:    (p={})  => req('GET',    '/api/acoes/?' + new URLSearchParams(p)),
        stats:     ()      => req('GET',    '/api/acoes/stats'),
        obter:     (id)    => req('GET',    `/api/acoes/${id}`),
        criar:     (d)     => req('POST',   '/api/acoes/', d),
        atualizar: (id, d) => req('PUT',    `/api/acoes/${id}`, d),
        deletar:   (id)    => req('DELETE', `/api/acoes/${id}`),
    },

    // ── Indicadores ─────────────────────────────────────────
    indicadores: {
        listar:    ()      => req('GET',    '/api/indicadores/'),
        obter:     (id)    => req('GET',    `/api/indicadores/${id}`),
        criar:     (d)     => req('POST',   '/api/indicadores/', d),
        atualizar: (id, d) => req('PUT',    `/api/indicadores/${id}`, d),
        deletar:   (id)    => req('DELETE', `/api/indicadores/${id}`),
    },
};
