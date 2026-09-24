/**
 * offline.js — Gerenciamento completo de dados offline
 * SESMT Empresa Exemplo
 *
 * Stores no IndexedDB (DB_VERSION 3):
 *   preenchimentos  — checklists preenchidos (pendentes, synced)
 *   inspecoes       — inspeções de campo
 *   lideranca       — inspeções de liderança
 *   fotos           — fotos de itens (base64), associadas a preenchimento+item
 *   refs            — cache de dados de referência (municípios, contratos,
 *                     usuários, modelos de checklist)
 *
 * Fluxo geral:
 *   1. Usuário salva qualquer entidade
 *   2. Se online → tenta API; se falhar ou offline → salva no store com status='pending'
 *   3. Ao reconectar (evento 'online' ou Background Sync):
 *      sync() → inspeções → liderança → checklists → fotos (ordem garante FKs)
 *   4. Badge na sidebar mostra total de pendentes em todas as stores
 */

const DB_NAME    = 'sesmt_offline';
const DB_VERSION = 3;

const STORES = {
    PREENCHIMENTOS: 'preenchimentos',
    INSPECOES:      'inspecoes',
    LIDERANCA:      'lideranca',
    FOTOS:          'fotos',
    REFS:           'refs',
};

// ── Abrir / migrar banco ──────────────────────────────────────
function abrirDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = e => {
            const db  = e.target.result;
            const old = e.oldVersion;

            // Store: preenchimentos (checklists)
            if (!db.objectStoreNames.contains(STORES.PREENCHIMENTOS)) {
                const s = db.createObjectStore(STORES.PREENCHIMENTOS, { keyPath: 'local_id' });
                s.createIndex('status',      'status',      { unique: false });
                s.createIndex('inspecao_id', 'inspecao_id', { unique: false });
                s.createIndex('lideranca_id','lideranca_id',{ unique: false });
                s.createIndex('created_at',  'created_at',  { unique: false });
            }

            // Store: inspecoes de campo
            if (!db.objectStoreNames.contains(STORES.INSPECOES)) {
                const s = db.createObjectStore(STORES.INSPECOES, { keyPath: 'local_id' });
                s.createIndex('status',     'status',     { unique: false });
                s.createIndex('created_at', 'created_at', { unique: false });
            }

            // Store: inspeções de liderança
            if (!db.objectStoreNames.contains(STORES.LIDERANCA)) {
                const s = db.createObjectStore(STORES.LIDERANCA, { keyPath: 'local_id' });
                s.createIndex('status',     'status',     { unique: false });
                s.createIndex('created_at', 'created_at', { unique: false });
            }

            // Store: fotos (base64 + metadados)
            if (!db.objectStoreNames.contains(STORES.FOTOS)) {
                const s = db.createObjectStore(STORES.FOTOS, { keyPath: 'foto_id' });
                s.createIndex('status',           'status',           { unique: false });
                s.createIndex('prench_local_id',  'prench_local_id',  { unique: false });
            }

            // Store: dados de referência (municípios, contratos, usuários, modelos)
            if (!db.objectStoreNames.contains(STORES.REFS)) {
                db.createObjectStore(STORES.REFS, { keyPath: 'chave' });
            }
        };

        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

// ── Helpers genéricos de store ────────────────────────────────
async function _put(storeName, registro) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).put(registro);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = e => reject(e.target.error);
    });
}

async function _getAll(storeName) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

async function _getByIndex(storeName, indexName, value) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx    = db.transaction(storeName, 'readonly');
        const index = tx.objectStore(storeName).index(indexName);
        const req   = index.getAll(value);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

async function _countByIndex(storeName, indexName, value) {
    const db = await abrirDB();
    return new Promise(resolve => {
        const tx    = db.transaction(storeName, 'readonly');
        const index = tx.objectStore(storeName).index(indexName);
        const req   = index.count(value);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = ()  => resolve(0);
    });
}

async function _delete(storeName, key) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).delete(key);
        req.onsuccess = () => resolve();
        req.onerror   = e => reject(e.target.error);
    });
}

async function _update(storeName, key, changes) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx    = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req   = store.get(key);
        req.onsuccess = e => {
            const rec = e.target.result;
            if (!rec) { resolve(); return; }
            Object.assign(rec, changes);
            store.put(rec).onsuccess = () => resolve();
        };
        req.onerror = e => reject(e.target.error);
    });
}

// ── Gerador de ID local ───────────────────────────────────────
export function gerarLocalId() {
    return 'local_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

// ═══════════════════════════════════════════════════════════════
// INSPEÇÕES DE CAMPO
// ═══════════════════════════════════════════════════════════════

export async function salvarInspecaoOffline(dados) {
    const registro = {
        ...dados,
        local_id:   dados.local_id   || gerarLocalId(),
        status:     'pending',
        created_at: dados.created_at || new Date().toISOString(),
    };
    await _put(STORES.INSPECOES, registro);
    atualizarBadge();
    return registro.local_id;
}

export async function listarInspecoesPendentes() {
    return _getByIndex(STORES.INSPECOES, 'status', 'pending');
}

export async function listarInspecoesOffline() {
    const todos = await _getAll(STORES.INSPECOES);
    return todos.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function deletarInspecaoOffline(local_id) {
    // Deletar também os checklists e fotos vinculados
    const prenchs = await _getByIndex(STORES.PREENCHIMENTOS, 'inspecao_id', local_id);
    for (const p of prenchs) {
        await _deletarPreenchimentoEFotos(p.local_id);
    }
    await _delete(STORES.INSPECOES, local_id);
    atualizarBadge();
}

// ═══════════════════════════════════════════════════════════════
// INSPEÇÕES DE LIDERANÇA
// ═══════════════════════════════════════════════════════════════

export async function salvarLiderancaOffline(dados) {
    const registro = {
        ...dados,
        local_id:   dados.local_id   || gerarLocalId(),
        status:     'pending',
        created_at: dados.created_at || new Date().toISOString(),
    };
    await _put(STORES.LIDERANCA, registro);
    atualizarBadge();
    return registro.local_id;
}

export async function listarLiderancaPendentes() {
    return _getByIndex(STORES.LIDERANCA, 'status', 'pending');
}

export async function listarLiderancaOffline() {
    const todos = await _getAll(STORES.LIDERANCA);
    return todos.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function deletarLiderancaOffline(local_id) {
    const prenchs = await _getByIndex(STORES.PREENCHIMENTOS, 'lideranca_id', local_id);
    for (const p of prenchs) {
        await _deletarPreenchimentoEFotos(p.local_id);
    }
    await _delete(STORES.LIDERANCA, local_id);
    atualizarBadge();
}

// ═══════════════════════════════════════════════════════════════
// PREENCHIMENTOS DE CHECKLIST (já existia, expandido)
// ═══════════════════════════════════════════════════════════════

export async function salvarOffline(dados) {
    const registro = {
        ...dados,
        local_id:   dados.local_id   || gerarLocalId(),
        status:     'pending',
        created_at: dados.created_at || new Date().toISOString(),
    };
    await _put(STORES.PREENCHIMENTOS, registro);
    atualizarBadge();
    return registro.local_id;
}

export async function listarPendentes() {
    return _getByIndex(STORES.PREENCHIMENTOS, 'status', 'pending');
}

export async function listarTodos() {
    const todos = await _getAll(STORES.PREENCHIMENTOS);
    return todos.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function _deletarPreenchimentoEFotos(local_id) {
    const fotos = await _getByIndex(STORES.FOTOS, 'prench_local_id', local_id);
    for (const f of fotos) await _delete(STORES.FOTOS, f.foto_id);
    await _delete(STORES.PREENCHIMENTOS, local_id);
}

export async function deletarOffline(local_id) {
    await _deletarPreenchimentoEFotos(local_id);
    atualizarBadge();
}

// ═══════════════════════════════════════════════════════════════
// FOTOS OFFLINE
// ═══════════════════════════════════════════════════════════════

/**
 * Salva uma foto offline para ser enviada junto com o preenchimento.
 *
 * @param {string} prench_local_id  - local_id do preenchimento ao qual pertence
 * @param {number} item_id          - id do item do checklist
 * @param {string} filename         - nome original do arquivo (ex: "item42.jpg")
 * @param {string} base64           - conteúdo da foto em base64 (sem prefixo data:)
 */
export async function salvarFotoOffline(prench_local_id, item_id, filename, base64) {
    const foto_id = `foto_${prench_local_id}_${item_id}`;
    await _put(STORES.FOTOS, {
        foto_id,
        prench_local_id,
        item_id,
        filename,
        base64,
        status:     'pending',
        created_at: new Date().toISOString(),
    });
}

export async function listarFotosPendentes() {
    return _getByIndex(STORES.FOTOS, 'status', 'pending');
}

// ═══════════════════════════════════════════════════════════════
// CACHE DE REFERÊNCIAS (municípios, contratos, usuários, modelos)
// ═══════════════════════════════════════════════════════════════

const REFS_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

export async function salvarRef(chave, dados) {
    await _put(STORES.REFS, {
        chave,
        dados,
        salvo_em: Date.now(),
    });
}

export async function obterRef(chave) {
    const db = await abrirDB();
    return new Promise(resolve => {
        const tx  = db.transaction(STORES.REFS, 'readonly');
        const req = tx.objectStore(STORES.REFS).get(chave);
        req.onsuccess = e => {
            const rec = e.target.result;
            if (!rec) { resolve(null); return; }
            // Expirado?
            if (Date.now() - rec.salvo_em > REFS_TTL_MS) { resolve(null); return; }
            resolve(rec.dados);
        };
        req.onerror = () => resolve(null);
    });
}

/**
 * Busca dado de referência com fallback para cache offline.
 * Se online e o fetch der certo, atualiza o cache.
 * Se offline ou fetch falhar, usa o cache (mesmo expirado).
 */
export async function refComCache(chave, fetchFn) {
    if (navigator.onLine) {
        try {
            const dados = await fetchFn();
            await salvarRef(chave, dados);
            return dados;
        } catch (_) {
            // falhou online → tenta cache
        }
    }
    // Offline ou falha: usa cache (ignora TTL — melhor dados velhos que nenhum)
    const db = await abrirDB();
    return new Promise(resolve => {
        const tx  = db.transaction(STORES.REFS, 'readonly');
        const req = tx.objectStore(STORES.REFS).get(chave);
        req.onsuccess = e => resolve(e.target.result?.dados ?? []);
        req.onerror   = () => resolve([]);
    });
}

// ── Pre-carregar todas as refs ao abrir o app (quando online) ─
export async function preCarregarRefs() {
    if (!navigator.onLine) return;
    const endpoints = [
        { chave: 'municipios', url: '/api/lookup/municipios' },
        { chave: 'contratos',  url: '/api/lookup/contratos'  },
        { chave: 'usuarios',   url: '/api/lookup/usuarios'   },
    ];
    await Promise.allSettled(endpoints.map(async ({ chave, url }) => {
        try {
            const r = await fetch(url, { credentials: 'same-origin' });
            if (r.ok) await salvarRef(chave, await r.json());
        } catch (_) {}
    }));

    // Modelos de checklist (campo e liderança separados)
    try {
        const [campo, lid] = await Promise.all([
            fetch('/api/checklists/modelos?tipo=campo',     { credentials: 'same-origin' }).then(r => r.json()),
            fetch('/api/checklists/modelos?tipo=lideranca', { credentials: 'same-origin' }).then(r => r.json()),
        ]);
        await salvarRef('modelos_campo',     campo);
        await salvarRef('modelos_lideranca', lid);
    } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════
// SYNC ENGINE — processa pendentes em ordem correta
// ═══════════════════════════════════════════════════════════════

let _syncEmAndamento = false;

/**
 * Sincroniza todos os dados pendentes com o backend.
 *
 * Ordem obrigatória: inspeções → lideranças → checklists → fotos
 * (checklists referenciam inspeções/lideranças via server_id)
 *
 * Retorna { enviados, erros, detalhes }
 */
export async function sync() {
    if (!navigator.onLine)     return { enviados: 0, erros: 0 };
    if (_syncEmAndamento)      return { enviados: 0, erros: 0 };
    _syncEmAndamento = true;

    const resultado = { enviados: 0, erros: 0, detalhes: [] };

    try {
        // 1. Inspeções de campo
        await _syncInspecoes(resultado);

        // 2. Inspeções de liderança
        await _syncLideranca(resultado);

        // 3. Checklists (agora os server_ids de inspeção/liderança estão disponíveis)
        await _syncChecklists(resultado);

        // 4. Fotos
        await _syncFotos(resultado);

    } catch (e) {
        console.error('[Sync] Erro geral:', e);
    } finally {
        _syncEmAndamento = false;
        atualizarBadge();
    }
    return resultado;
}

async function _syncInspecoes(resultado) {
    const pendentes = await listarInspecoesPendentes();
    for (const reg of pendentes) {
        try {
            const { local_id, status, created_at: _ca, server_id: _si, ...payload } = reg;
            // Remover campos de controle — não enviar ao backend
            const resp = await fetch('/api/inspecoes/', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ ...payload, local_id }),
            });
            if (resp.ok) {
                const data = await resp.json();
                await _update(STORES.INSPECOES, local_id, {
                    status:     'synced',
                    server_id:  data.id,
                    synced_at:  new Date().toISOString(),
                });
                resultado.enviados++;
                resultado.detalhes.push({ tipo: 'inspecao', local_id, server_id: data.id });

                // Atualizar checklists vinculados: trocar local_id pelo server_id real
                const prenchs = await _getByIndex(STORES.PREENCHIMENTOS, 'inspecao_id', local_id);
                for (const p of prenchs) {
                    await _update(STORES.PREENCHIMENTOS, p.local_id, { inspecao_id: data.id });
                }
            } else {
                resultado.erros++;
                console.warn('[Sync] Inspeção falhou:', local_id, await resp.text());
            }
        } catch (e) {
            resultado.erros++;
            console.warn('[Sync] Inspeção erro:', reg.local_id, e.message);
        }
    }
}

async function _syncLideranca(resultado) {
    const pendentes = await listarLiderancaPendentes();
    for (const reg of pendentes) {
        try {
            const { local_id, status, created_at: _ca, server_id: _si, ...payload } = reg;
            const resp = await fetch('/api/lideranca/', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ ...payload, local_id }),
            });
            if (resp.ok) {
                const data = await resp.json();
                await _update(STORES.LIDERANCA, local_id, {
                    status:    'synced',
                    server_id: data.id,
                    synced_at: new Date().toISOString(),
                });
                resultado.enviados++;
                resultado.detalhes.push({ tipo: 'lideranca', local_id, server_id: data.id });

                const prenchs = await _getByIndex(STORES.PREENCHIMENTOS, 'lideranca_id', local_id);
                for (const p of prenchs) {
                    await _update(STORES.PREENCHIMENTOS, p.local_id, { lideranca_id: data.id });
                }
            } else {
                resultado.erros++;
                console.warn('[Sync] Liderança falhou:', local_id, await resp.text());
            }
        } catch (e) {
            resultado.erros++;
            console.warn('[Sync] Liderança erro:', reg.local_id, e.message);
        }
    }
}

async function _syncChecklists(resultado) {
    const pendentes = await listarPendentes();
    if (pendentes.length === 0) return;

    for (const reg of pendentes) {
        try {
            const { local_id, status, created_at: _ca, server_id: _si, ...payload } = reg;
            payload.local_id = local_id;

            const resp = await fetch('/api/checklists/preenchimentos', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload),
            });
            if (resp.ok) {
                const data = await resp.json();
                await _update(STORES.PREENCHIMENTOS, local_id, {
                    status:    'synced',
                    server_id: data.id,
                    synced_at: new Date().toISOString(),
                });
                resultado.enviados++;
                resultado.detalhes.push({ tipo: 'checklist', local_id, server_id: data.id });

                // Atualizar fotos vinculadas com o server_id real
                const fotos = await _getByIndex(STORES.FOTOS, 'prench_local_id', local_id);
                for (const f of fotos) {
                    await _update(STORES.FOTOS, f.foto_id, { server_prench_id: data.id });
                }
            } else {
                resultado.erros++;
                console.warn('[Sync] Checklist falhou:', local_id, await resp.text());
            }
        } catch (e) {
            resultado.erros++;
            console.warn('[Sync] Checklist erro:', reg.local_id, e.message);
        }
    }
}

async function _syncFotos(resultado) {
    const pendentes = await listarFotosPendentes();
    for (const foto of pendentes) {
        try {
            // Usar server_id se já sincronizado, senão o local_id
            const preenchimento_id = foto.server_prench_id || foto.prench_local_id;
            // Só enviar se o preenchimento já tem server_id (número inteiro)
            if (typeof preenchimento_id !== 'number') {
                // Preenchimento pai ainda não sincronizou, pular por agora
                continue;
            }
            const resp = await fetch('/api/checklists/foto', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    preenchimento_id,
                    item_id:  foto.item_id,
                    filename: foto.filename,
                    base64:   foto.base64,
                }),
            });
            if (resp.ok) {
                await _update(STORES.FOTOS, foto.foto_id, {
                    status:    'synced',
                    synced_at: new Date().toISOString(),
                });
                resultado.enviados++;
                resultado.detalhes.push({ tipo: 'foto', foto_id: foto.foto_id });
            } else {
                resultado.erros++;
                console.warn('[Sync] Foto falhou:', foto.foto_id, await resp.text());
            }
        } catch (e) {
            resultado.erros++;
            console.warn('[Sync] Foto erro:', foto.foto_id, e.message);
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// CONTAGEM TOTAL DE PENDENTES (todas as stores)
// ═══════════════════════════════════════════════════════════════

export async function contarPendentes() {
    const [prench, insp, lid, fotos] = await Promise.all([
        _countByIndex(STORES.PREENCHIMENTOS, 'status', 'pending'),
        _countByIndex(STORES.INSPECOES,      'status', 'pending'),
        _countByIndex(STORES.LIDERANCA,      'status', 'pending'),
        _countByIndex(STORES.FOTOS,          'status', 'pending'),
    ]);
    return prench + insp + lid + fotos;
}

// ═══════════════════════════════════════════════════════════════
// UI — BADGE E BANNER
// ═══════════════════════════════════════════════════════════════

export async function atualizarBadge() {
    const n = await contarPendentes();
    let badge = document.getElementById('offline-badge');

    if (n === 0) { if (badge) badge.remove(); return; }

    if (!badge) {
        badge = document.createElement('span');
        badge.id = 'offline-badge';
        badge.style.cssText = `
            display:inline-flex;align-items:center;justify-content:center;
            background:var(--laranja);color:#fff;
            font-size:10px;font-weight:700;
            min-width:18px;height:18px;border-radius:9px;padding:0 3px;
            margin-left:auto;
        `;
        const link = document.querySelector('.nav-link[data-page="inspecoes"]');
        if (link) link.appendChild(badge);
    }
    badge.textContent = n > 99 ? '99+' : String(n);
}

let _bannerTimer = null;

function mostrarBanner(texto, tipo = 'info', duracao = 4000) {
    let banner = document.getElementById('conn-status');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'conn-status';
        banner.style.cssText = `
            position:fixed;bottom:16px;left:calc(var(--sidebar-w, 230px) + 16px);
            max-width:340px;
            font-size:12px;font-weight:700;
            padding:8px 16px;border-radius:20px;
            opacity:0;transition:opacity .3s;
            z-index:9999;pointer-events:none;
        `;
        document.body.appendChild(banner);
    }
    const bg = tipo === 'sucesso' ? 'var(--verde)'
             : tipo === 'erro'   ? 'var(--vermelho)'
             : tipo === 'aviso'  ? '#555'
             : 'var(--verde)';
    banner.style.background = bg;
    banner.style.color      = '#fff';
    banner.textContent      = texto;
    banner.style.opacity    = '1';

    clearTimeout(_bannerTimer);
    if (duracao > 0) {
        _bannerTimer = setTimeout(() => { banner.style.opacity = '0'; }, duracao);
    }
}

// ═══════════════════════════════════════════════════════════════
// MONITOR DE CONEXÃO — inicia uma vez no carregamento do app
// ═══════════════════════════════════════════════════════════════

export function iniciarMonitorConexao() {
    window.addEventListener('online', async () => {
        mostrarBanner('🌐 Online — sincronizando dados...', 'info', 0);
        const { enviados, erros } = await sync();
        if (enviados > 0 && erros === 0) {
            mostrarBanner(`✅ ${enviados} registro(s) sincronizado(s)`, 'sucesso', 5000);
        } else if (enviados > 0 && erros > 0) {
            mostrarBanner(`⚠️ ${enviados} sincronizados, ${erros} com erro`, 'aviso', 6000);
        } else if (erros > 0) {
            mostrarBanner(`❌ ${erros} registro(s) com erro na sync`, 'erro', 6000);
        } else {
            mostrarBanner('🌐 Online', 'info', 2000);
        }
    });

    window.addEventListener('offline', () => {
        mostrarBanner('📵 Offline — dados serão salvos localmente', 'aviso', 4000);
    });

    atualizarBadge();

    // Sync silencioso ao abrir app (em caso de dados pendentes de sessão anterior)
    if (navigator.onLine) {
        setTimeout(async () => {
            const { enviados } = await sync();
            if (enviados > 0) {
                mostrarBanner(`✅ ${enviados} registro(s) sincronizado(s)`, 'sucesso', 5000);
            }
        }, 2500);

        // Pré-carregar referências para uso offline
        setTimeout(preCarregarRefs, 4000);
    }
}

// ── Compatibilidade / utilitários exportados ──────────────────
export function estaOnline() { return navigator.onLine; }
