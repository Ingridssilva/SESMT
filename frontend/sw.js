/**
 * sw.js — Service Worker SESMT
 * Ao instalar: limpa TODOS os caches antigos antes de qualquer coisa.
 *
 * ⚠️  A CADA DEPLOY que altere JS ou CSS:
 *     Atualize DEPLOY_DATE abaixo para a data do dia (formato YYYYMMDD).
 *     Isso força todos os browsers a baixar os arquivos novos.
 *     Sem isso, usuários ficam com JS/CSS antigo em cache.
 */

// 👇 ALTERAR AQUI A CADA DEPLOY
const DEPLOY_DATE   = '20260626';

const CACHE_NAME     = `sesmt-v16-${DEPLOY_DATE}`;
const CACHE_LOOKUPS  = `sesmt-lookups-v3-${DEPLOY_DATE}`;
const CACHES_VALIDOS = new Set([CACHE_NAME, CACHE_LOOKUPS]);

const ASSETS_ESTATICOS = [
    '/',
    '/index.html',
    '/css/main.css',
    '/js/api.js',
    '/js/ui.js',
    '/js/offline.js',
    '/js/signature.js',
    '/js/chart.umd.js',
    '/pages/dashboard.js',
    '/pages/inspecoes.js',
    '/pages/lideranca.js',
    '/pages/ncs.js',
    '/pages/acoes.js',
    '/pages/checklists.js',
    '/pages/colaboradores.js',
    '/pages/indicadores.js',
    '/manifest.json',
];

const LOOKUP_URLS = [
    '/api/lookup/municipios',
    '/api/lookup/contratos',
    '/api/lookup/usuarios',
    '/api/checklists/modelos?tipo=campo',
    '/api/checklists/modelos?tipo=lideranca',
];

// ── Instalar: skipWaiting + limpar caches antigos + cachear assets ──
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => !CACHES_VALIDOS.has(k)).map(k => caches.delete(k))
            ))
            .then(() => caches.open(CACHE_NAME))
            .then(cache => Promise.allSettled(
                ASSETS_ESTATICOS.map(url => cache.add(url).catch(() => {}))
            ))
    );
});

// ── Ativar: assumir controle imediato ──
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => !CACHES_VALIDOS.has(k)).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Mensagens ──
self.addEventListener('message', event => {
    if (event.data?.tipo === 'skip-waiting') self.skipWaiting();
});

// ── Background Sync ──
self.addEventListener('sync', event => {
    if (event.tag === 'sesmt-sync') {
        event.waitUntil(
            self.clients.matchAll({ type: 'window' }).then(clients =>
                clients.forEach(c => c.postMessage({ tipo: 'background-sync' }))
            )
        );
    }
});

// ── Fetch ──
self.addEventListener('fetch', event => {
    if (!event.request.url.startsWith('http')) return;
    const url    = new URL(event.request.url);
    const path   = url.pathname + url.search;
    const method = event.request.method;

    if (method !== 'GET') return;

    // Ignorar requests para origens externas (CDNs, APIs de terceiros).
    // O SW só gerencia recursos do próprio servidor.
    if (url.origin !== self.location.origin) return;

    // Lookups: stale-while-revalidate
    const isLookup = LOOKUP_URLS.some(u => path.startsWith(u.split('?')[0]) || path === u);
    if (isLookup) {
        event.respondWith(_staleWhileRevalidate(event.request, CACHE_LOOKUPS));
        return;
    }

    // API: network-first
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() =>
                new Response(
                    JSON.stringify({ erro: 'Sem conexão' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                )
            )
        );
        return;
    }

    // Assets estáticos: network-first (garante sempre pegar versão nova do servidor)
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request)
                .then(cached => cached || caches.match('/index.html'))
            )
    );
});

async function _staleWhileRevalidate(request, cacheName) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(request);
    const networkPromise = fetch(request).then(resp => {
        if (resp.ok) cache.put(request, resp.clone());
        return resp;
    }).catch(() => null);
    return cached || networkPromise;
}
