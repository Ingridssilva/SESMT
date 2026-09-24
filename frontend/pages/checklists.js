/**
 * pages/checklists.js — Administração de Modelos de Checklist
 * SESMT Empresa Exemplo
 *
 * Tabs:
 *   [Modelos]       — lista / cria / edita / desativa modelos (checklist_modelos)
 *   [Preenchimentos]— visão global de todos os preenchimentos realizados
 *
 * Cada modelo expande para mostrar suas seções e itens.
 * Permite adicionar/editar/remover seções e itens inline.
 */

import { toast, loading, confirm, fmt } from '../js/ui.js';

// ── API helpers ───────────────────────────────────────────────────────────────

const api = {
    // Modelos
    modelos:       (tipo)  => _req('GET', `/api/checklists/modelos${tipo ? '?tipo='+tipo : ''}`),
    modeloDetalhe: (id)    => _req('GET', `/api/checklists/modelo/${id}`),
    criarModelo:   (d)     => _req('POST',  '/api/admin/checklists/modelos', d),
    atualizarModelo:(id,d) => _req('PUT',   `/api/admin/checklists/modelos/${id}`, d),
    deletarModelo:  (id)   => _req('DELETE',`/api/admin/checklists/modelos/${id}`),
    // Seções
    criarSecao:    (d)     => _req('POST',  '/api/admin/checklists/secoes', d),
    atualizarSecao:(id,d)  => _req('PUT',   `/api/admin/checklists/secoes/${id}`, d),
    deletarSecao:  (id)    => _req('DELETE',`/api/admin/checklists/secoes/${id}`),
    // Itens
    criarItem:     (d)     => _req('POST',  '/api/admin/checklists/itens', d),
    atualizarItem: (id,d)  => _req('PUT',   `/api/admin/checklists/itens/${id}`, d),
    deletarItem:   (id)    => _req('DELETE',`/api/admin/checklists/itens/${id}`),
    // Preenchimentos globais
    preenchimentos:(p={})  => _req('GET', '/api/checklists/preenchimentos?' + new URLSearchParams(p)),
};

async function _req(method, path, body = null) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
    };
    const token = window._msalToken || '';
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body !== null) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const json = await res.json();
    if (!res.ok) throw new Error(json.erro || `Erro ${res.status}`);
    return json;
}

// ── Estado da página ──────────────────────────────────────────────────────────

let _tabAtual = 'modelos';
let _container, _actions, _navigate;

// ── Entry point ───────────────────────────────────────────────────────────────

export async function renderChecklists(container, actions, navigate) {
    _container = container;
    _actions   = actions;
    _navigate  = navigate;

    actions.innerHTML = `
        <button class="btn btn-primary" id="btn-novo-modelo">+ Novo Modelo</button>
        <a href="/api/exportar/checklists" class="btn btn-outline btn-sm" download title="Exportar CSV">📥 CSV</a>
    `;
    document.getElementById('btn-novo-modelo').onclick = () => abrirFormModelo(null);

    renderShell();
    await carregarAba(_tabAtual);
}

// ── Shell com tabs ─────────────────────────────────────────────────────────────

function renderShell() {
    _container.innerHTML = `
    <div style="max-width:1100px">

        <!-- Tabs -->
        <div style="display:flex;gap:4px;border-bottom:2px solid var(--cinza2);margin-bottom:24px">
            <button class="tab-btn ${_tabAtual==='modelos'?'tab-ativa':''}" data-tab="modelos"
                style="padding:10px 22px;border:none;background:none;cursor:pointer;font-size:13px;
                       font-weight:600;font-family:inherit;color:${_tabAtual==='modelos'?'var(--laranja)':'var(--cinza4)'};
                       border-bottom:3px solid ${_tabAtual==='modelos'?'var(--laranja)':'transparent'};
                       margin-bottom:-2px;transition:all .15s">
                📋 Modelos
            </button>
            <button class="tab-btn ${_tabAtual==='preenchimentos'?'tab-ativa':''}" data-tab="preenchimentos"
                style="padding:10px 22px;border:none;background:none;cursor:pointer;font-size:13px;
                       font-weight:600;font-family:inherit;color:${_tabAtual==='preenchimentos'?'var(--laranja)':'var(--cinza4)'};
                       border-bottom:3px solid ${_tabAtual==='preenchimentos'?'var(--laranja)':'transparent'};
                       margin-bottom:-2px;transition:all .15s">
                📝 Preenchimentos
            </button>
        </div>

        <!-- Conteúdo da aba -->
        <div id="aba-content">
            <div class="spinner" style="margin:60px auto"></div>
        </div>

    </div>`;

    _container.querySelectorAll('.tab-btn').forEach(b => {
        b.onclick = async () => {
            _tabAtual = b.dataset.tab;
            renderShell();
            await carregarAba(_tabAtual);
        };
    });
}

async function carregarAba(tab) {
    if (tab === 'modelos')        await renderModelos();
    else if (tab === 'preenchimentos') await renderPreenchimentos();
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA MODELOS
// ══════════════════════════════════════════════════════════════════════════════

async function renderModelos() {
    const el = document.getElementById('aba-content');
    loading(true);
    let modelos = [];
    try {
        modelos = await api.modelos();
        if (!Array.isArray(modelos)) modelos = [];
    } catch(e) {
        loading(false);
        el.innerHTML = erroBox(e.message);
        return;
    }
    loading(false);

    if (modelos.length === 0) {
        el.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:var(--cinza3)">
            <div style="font-size:48px;margin-bottom:16px">📋</div>
            <div style="font-size:16px;font-weight:700;color:var(--cinza4);margin-bottom:8px">Nenhum modelo cadastrado</div>
            <div style="font-size:13px;margin-bottom:24px">Crie o primeiro modelo de checklist para começar as avaliações.</div>
            <button class="btn btn-primary" id="btn-primeiro-modelo">+ Criar Primeiro Modelo</button>
        </div>`;
        el.querySelector('#btn-primeiro-modelo').onclick = () => abrirFormModelo(null);
        return;
    }

    el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px" id="lista-modelos">
        ${modelos.map(m => cardModelo(m)).join('')}
    </div>`;

    // Expandir/colapsar
    el.querySelectorAll('[data-expand]').forEach(b => {
        b.onclick = () => toggleExpand(b.dataset.expand);
    });
    // Editar modelo
    el.querySelectorAll('[data-edit-modelo]').forEach(b => {
        b.onclick = () => abrirFormModelo(parseInt(b.dataset.editModelo));
    });
    // Desativar modelo
    el.querySelectorAll('[data-toggle-modelo]').forEach(b => {
        b.onclick = () => toggleAtivo(parseInt(b.dataset.toggleModelo), b.dataset.ativo === 'true');
    });
}

function cardModelo(m) {
    const ativo = m.ativo !== false;
    const tipoLabel = { campo: 'Campo', lideranca: 'Liderança', ambos: 'Campo + Liderança' };
    return `
    <div class="card" style="margin:0;opacity:${ativo ? 1 : 0.6}">
        <!-- Cabeçalho do card -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    <span style="font-weight:800;font-size:15px;color:var(--azul2)">${esc(m.codigo)}</span>
                    <span style="font-size:12px;background:var(--cinza1);color:var(--cinza4);
                                 border-radius:6px;padding:2px 10px;font-weight:600">${tipoLabel[m.tipo] || m.tipo}</span>
                    ${!ativo ? '<span style="font-size:11px;background:#FADBD8;color:#922B21;border-radius:6px;padding:2px 8px;font-weight:700">INATIVO</span>' : ''}
                </div>
                <div style="font-size:14px;font-weight:700;color:var(--texto);margin-top:4px">${esc(m.titulo)}</div>
                ${m.descricao ? `<div style="font-size:12px;color:var(--cinza4);margin-top:2px">${esc(m.descricao)}</div>` : ''}
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" data-expand="${m.id}">🔍 Ver estrutura</button>
                <button class="btn btn-outline btn-sm" data-edit-modelo="${m.id}">✏️ Editar</button>
                <button class="btn btn-${ativo ? 'danger' : 'success'} btn-sm"
                        data-toggle-modelo="${m.id}" data-ativo="${ativo}">
                    ${ativo ? '🚫 Desativar' : '✅ Ativar'}
                </button>
            </div>
        </div>

        <!-- Estrutura expandida (carregada sob demanda) -->
        <div id="expand-${m.id}" style="display:none;margin-top:20px;border-top:1.5px solid var(--cinza2);padding-top:16px">
            <div class="spinner" style="margin:20px auto;width:24px;height:24px;border-width:2px"></div>
        </div>
    </div>`;
}

async function toggleExpand(modeloId) {
    const div = document.getElementById(`expand-${modeloId}`);
    if (!div) return;

    if (div.style.display !== 'none') {
        div.style.display = 'none';
        return;
    }

    div.style.display = 'block';

    // Já carregou?
    if (div.dataset.loaded === '1') return;
    div.dataset.loaded = '1';

    try {
        const modelo = await api.modeloDetalhe(modeloId);
        const secoes = modelo.secoes || [];

        div.innerHTML = `
        <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                <span style="font-size:13px;font-weight:700;color:var(--cinza4)">
                    ${secoes.length} seção(ões) · ${secoes.reduce((a,s)=>a+(s.itens||[]).length,0)} item(ns)
                </span>
                <button class="btn btn-primary btn-sm" id="btn-add-sec-${modeloId}">+ Seção</button>
            </div>

            <div id="secoes-${modeloId}" style="display:flex;flex-direction:column;gap:12px">
                ${secoes.length === 0
                    ? `<div style="text-align:center;padding:20px;color:var(--cinza3);font-size:13px;
                                  border:1.5px dashed var(--cinza2);border-radius:8px">
                         Nenhuma seção cadastrada. Clique em <strong>+ Seção</strong> para adicionar.
                       </div>`
                    : secoes.map(s => htmlSecao(s, modeloId)).join('')
                }
            </div>
        </div>`;

        div.querySelector(`#btn-add-sec-${modeloId}`).onclick =
            () => abrirFormSecao(null, modeloId);

        bindSecaoItens(div, modeloId);

    } catch(e) {
        div.innerHTML = erroBox(e.message);
    }
}

function htmlSecao(s, modeloId) {
    const itens = s.itens || [];
    return `
    <div class="secao-bloco" id="secao-${s.id}"
         style="border:1.5px solid var(--cinza2);border-radius:10px;overflow:hidden">
        <!-- Header da seção -->
        <div style="background:var(--cinza1);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <div>
                <span style="font-weight:700;font-size:13px;color:var(--texto)">${esc(s.titulo)}</span>
                <span style="font-size:11px;color:var(--cinza4);margin-left:8px">${itens.length} item(ns)</span>
            </div>
            <div style="display:flex;gap:6px">
                <button class="btn btn-outline btn-sm btn-add-item" data-secao="${s.id}" data-modelo="${modeloId}">+ Item</button>
                <button class="btn btn-outline btn-sm btn-edit-sec" data-secao="${s.id}" data-modelo="${modeloId}"
                        data-titulo="${esc(s.titulo)}" data-ordem="${s.ordem}">✏️</button>
                <button class="btn btn-danger btn-sm btn-del-sec" data-secao="${s.id}" data-modelo="${modeloId}">🗑</button>
            </div>
        </div>

        <!-- Itens da seção -->
        <div id="itens-${s.id}" style="padding:10px 16px;display:flex;flex-direction:column;gap:6px">
            ${itens.length === 0
                ? `<div style="text-align:center;padding:12px;color:var(--cinza3);font-size:12px">
                     Nenhum item. Clique em <strong>+ Item</strong> para adicionar.
                   </div>`
                : itens.map(i => htmlItem(i, s.id)).join('')
            }
        </div>
    </div>`;
}

function htmlItem(i, secaoId) {
    return `
    <div id="item-${i.id}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;
                                   background:#fff;border:1px solid var(--cinza2);border-radius:8px;flex-wrap:wrap">
        <span style="flex:1;min-width:140px;font-size:13px;color:var(--texto)">${esc(i.descricao)}</span>
        <span style="font-size:11px;color:var(--cinza3)">Ordem ${i.ordem}</span>
        ${i.tem_quant ? '<span style="font-size:10px;background:#E8F0FD;color:#1B3D8A;border-radius:4px;padding:2px 7px">QTD</span>' : ''}
        <div style="display:flex;gap:4px;margin-left:auto">
            <button class="btn btn-outline btn-sm btn-edit-item"
                data-item="${i.id}" data-secao="${secaoId}"
                data-descricao="${esc(i.descricao)}" data-ordem="${i.ordem}"
                data-temquant="${i.tem_quant}">✏️</button>
            <button class="btn btn-danger btn-sm btn-del-item" data-item="${i.id}" data-secao="${secaoId}">🗑</button>
        </div>
    </div>`;
}

function bindSecaoItens(scope, modeloId) {
    // Editar seção
    scope.querySelectorAll('.btn-edit-sec').forEach(b => {
        b.onclick = () => abrirFormSecao(
            { id: parseInt(b.dataset.secao), titulo: b.dataset.titulo, ordem: parseInt(b.dataset.ordem) },
            parseInt(b.dataset.modelo)
        );
    });
    // Deletar seção
    scope.querySelectorAll('.btn-del-sec').forEach(b => {
        b.onclick = () => deletarSecao(parseInt(b.dataset.secao), parseInt(b.dataset.modelo));
    });
    // Adicionar item
    scope.querySelectorAll('.btn-add-item').forEach(b => {
        b.onclick = () => abrirFormItem(null, parseInt(b.dataset.secao), parseInt(b.dataset.modelo));
    });
    // Editar item
    scope.querySelectorAll('.btn-edit-item').forEach(b => {
        b.onclick = () => abrirFormItem(
            { id: parseInt(b.dataset.item), descricao: b.dataset.descricao,
              ordem: parseInt(b.dataset.ordem), tem_quant: b.dataset.temquant === 'true' },
            parseInt(b.dataset.secao), parseInt(b.dataset.modelo)
        );
    });
    // Deletar item
    scope.querySelectorAll('.btn-del-item').forEach(b => {
        b.onclick = () => deletarItem(parseInt(b.dataset.item), parseInt(b.dataset.secao), parseInt(b.dataset.modelo));
    });
}

// ── Formulário de Modelo ───────────────────────────────────────────────────────

async function abrirFormModelo(id) {
    let dados = null;
    if (id) {
        loading(true);
        try { dados = await api.modeloDetalhe(id); } catch(e) { toast(e.message,'error'); }
        loading(false);
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="max-width:500px;width:100%">
        <h3 style="font-size:15px;font-weight:800;margin:0 0 18px;color:var(--texto)">
            ${id ? '✏️ Editar Modelo' : '📋 Novo Modelo de Checklist'}
        </h3>
        <div class="form-group">
            <label>Código *</label>
            <input class="form-control" id="fm-codigo" placeholder="Ex: CL-NR10-001" value="${esc(dados?.codigo||'')}">
        </div>
        <div class="form-group">
            <label>Título *</label>
            <input class="form-control" id="fm-titulo" placeholder="Nome do checklist" value="${esc(dados?.titulo||'')}">
        </div>
        <div class="form-group">
            <label>Descrição</label>
            <textarea class="form-control" id="fm-descricao" rows="2" placeholder="Objetivo / escopo (opcional)">${esc(dados?.descricao||'')}</textarea>
        </div>
        <div class="form-group">
            <label>Tipo de uso *</label>
            <select class="form-control" id="fm-tipo">
                <option value="campo"     ${dados?.tipo==='campo'    ?'selected':''}>Inspeção de Campo</option>
                <option value="lideranca" ${dados?.tipo==='lideranca'?'selected':''}>Inspeção de Liderança</option>
                <option value="ambos"     ${dados?.tipo==='ambos'    ?'selected':''}>Campo + Liderança</option>
            </select>
        </div>
        <div class="form-group">
            <label>Tipo de situação (opções de avaliação)</label>
            <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px" id="fm-situacoes">
                ${['BOM','CONFORME','RUIM','NÃO CONFORME','N/A'].map(s => `
                <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:400;cursor:pointer">
                    <input type="checkbox" value="${s}"
                        ${(dados?.tipo_situacao||['BOM','RUIM','N/A']).includes(s)?'checked':''}
                        style="width:15px;height:15px;accent-color:var(--laranja)">
                    ${s}
                </label>`).join('')}
            </div>
        </div>
        <div class="modal-btns" style="margin-top:20px">
            <button class="btn btn-primary" id="fm-salvar">💾 Salvar</button>
            <button class="btn btn-outline" id="fm-cancelar">Cancelar</button>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    overlay.querySelector('#fm-cancelar').onclick = () => overlay.remove();

    overlay.querySelector('#fm-salvar').onclick = async () => {
        const codigo    = overlay.querySelector('#fm-codigo').value.trim();
        const titulo    = overlay.querySelector('#fm-titulo').value.trim();
        const descricao = overlay.querySelector('#fm-descricao').value.trim();
        const tipo      = overlay.querySelector('#fm-tipo').value;
        const sitsEl    = overlay.querySelectorAll('#fm-situacoes input[type=checkbox]:checked');
        const tipo_situacao = Array.from(sitsEl).map(c => c.value);

        if (!codigo || !titulo) { toast('Preencha código e título','error'); return; }
        if (tipo_situacao.length === 0) { toast('Selecione ao menos uma opção de situação','error'); return; }

        loading(true);
        try {
            const payload = { codigo, titulo, descricao: descricao||null, tipo, tipo_situacao };
            if (id) await api.atualizarModelo(id, payload);
            else    await api.criarModelo(payload);
            toast(id ? 'Modelo atualizado!' : 'Modelo criado!');
            overlay.remove();
            await renderModelos();
        } catch(e) { toast(e.message,'error'); }
        loading(false);
    };
}

async function toggleAtivo(id, ativoAtual) {
    const acao = ativoAtual ? 'desativar' : 'ativar';
    if (!await confirm(`Deseja ${acao} este modelo?`)) return;
    loading(true);
    try {
        await api.atualizarModelo(id, { ativo: !ativoAtual });
        toast(`Modelo ${ativoAtual ? 'desativado' : 'ativado'}!`);
        await renderModelos();
    } catch(e) { toast(e.message,'error'); }
    loading(false);
}

// ── Formulário de Seção ────────────────────────────────────────────────────────

function abrirFormSecao(secao, modeloId) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px;width:100%">
        <h3 style="font-size:15px;font-weight:800;margin:0 0 18px;color:var(--texto)">
            ${secao ? '✏️ Editar Seção' : '➕ Nova Seção'}
        </h3>
        <div class="form-group">
            <label>Título da seção *</label>
            <input class="form-control" id="fs-titulo" placeholder="Ex: EPIs" value="${esc(secao?.titulo||'')}">
        </div>
        <div class="form-group">
            <label>Ordem</label>
            <input class="form-control" id="fs-ordem" type="number" min="1" value="${secao?.ordem||1}">
        </div>
        <div class="modal-btns" style="margin-top:20px">
            <button class="btn btn-primary" id="fs-salvar">💾 Salvar</button>
            <button class="btn btn-outline" id="fs-cancelar">Cancelar</button>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    overlay.querySelector('#fs-cancelar').onclick = () => overlay.remove();

    overlay.querySelector('#fs-salvar').onclick = async () => {
        const titulo = overlay.querySelector('#fs-titulo').value.trim();
        const ordem  = parseInt(overlay.querySelector('#fs-ordem').value) || 1;
        if (!titulo) { toast('Informe o título da seção','error'); return; }
        loading(true);
        try {
            if (secao) await api.atualizarSecao(secao.id, { titulo, ordem });
            else       await api.criarSecao({ modelo_id: modeloId, titulo, ordem });
            toast(secao ? 'Seção atualizada!' : 'Seção criada!');
            overlay.remove();
            // Recarregar expand
            const div = document.getElementById(`expand-${modeloId}`);
            if (div) { div.dataset.loaded = '0'; div.style.display = 'none'; }
            await toggleExpand(modeloId);
        } catch(e) { toast(e.message,'error'); }
        loading(false);
    };
}

async function deletarSecao(secaoId, modeloId) {
    if (!await confirm('Excluir esta seção e todos os seus itens?')) return;
    loading(true);
    try {
        await api.deletarSecao(secaoId);
        toast('Seção excluída!');
        const div = document.getElementById(`expand-${modeloId}`);
        if (div) { div.dataset.loaded = '0'; div.style.display = 'none'; }
        await toggleExpand(modeloId);
    } catch(e) { toast(e.message,'error'); }
    loading(false);
}

// ── Formulário de Item ─────────────────────────────────────────────────────────

function abrirFormItem(item, secaoId, modeloId) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="max-width:440px;width:100%">
        <h3 style="font-size:15px;font-weight:800;margin:0 0 18px;color:var(--texto)">
            ${item ? '✏️ Editar Item' : '➕ Novo Item'}
        </h3>
        <div class="form-group">
            <label>Descrição *</label>
            <input class="form-control" id="fi-desc" placeholder="Ex: EPI completo e em bom estado" value="${esc(item?.descricao||'')}">
        </div>
        <div class="form-group">
            <label>Ordem</label>
            <input class="form-control" id="fi-ordem" type="number" min="1" value="${item?.ordem||1}">
        </div>
        <div class="form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600">
                <input type="checkbox" id="fi-quant" ${item?.tem_quant?'checked':''}
                    style="width:16px;height:16px;accent-color:var(--laranja)">
                Permite informar quantidade
            </label>
            <div style="font-size:11px;color:var(--cinza3);margin-top:4px">
                Marque se o item permite registrar um número (ex: qtd. de EPI, pessoas, etc.)
            </div>
        </div>
        <div class="modal-btns" style="margin-top:20px">
            <button class="btn btn-primary" id="fi-salvar">💾 Salvar</button>
            <button class="btn btn-outline" id="fi-cancelar">Cancelar</button>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    overlay.querySelector('#fi-cancelar').onclick = () => overlay.remove();

    overlay.querySelector('#fi-salvar').onclick = async () => {
        const descricao = overlay.querySelector('#fi-desc').value.trim();
        const ordem     = parseInt(overlay.querySelector('#fi-ordem').value) || 1;
        const tem_quant = overlay.querySelector('#fi-quant').checked;
        if (!descricao) { toast('Informe a descrição do item','error'); return; }
        loading(true);
        try {
            if (item) await api.atualizarItem(item.id, { descricao, ordem, tem_quant });
            else      await api.criarItem({ secao_id: secaoId, descricao, ordem, tem_quant });
            toast(item ? 'Item atualizado!' : 'Item criado!');
            overlay.remove();
            const div = document.getElementById(`expand-${modeloId}`);
            if (div) { div.dataset.loaded = '0'; div.style.display = 'none'; }
            await toggleExpand(modeloId);
        } catch(e) { toast(e.message,'error'); }
        loading(false);
    };
}

async function deletarItem(itemId, secaoId, modeloId) {
    if (!await confirm('Excluir este item?')) return;
    loading(true);
    try {
        await api.deletarItem(itemId);
        toast('Item excluído!');
        const div = document.getElementById(`expand-${modeloId}`);
        if (div) { div.dataset.loaded = '0'; div.style.display = 'none'; }
        await toggleExpand(modeloId);
    } catch(e) { toast(e.message,'error'); }
    loading(false);
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA PREENCHIMENTOS
// ══════════════════════════════════════════════════════════════════════════════

async function renderPreenchimentos() {
    const el = document.getElementById('aba-content');
    loading(true);
    let lista = [];
    try {
        lista = await api.preenchimentos();
        if (!Array.isArray(lista)) lista = [];
    } catch(e) {
        loading(false);
        el.innerHTML = erroBox(e.message);
        return;
    }
    loading(false);

    el.innerHTML = `
    <div class="card" style="margin:0">
        <div class="card-title" style="justify-content:space-between">
            <span>📝 Todos os Preenchimentos</span>
            <span style="font-size:12px;color:var(--cinza3)">${lista.length} registro(s)</span>
        </div>
        ${lista.length === 0 ? `
        <div style="text-align:center;padding:36px;color:var(--cinza3);font-size:13px">
            Nenhum preenchimento registrado ainda.
        </div>` : `
        <div class="table-wrap">
            <table>
                <thead><tr>
                    <th>Modelo</th>
                    <th>Colaborador</th>
                    <th>Resultado</th>
                    <th>NCs</th>
                    <th>Inspeção</th>
                    <th>Preenchido em</th>
                </tr></thead>
                <tbody>
                    ${lista.map(p => {
                        const nconf = p.qty_nao_conformes || 0;
                        const cor   = nconf > 0 ? 'var(--vermelho)' : 'var(--verde)';
                        return `
                        <tr>
                            <td>
                                <div style="font-weight:700;font-size:12px;color:var(--azul2)">${esc(p.modelo_codigo||'')}</div>
                                <div style="font-size:11px;color:var(--cinza4)">${esc(p.modelo_titulo||'')}</div>
                            </td>
                            <td>
                                <div style="font-weight:600;font-size:13px">${esc(p.nome_avaliado||'—')}</div>
                                <div style="font-size:11px;color:var(--cinza4)">${esc(p.cargo_avaliado||'')}</div>
                            </td>
                            <td>
                                <strong style="color:${cor};font-size:12px">${esc(p.resultado_geral||'—')}</strong>
                            </td>
                            <td>
                                ${nconf > 0
                                    ? `<span class="badge badge-critica">${nconf} NC</span>`
                                    : '<span style="color:var(--cinza3);font-size:12px">0</span>'}
                            </td>
                            <td style="font-size:12px;color:var(--azul2)">
                                ${p.inspecao_id ? `#${p.inspecao_id}` : (p.lideranca_id ? `L#${p.lideranca_id}` : '—')}
                            </td>
                            <td style="font-size:12px;color:var(--cinza4);white-space:nowrap">
                                ${fmt.datahora(p.created_at)}
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`}
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}

function erroBox(msg) {
    return `<div style="display:flex;flex-direction:column;align-items:center;padding:48px 20px;
                         text-align:center;color:var(--cinza3)">
                <div style="font-size:40px;margin-bottom:12px">⚠️</div>
                <div style="font-size:14px;color:var(--cinza4);font-weight:600">Erro ao carregar</div>
                <div style="font-size:13px;margin-top:6px">${esc(msg)}</div>
            </div>`;
}
