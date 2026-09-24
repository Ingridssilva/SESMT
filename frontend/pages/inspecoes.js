import { api }                              from '../js/api.js';
import { toast, loading, confirm, fmt,
         fillSelect, formData }             from '../js/ui.js';
import { salvarOffline, salvarInspecaoOffline,
         listarInspecoesOffline, deletarInspecaoOffline,
         listarTodos, deletarOffline, sync,
         estaOnline, atualizarBadge,
         refComCache, preCarregarRefs }     from '../js/offline.js';
import { criarModalAssinatura }             from '../js/signature.js';

const TIPOS = ['NR-10','NR-35','NR-18','NR-06','NR-12','AMBIENTAL','GERAL','OUTRA'];

// Modelos que usam fluxo de máquina/veículo (sem CPF obrigatório)
const CODIGOS_MAQUINA = ['SESMT_CHECKLIST_04','SESMT_FISC_CAM','SESMT_FISC_RET'];

const apiCL = {
    modelos:    ()      => fetch('/api/checklists/modelos?tipo=campo').then(r=>r.json()),
    modelo:     (id)    => fetch(`/api/checklists/modelo/${id}`).then(r=>r.json()),
    listar:     (p={})  => fetch('/api/checklists/preenchimentos?'+new URLSearchParams(p)).then(r=>r.json()),
    salvar:     (d)     => fetch('/api/checklists/preenchimentos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(r=>r.json()),
    atualizar:  (id,d)  => fetch(`/api/checklists/preenchimento/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(r=>r.json()),
    deletar:    (id)    => fetch(`/api/checklists/preenchimento/${id}`,{method:'DELETE'}).then(r=>r.json()),
    assinaturas:(id,d)  => fetch(`/api/checklists/preenchimento/${id}/assinaturas`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(r=>r.json()),
};

const COR_SIT = {
    'BOM':'#1A7C4F','CONFORME':'#1A7C4F',
    'RUIM':'#C0392B','NÃO CONFORME':'#C0392B',
    'N/A':'#9E9E9E','Não se Aplica':'#9E9E9E','NÃO SE APLICA':'#9E9E9E'
};

// ── Detectar tipo de fluxo ────────────────────────────────────
function ehMaquina(modelo) {
    return CODIGOS_MAQUINA.includes(modelo.codigo);
}

// ── Rótulo do card no painel de checklists ────────────────────
function labelCardModelo(modelo) {
    if (modelo.codigo === 'SESMT_CHECKLIST_04') return '🚜 Máquina';
    if (modelo.codigo === 'SESMT_FISC_CAM')     return '🚛 Caminhão';
    if (modelo.codigo === 'SESMT_FISC_RET')     return '🔧 Retroescavadeira';
    if (modelo.codigo === 'SESMT_CHECKLIST_01') return '🦺 EPI';
    if (modelo.codigo === 'SESMT_CHECKLIST_02') return '🔒 EPC';
    return '📋 Checklist';
}

// ── Campos de cabeçalho específicos por modelo ────────────────
function htmlCabecalho(modelo, cab) {
    cab = cab || {};

    if (modelo.codigo === 'SESMT_FISC_RET') {
        return `
        <div class="card" style="margin-bottom:14px;border-left:4px solid var(--laranja)">
            <div class="card-title">🔧 Identificação da Retroescavadeira</div>
            <div class="form-grid form-grid-3">
                <div class="form-group"><label>Responsável pela Máquina <span class="req">*</span></label>
                    <input type="text" class="form-control cab-field" data-key="responsavel_maquina"
                        value="${esc(cab.responsavel_maquina||'')}" placeholder="Nome do operador">
                </div>
                <div class="form-group"><label>Documento (CNH / CPF)</label>
                    <input type="text" class="form-control cab-field" data-key="documento"
                        value="${esc(cab.documento||'')}">
                </div>
                <div class="form-group"><label>Equipe</label>
                    <input type="text" class="form-control cab-field" data-key="equipe"
                        value="${esc(cab.equipe||'')}">
                </div>
                <div class="form-group"><label>Encarregado</label>
                    <input type="text" class="form-control cab-field" data-key="encarregado"
                        value="${esc(cab.encarregado||'')}">
                </div>
            </div>
        </div>`;
    }

    if (modelo.codigo === 'SESMT_FISC_CAM') {
        return `
        <div class="card" style="margin-bottom:14px;border-left:4px solid var(--laranja)">
            <div class="card-title">🚛 Identificação do Caminhão</div>
            <div class="form-grid form-grid-3">
                <div class="form-group"><label>Responsável pelo Veículo <span class="req">*</span></label>
                    <input type="text" class="form-control cab-field" data-key="responsavel_veiculo"
                        value="${esc(cab.responsavel_veiculo||'')}" placeholder="Nome do motorista">
                </div>
                <div class="form-group"><label>Placa do Veículo <span class="req">*</span></label>
                    <input type="text" class="form-control cab-field" id="cl-placa" data-key="placa"
                        value="${esc(cab.placa||'')}" placeholder="ABC-1234" maxlength="8"
                        style="text-transform:uppercase">
                </div>
                <div class="form-group"><label>Equipe</label>
                    <input type="text" class="form-control cab-field" data-key="equipe"
                        value="${esc(cab.equipe||'')}">
                </div>
                <div class="form-group"><label>Encarregado</label>
                    <input type="text" class="form-control cab-field" data-key="encarregado"
                        value="${esc(cab.encarregado||'')}">
                </div>
            </div>
        </div>`;
    }

    if (modelo.codigo === 'SESMT_CHECKLIST_04') {
        return `
        <div class="card" style="margin-bottom:14px;border-left:4px solid var(--laranja)">
            <div class="card-title">🚜 Identificação da Máquina</div>
            <div class="form-grid form-grid-3">
                <div class="form-group"><label>Responsável pela Máquina <span class="req">*</span></label>
                    <input type="text" class="form-control cab-field" data-key="responsavel_maquina"
                        value="${esc(cab.responsavel_maquina||'')}" placeholder="Nome do operador">
                </div>
                <div class="form-group"><label>Horímetro</label>
                    <input type="text" class="form-control cab-field" data-key="horimetro"
                        value="${esc(cab.horimetro||'')}" placeholder="Ex: 1234.5h">
                </div>
                <div class="form-group"><label>Data das Aptidões</label>
                    <input type="date" class="form-control cab-field" data-key="data_aptidoes"
                        value="${esc(cab.data_aptidoes||'')}">
                </div>
                <div class="form-group"><label>Equipe</label>
                    <input type="text" class="form-control cab-field" data-key="equipe"
                        value="${esc(cab.equipe||'')}">
                </div>
                <div class="form-group"><label>Encarregado</label>
                    <input type="text" class="form-control cab-field" data-key="encarregado"
                        value="${esc(cab.encarregado||'')}">
                </div>
            </div>
            <div style="background:rgba(192,57,43,.08);border:1.5px solid rgba(192,57,43,.3);
                        border-radius:8px;padding:10px 14px;margin-top:8px;font-size:12px;color:#C0392B;font-weight:600">
                ⚠️ NÃO OPERAR SE HOUVER: Vazamento hidráulico significativo · Falha em estabilizador · Luz de falha no painel · Trincas estruturais
            </div>
        </div>`;
    }

    // Fluxo A — EPI / EPC: card de colaborador (retorna vazio, renderizado separado)
    return '';
}

// ── Validar cabeçalho antes de salvar ────────────────────────
function validarCabecalho(container, modelo) {
    if (modelo.codigo === 'SESMT_FISC_CAM') {
        const resp = container.querySelector('[data-key="responsavel_veiculo"]')?.value?.trim();
        const placa = container.querySelector('[data-key="placa"]')?.value?.trim();
        if (!resp) { toast('Informe o responsável pelo veículo','warning'); return false; }
        if (!placa) { toast('Informe a placa do veículo','warning'); return false; }
    }
    if (modelo.codigo === 'SESMT_FISC_RET' || modelo.codigo === 'SESMT_CHECKLIST_04') {
        const resp = container.querySelector('[data-key="responsavel_maquina"]')?.value?.trim();
        if (!resp) { toast('Informe o responsável pela máquina','warning'); return false; }
    }
    return true;
}

// ── Coletar cabeçalho dos campos específicos ─────────────────
function coletarCabecalho(container) {
    const cab = {};
    container.querySelectorAll('.cab-field').forEach(el => {
        const k = el.dataset.key;
        const v = el.value.trim();
        if (k && v) cab[k] = v;
    });
    return cab;
}

// ── Identificador resumido para o card de preenchimento ───────
function resumoPreenchimento(p, modelo) {
    if (CODIGOS_MAQUINA.includes(modelo?.codigo || '')) {
        const cab = p.cabecalho || {};
        const placa = cab.placa || cab.responsavel_maquina || cab.responsavel_veiculo || '';
        return placa
            ? `<span style="font-weight:700;font-size:13px">${placa}</span>`
            : `<span style="color:var(--cinza3)">Sem identificação</span>`;
    }
    return p.nome_avaliado
        ? `<span style="font-weight:700;font-size:13px">${p.nome_avaliado}</span>`
        : `<span style="color:var(--cinza3)">Sem nome</span>`;
}

export async function renderInspecoes(container, actions, navigate) {
    actions.innerHTML = `
        <a href="/api/exportar/inspecoes" class="btn btn-outline btn-sm" download title="Exportar CSV">📥 CSV</a>
        <button class="btn btn-primary" id="btn-nova">+ Nova Inspeção</button>
    `;
    document.getElementById('btn-nova').onclick = () => abrirForm(container, null, navigate);
    await carregarLista(container, navigate);
}

// ── Lista principal ───────────────────────────────────────────
async function carregarLista(container, navigate, filtros = {}) {
    loading(true);
    try {
        const [itensOnline, itensOffline] = await Promise.all([
            estaOnline() ? api.inspecoes.listar(filtros).catch(()=>[]) : Promise.resolve([]),
            listarTodos(),
        ]);

        const pendentesOffline = itensOffline.filter(i => i.status === 'pending');

        container.innerHTML = `
        ${pendentesOffline.length > 0 ? `
        <div style="background:rgba(247,147,30,.1);border:1.5px solid var(--laranja);
                    border-radius:10px;padding:12px 16px;margin-bottom:16px;
                    display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div style="font-size:13px;font-weight:600;color:var(--laranja)">
                📵 ${pendentesOffline.length} checklist(s) aguardando sincronização
            </div>
            <button class="btn btn-primary btn-sm" id="btn-sync-agora">
                🔄 Sincronizar agora
            </button>
        </div>` : ''}

        <div class="filtros">
            <div class="form-group"><label>Tipo</label>
                <select class="form-control" id="f-tipo">
                    <option value="">Todos</option>
                    ${TIPOS.map(t=>`<option ${filtros.tipo===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>De</label>
                <input type="date" class="form-control" id="f-dini" value="${filtros.data_ini||''}">
            </div>
            <div class="form-group"><label>Até</label>
                <input type="date" class="form-control" id="f-dfim" value="${filtros.data_fim||''}">
            </div>
            <button class="btn btn-dark" id="btn-filtrar">Filtrar</button>
        </div>

        <div class="card">
            <div class="card-title" style="justify-content:space-between">
                <span>📋 Inspeções de Campo</span>
                <div style="display:flex;gap:8px;align-items:center">
                    ${!estaOnline() ? '<span style="font-size:11px;color:var(--amarelo);font-weight:700">📵 Offline</span>' : ''}
                    <span style="font-size:12px;color:var(--cinza3)">${itensOnline.length} online${pendentesOffline.length > 0 ? ` · ${pendentesOffline.length} pendente(s)` : ''}</span>
                </div>
            </div>
            <div class="table-wrap">
                <table>
                    <thead><tr>
                        <th>Código</th><th>Data</th><th>Tipo</th><th>Município</th>
                        <th>Contrato</th><th>Responsável</th><th>NCs</th><th></th>
                    </tr></thead>
                    <tbody>
                    ${itensOnline.length === 0 && pendentesOffline.length === 0
                        ? `<tr><td colspan="8" style="text-align:center;padding:36px;color:var(--cinza3)">Nenhuma inspeção registrada</td></tr>`
                        : [
                            ...pendentesOffline.map(i => `
                            <tr style="background:rgba(247,147,30,.05)">
                                <td style="font-weight:700;color:var(--laranja)">
                                    <span style="font-size:10px;background:var(--laranja);color:#fff;
                                                 border-radius:4px;padding:1px 5px;margin-right:4px">OFFLINE</span>
                                    ${i.local_id?.substring(0,12)}...
                                </td>
                                <td style="color:var(--cinza4)">${fmt.data(i.created_at)}</td>
                                <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
                                <td>
                                    <button class="btn btn-danger btn-sm" data-del-offline="${i.local_id}">🗑</button>
                                </td>
                            </tr>`),
                            ...itensOnline.map(i => `
                            <tr>
                                <td style="font-weight:700;color:var(--azul2)">${i.codigo}</td>
                                <td style="white-space:nowrap;color:var(--cinza4)">${fmt.data(i.data_inspecao)}</td>
                                <td>${i.tipo_inspecao}</td>
                                <td>${i.municipio_nome||i.local_descricao||'—'}</td>
                                <td style="font-size:12px;color:var(--cinza4)">${i.contrato_cod||'—'}</td>
                                <td>${i.inspetor_nome||'—'}</td>
                                <td>${i.qty_ncs>0?`<span class="badge badge-alta">${i.qty_ncs}</span>`:'<span style="color:var(--cinza3)">0</span>'}</td>
                                <td style="white-space:nowrap">
                                    <button class="btn btn-outline btn-sm" data-checklist="${i.id}" title="Checklists">📋</button>
                                    <button class="btn btn-outline btn-sm" data-pdf="${i.id}" data-cod="${i.codigo}" title="Baixar Relatório PDF">📄 PDF</button>
                                    <button class="btn btn-outline btn-sm" data-edit="${i.id}">✏️</button>
                                    <button class="btn btn-outline btn-sm" data-del="${i.id}">🗑</button>
                                </td>
                            </tr>`)
                          ].join('')}
                    </tbody>
                </table>
            </div>
        </div>`;

        const btnSync = container.querySelector('#btn-sync-agora');
        if (btnSync) {
            btnSync.onclick = async () => {
                loading(true);
                const r = await sync();
                loading(false);
                toast(r.enviados > 0 ? `${r.enviados} checklist(s) sincronizado(s)!` : 'Nada para sincronizar');
                carregarLista(container, navigate, filtros);
            };
        }

        container.querySelector('#btn-filtrar').onclick = () => carregarLista(container, navigate, {
            tipo:     container.querySelector('#f-tipo').value||undefined,
            data_ini: container.querySelector('#f-dini').value||undefined,
            data_fim: container.querySelector('#f-dfim').value||undefined,
        });

        container.querySelectorAll('[data-checklist]').forEach(b =>
            b.onclick=()=>abrirChecklists(container, parseInt(b.dataset.checklist), navigate));

        container.querySelectorAll('[data-pdf]').forEach(b =>
            b.onclick = () => baixarRelatorioPDF(parseInt(b.dataset.pdf), b.dataset.cod, b));

        container.querySelectorAll('[data-edit]').forEach(b =>
            b.onclick=()=>abrirForm(container, parseInt(b.dataset.edit), navigate));
        container.querySelectorAll('[data-del]').forEach(b =>
            b.onclick=async()=>{
                if(!await confirm('Excluir inspeção?'))return;
                loading(true);
                try{ await api.inspecoes.deletar(parseInt(b.dataset.del)); toast('Excluída'); carregarLista(container,navigate,filtros); }
                catch(e){ toast(e.message,'error'); } finally{ loading(false); }
            });
        container.querySelectorAll('[data-del-offline]').forEach(b =>
            b.onclick=async()=>{
                if(!await confirm('Excluir rascunho offline?'))return;
                await deletarOffline(b.dataset.delOffline);
                toast('Rascunho excluído');
                carregarLista(container,navigate,filtros);
            });

    } catch(e){ toast(e.message,'error'); } finally{ loading(false); }
}

// ── Painel de checklists ──────────────────────────────────────
async function abrirChecklists(container, inspecaoId, navigate) {
    loading(true);
    try {
        const [modelos, preenchimentos, insp] = await Promise.all([
            apiCL.modelos(),
            estaOnline() ? apiCL.listar({inspecao_id: inspecaoId}) : Promise.resolve([]),
            estaOnline() ? api.inspecoes.obter(inspecaoId) : Promise.resolve({}),
        ]);
        const codigoInspecao = insp?.codigo || `INSP-${inspecaoId}`;
        loading(false);

        const pMap = {};
        preenchimentos.forEach(p => {
            if (!pMap[p.modelo_id]) pMap[p.modelo_id] = [];
            pMap[p.modelo_id].push(p);
        });

        container.innerHTML = `
        <div style="max-width:1000px">
            <button class="btn btn-outline" id="btn-voltar">← Voltar</button>
            <h2 style="font-size:16px;font-weight:700;margin:16px 0">📋 Checklists da Inspeção</h2>
            ${!estaOnline() ? `
            <div style="background:rgba(247,147,30,.1);border:1.5px solid var(--laranja);
                        border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:var(--laranja);font-weight:600">
                📵 Modo Offline — checklists serão sincronizados quando conectar
            </div>` : ''}
            <div style="display:flex;flex-direction:column;gap:16px">
                ${modelos.map(m => {
                    const lista = pMap[m.id] || [];
                    const isMaq = CODIGOS_MAQUINA.includes(m.codigo);
                    const btnLabel = isMaq ? '+ Novo Registro' : '+ Novo Colaborador';
                    return `
                    <div class="card" style="margin:0">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                            <div>
                                <div style="display:flex;align-items:center;gap:8px">
                                    <span style="font-size:11px;background:var(--cinza1);color:var(--cinza4);
                                                 border-radius:6px;padding:2px 8px;font-weight:700">${m.codigo}</span>
                                    <span style="font-size:11px;background:var(--laranja);color:#fff;
                                                 border-radius:6px;padding:2px 8px;font-weight:700">${labelCardModelo(m)}</span>
                                </div>
                                <div style="font-weight:700;font-size:14px;margin-top:4px">${m.titulo}</div>
                            </div>
                            <button class="btn btn-primary btn-sm" data-novo="${m.id}">
                                ${btnLabel}
                            </button>
                        </div>

                        ${lista.length === 0 ? `
                        <div style="text-align:center;padding:20px;color:var(--cinza3);font-size:13px;
                                    border:1.5px dashed var(--cinza2);border-radius:8px">
                            Nenhum registro ainda. Clique em <strong>"${btnLabel}"</strong> para iniciar.
                        </div>` : `
                        <div style="display:flex;flex-direction:column;gap:8px">
                            ${lista.map(p => {
                                const nconf = p.qty_nao_conformes || 0;
                                const cor   = nconf > 0 ? 'var(--vermelho)' : 'var(--verde)';
                                const cab   = p.cabecalho || {};
                                const idLine = isMaq
                                    ? (cab.placa || cab.responsavel_maquina || cab.responsavel_veiculo || '—')
                                    : (p.nome_avaliado || '—');
                                const subLine = isMaq
                                    ? (cab.equipe ? `Equipe: ${cab.equipe}` : '')
                                    : (p.cargo_avaliado ? p.cargo_avaliado : '');
                                return `
                                <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;
                                            background:var(--cinza1);border-radius:8px;
                                            border-left:4px solid ${cor};flex-wrap:wrap">
                                    <div style="flex:1;min-width:180px">
                                        <div style="font-weight:700;font-size:13px">${idLine}</div>
                                        <div style="font-size:11px;color:var(--cinza4)">${subLine}</div>
                                    </div>
                                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                                        <strong style="color:${cor};font-size:12px">${p.resultado_geral || '—'}</strong>
                                        ${nconf > 0 ? `<span class="badge badge-critica">${nconf} NC</span>` : ''}
                                        <span style="font-size:11px;color:var(--cinza3)">${fmt.data(p.created_at)}</span>
                                    </div>
                                    <div style="display:flex;gap:6px">
                                        <button class="btn btn-outline btn-sm" data-fill="${m.id}" data-pid="${p.id}">✏️ Editar</button>
                                        <button class="btn btn-outline btn-sm" data-pdf-cl="${p.id}" data-pdf-cod="${codigoInspecao}_${m.codigo}" title="Baixar PDF deste checklist">📄 PDF</button>
                                        <button class="btn btn-danger btn-sm" data-delp="${p.id}">🗑</button>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>`}
                    </div>`;
                }).join('')}
            </div>
        </div>`;

        container.querySelector('#btn-voltar').onclick = () => carregarLista(container, navigate);

        // Botão novo — detecta fluxo pelo modelo
        container.querySelectorAll('[data-novo]').forEach(b => {
            const mid = parseInt(b.dataset.novo);
            const modelo = modelos.find(m => m.id === mid);
            b.onclick = () => {
                if (modelo && CODIGOS_MAQUINA.includes(modelo.codigo)) {
                    // Fluxo máquina: vai direto pro formulário sem seletor de colaborador
                    abrirFormChecklist(container, mid, inspecaoId, null, navigate, null, modelo);
                } else {
                    // Fluxo EPI/EPC: abre seletor de colaborador
                    abrirSeletorColaborador(container, mid, inspecaoId, navigate);
                }
            };
        });

        container.querySelectorAll('[data-fill]').forEach(b =>
            b.onclick = () => {
                const mid = parseInt(b.dataset.fill);
                const modelo = modelos.find(m => m.id === mid);
                abrirFormChecklist(container, mid, inspecaoId, b.dataset.pid ? parseInt(b.dataset.pid) : null, navigate, null, modelo);
            });

        container.querySelectorAll('[data-pdf-cl]').forEach(b =>
            b.onclick = () => baixarPDFChecklist(parseInt(b.dataset.pdfCl), b.dataset.pdfCod, b));

        container.querySelectorAll('[data-delp]').forEach(b =>
            b.onclick = async () => {
                if (!await confirm('Excluir este preenchimento?')) return;
                loading(true);
                try {
                    await apiCL.deletar(parseInt(b.dataset.delp));
                    toast('Excluído');
                    abrirChecklists(container, inspecaoId, navigate);
                } catch(e) { toast(e.message, 'error'); }
                finally { loading(false); }
            });

    } catch(e) { loading(false); toast(e.message, 'error'); }
}

// ── Seletor de colaborador (Fluxo A — EPI/EPC) ───────────────
async function abrirSeletorColaborador(container, modeloId, inspecaoId, navigate) {
    loading(true);
    let colaboradores = [];
    try {
        const r = await fetch('/api/colaboradores').then(r => r.json());
        colaboradores = r.data || r || [];
    } catch(e) { colaboradores = []; }
    loading(false);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.alignItems = 'flex-start';
    overlay.style.paddingTop = '40px';
    overlay.style.overflowY = 'auto';

    overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:24px 28px;width:100%;max-width:600px;
                margin:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);color:#1A1A1A">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <div style="font-weight:800;font-size:16px;color:#1A1A1A">👤 Selecionar Colaborador</div>
            <button class="btn btn-outline btn-sm" id="fechar-sel">✕</button>
        </div>
        <div style="position:relative;margin-bottom:14px">
            <input type="text" id="busca-colab" placeholder="🔍 Buscar por nome, CPF ou cargo..."
                style="width:100%;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;
                       font-size:13px;font-family:inherit;color:#1A1A1A;background:#fff;box-sizing:border-box;outline:none"
                onfocus="this.style.borderColor='#F7931E'" onblur="this.style.borderColor='#ddd'">
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px">
            <button id="tab-base" style="flex:1;padding:8px;border-radius:8px;border:1.5px solid #1A1A1A;
                background:#1A1A1A;color:#fff;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit">
                📋 Da Base (${colaboradores.length})
            </button>
            <button id="tab-manual" style="flex:1;padding:8px;border-radius:8px;border:1.5px solid #ddd;
                background:#fff;color:#666;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit">
                ✏️ Digitar Manualmente
            </button>
        </div>
        <div id="painel-base">
            <div id="lista-colabs" style="max-height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
                ${colaboradores.length === 0
                    ? `<div style="text-align:center;padding:24px;color:#999;font-size:13px">Nenhum colaborador na base</div>`
                    : colaboradores.map(c => `
                    <div class="colab-item" data-cpf="${c.cpf}" data-nome="${c.nome}" data-cargo="${c.cargo||''}" data-tel="${c.telefone||''}"
                        style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;
                               cursor:pointer;border:1.5px solid #eee;transition:all .15s;background:#fff">
                        <div style="width:36px;height:36px;background:#F7931E;border-radius:50%;
                                    display:flex;align-items:center;justify-content:center;
                                    font-weight:800;color:#fff;font-size:13px;flex-shrink:0">
                            ${c.nome.split(' ').map(p=>p[0]).join('').substring(0,2).toUpperCase()}
                        </div>
                        <div style="flex:1;min-width:0">
                            <div style="font-weight:700;font-size:13px;color:#1A1A1A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.nome}</div>
                            <div style="font-size:11px;color:#888">${c.cargo||''} ${c.cargo&&c.cpf?' · ':''} ${c.cpf||''}</div>
                        </div>
                        <div style="font-size:11px;color:#F7931E;font-weight:700;white-space:nowrap">Selecionar →</div>
                    </div>`).join('')}
            </div>
        </div>
        <div id="painel-manual" style="display:none">
            <div style="margin-bottom:12px">
                <label style="display:block;font-size:11px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:6px">CPF <span style="color:red">*</span></label>
                <input type="text" id="m-cpf" placeholder="000.000.000-00" maxlength="14"
                    style="width:100%;padding:9px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px;font-family:inherit;color:#1A1A1A;background:#fff;box-sizing:border-box;outline:none">
            </div>
            <div style="margin-bottom:12px">
                <label style="display:block;font-size:11px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:6px">Nome Completo <span style="color:red">*</span></label>
                <input type="text" id="m-nome" placeholder="Nome do colaborador"
                    style="width:100%;padding:9px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px;font-family:inherit;color:#1A1A1A;background:#fff;box-sizing:border-box;outline:none">
            </div>
            <div style="margin-bottom:12px">
                <label style="display:block;font-size:11px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:6px">Cargo / Função</label>
                <input type="text" id="m-cargo" placeholder="Ex: Eletricista"
                    style="width:100%;padding:9px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px;font-family:inherit;color:#1A1A1A;background:#fff;box-sizing:border-box;outline:none">
            </div>
            <div style="margin-bottom:16px">
                <label style="display:block;font-size:11px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:6px">WhatsApp</label>
                <input type="text" id="m-tel" placeholder="91999999999" maxlength="11"
                    style="width:100%;padding:9px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:13px;font-family:inherit;color:#1A1A1A;background:#fff;box-sizing:border-box;outline:none">
            </div>
            <button id="btn-confirmar-manual" style="width:100%;padding:11px;background:#F7931E;color:#fff;
                border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">
                Continuar com este colaborador →
            </button>
        </div>
    </div>`;

    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    overlay.querySelector('#fechar-sel').onclick = fechar;
    overlay.onclick = e => { if (e.target === overlay) fechar(); };

    overlay.querySelector('#tab-base').onclick = () => {
        overlay.querySelector('#painel-base').style.display = '';
        overlay.querySelector('#painel-manual').style.display = 'none';
    };
    overlay.querySelector('#tab-manual').onclick = () => {
        overlay.querySelector('#painel-base').style.display = 'none';
        overlay.querySelector('#painel-manual').style.display = '';
    };

    overlay.querySelector('#busca-colab').addEventListener('input', function() {
        const q = this.value.toLowerCase();
        overlay.querySelectorAll('.colab-item').forEach(el => {
            const txt = (el.dataset.nome + el.dataset.cpf + el.dataset.cargo).toLowerCase();
            el.style.display = txt.includes(q) ? '' : 'none';
        });
    });

    const cpfInput = overlay.querySelector('#m-cpf');
    if (cpfInput) {
        cpfInput.addEventListener('input', function() {
            let v = this.value.replace(/\D/g,'');
            if (v.length > 11) v = v.substring(0,11);
            v = v.replace(/(\d{3})(\d)/,'$1.$2')
                 .replace(/(\d{3})(\d)/,'$1.$2')
                 .replace(/(\d{3})(\d{1,2})$/,'$1-$2');
            this.value = v;
        });
    }

    overlay.querySelectorAll('.colab-item').forEach(el => {
        el.addEventListener('mouseover', () => { el.style.background='#FFF4E8'; el.style.borderColor='#F7931E'; });
        el.addEventListener('mouseout',  () => { el.style.background='#fff';    el.style.borderColor='#eee'; });
        el.onclick = () => {
            fechar();
            abrirFormChecklist(container, modeloId, inspecaoId, null, navigate, {
                cpf: el.dataset.cpf, nome: el.dataset.nome,
                cargo: el.dataset.cargo, telefone: el.dataset.tel,
            });
        };
    });

    const btnManual = overlay.querySelector('#btn-confirmar-manual');
    if (btnManual) {
        btnManual.onclick = () => {
            const cpf  = overlay.querySelector('#m-cpf').value;
            const nome = overlay.querySelector('#m-nome').value.trim();
            if (!cpf || cpf.length < 14) { toast('CPF inválido','warning'); return; }
            if (!nome) { toast('Informe o nome','warning'); return; }
            fechar();
            abrirFormChecklist(container, modeloId, inspecaoId, null, navigate, {
                cpf, nome,
                cargo:    overlay.querySelector('#m-cargo').value.trim(),
                telefone: overlay.querySelector('#m-tel').value.trim(),
            });
        };
    }
}

// ── Formulário de preenchimento (suporta dois fluxos) ─────────
async function abrirFormChecklist(container, modeloId, inspecaoId, preenchimentoId, navigate, colaboradorPreSelecionado = null, modeloHint = null) {
    loading(true);
    try {
        const [modelo, usuarios, existente] = await Promise.all([
            modeloHint || apiCL.modelo(modeloId),
            estaOnline() ? api.usuarios() : Promise.resolve([]),
            preenchimentoId ? fetch(`/api/checklists/preenchimento/${preenchimentoId}`).then(r=>r.json()) : Promise.resolve(null),
        ]);
        // Se veio como hint (sem secoes), buscar completo
        const modeloCompleto = modelo.secoes ? modelo : await apiCL.modelo(modeloId);
        loading(false);

        const rMap = {};
        (existente?.respostas||[]).forEach(r=>{ rMap[r.item_id]=r; });
        const tipos = modeloCompleto.tipo_situacao || ['CONFORME','NÃO CONFORME','N/A'];
        const temQuant = tipos.includes('BOM');
        const isMaq = CODIGOS_MAQUINA.includes(modeloCompleto.codigo);
        const cab   = existente?.cabecalho || {};

        container.innerHTML = `
        <div style="max-width:1000px">
            <button class="btn btn-outline" id="btn-vcl">← Voltar</button>
            <h2 style="font-size:15px;font-weight:700;margin:16px 0">
                ${modeloCompleto.titulo}
                <span style="font-size:11px;color:var(--cinza3);font-weight:400;margin-left:8px">${modeloCompleto.codigo}</span>
                ${!estaOnline()?'<span style="font-size:11px;background:var(--laranja);color:#fff;border-radius:4px;padding:2px 8px;margin-left:8px">📵 OFFLINE</span>':''}
            </h2>

            ${isMaq
                /* ── Fluxo B: Máquina / Veículo ── */
                ? htmlCabecalho(modeloCompleto, cab)
                /* ── Fluxo A: Colaborador (EPI/EPC) ── */
                : `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--laranja)">
                    <div class="card-title">👤 Colaborador Avaliado</div>
                    <div class="form-grid form-grid-3">
                        <div class="form-group">
                            <label>CPF <span class="req">*</span></label>
                            <div style="display:flex;gap:8px">
                                <input type="text" id="cl-cpf" class="form-control"
                                       placeholder="000.000.000-00" maxlength="14"
                                       value="${esc(existente?.cpf_avaliado || colaboradorPreSelecionado?.cpf || '')}"
                                       style="flex:1">
                                ${estaOnline()?`<button type="button" class="btn btn-outline btn-sm" id="btn-buscar-cpf" style="white-space:nowrap">🔍 Buscar</button>`:''}
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Nome Completo <span class="req">*</span></label>
                            <input type="text" id="cl-nome-av" class="form-control"
                                   placeholder="Nome do colaborador"
                                   value="${esc(existente?.nome_avaliado || colaboradorPreSelecionado?.nome || '')}">
                        </div>
                        <div class="form-group">
                            <label>Cargo / Função</label>
                            <input type="text" id="cl-cargo-av" class="form-control"
                                   placeholder="Ex: Eletricista"
                                   value="${esc(existente?.cargo_avaliado || colaboradorPreSelecionado?.cargo || '')}">
                        </div>
                    </div>
                </div>`
            }

            <!-- Responsável pela inspeção -->
            <div class="card" style="margin-bottom:14px">
                <div class="card-title">🔍 Responsável pela Inspeção</div>
                <div class="form-grid form-grid-3">
                    <div class="form-group"><label>Inspetor / SESMT</label>
                        <select class="form-control" id="cl-usr">
                            <option value="">— Selecione —</option>
                            ${usuarios.map(u=>`<option value="${u.id}" ${existente?.preenchido_por===u.id?'selected':''}>${u.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label>Resultado Geral</label>
                        <select class="form-control" id="cl-res">
                            <option value="">— Avaliar —</option>
                            <option ${existente?.resultado_geral==='CONFORME'?'selected':''}>CONFORME</option>
                            <option ${existente?.resultado_geral==='NÃO CONFORME'?'selected':''}>NÃO CONFORME</option>
                        </select>
                    </div>
                    <div class="form-group"><label>Observações Extras</label>
                        <input type="text" class="form-control" id="cl-obs" value="${esc(existente?.observacoes_extras||'')}">
                    </div>
                </div>
            </div>

            <!-- Seções de itens -->
            ${modeloCompleto.secoes.map(secao=>`
            <div class="card" style="margin-bottom:12px">
                <div style="background:var(--preto);color:var(--laranja);font-weight:700;font-size:11px;
                            margin:-20px -22px 14px;padding:10px 22px;border-radius:9px 9px 0 0;
                            text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid var(--laranja)">
                    ${secao.titulo}
                </div>
                <div class="table-wrap">
                    <table>
                        <thead><tr>
                            <th style="min-width:200px">Item</th>
                            ${tipos.map(t=>`<th style="text-align:center;min-width:90px">${t}</th>`).join('')}
                            ${temQuant?'<th style="text-align:center;width:70px">QUANT</th>':''}
                            <th style="min-width:150px">Observação</th>
                            <th style="width:70px;text-align:center">Foto</th>
                        </tr></thead>
                        <tbody>
                        ${secao.itens.map(item=>{
                            const resp=rMap[item.id]||{};
                            const fUrl=resp.foto_url||'';
                            const rowStyle = resp.situacao&&(resp.situacao==='RUIM'||resp.situacao==='NÃO CONFORME')
                                ? 'background:rgba(192,57,43,.04);' : '';
                            return `<tr style="${rowStyle}">
                                <td style="font-size:13px;line-height:1.4">${item.descricao}</td>
                                ${tipos.map(t=>`
                                <td style="text-align:center">
                                    <input type="radio" name="sit_${item.id}" value="${t}"
                                        class="cl-radio" data-item="${item.id}"
                                        ${resp.situacao===t?'checked':''}
                                        style="width:18px;height:18px;accent-color:${COR_SIT[t]||'#888'};cursor:pointer">
                                </td>`).join('')}
                                ${temQuant&&item.tem_quant?`<td>
                                    <input type="number" class="form-control cl-qtd" data-item="${item.id}"
                                        value="${resp.quantidade||''}" min="0"
                                        style="padding:4px 6px;text-align:center;width:60px">
                                </td>`:temQuant?'<td></td>':''}
                                <td>
                                    <input type="text" class="form-control cl-obs-item" data-item="${item.id}"
                                        value="${esc(resp.observacao||'')}" placeholder="obs..."
                                        style="padding:4px 8px;font-size:12px">
                                </td>
                                <td style="text-align:center">
                                    <div class="foto-cell" data-item="${item.id}">
                                        ${fUrl
                                            ? `<a href="${fUrl}" target="_blank"><img src="${fUrl}" style="width:34px;height:34px;object-fit:cover;border-radius:4px"></a>`
                                            : `<label style="cursor:pointer;font-size:18px" title="Foto">📷
                                               <input type="file" accept="image/*" class="foto-input" data-item="${item.id}" style="display:none"></label>`}
                                    </div>
                                </td>
                            </tr>`;
                        }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`).join('')}

            <!-- Resumo + botões -->
            <div style="position:sticky;bottom:0;background:var(--branco);border-top:2px solid var(--cinza2);
                        padding:12px 20px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;
                        box-shadow:0 -4px 16px rgba(0,0,0,.08);border-radius:8px 8px 0 0;z-index:10">
                <span style="font-size:13px">✅ <strong id="cnt-c" style="color:var(--verde)">0</strong></span>
                <span style="font-size:13px">❌ <strong id="cnt-n" style="color:var(--vermelho)">0</strong></span>
                <span style="font-size:13px">➖ <strong id="cnt-na" style="color:var(--cinza3)">0</strong></span>
                <span style="font-size:13px">⬜ <strong id="cnt-b" style="color:var(--amarelo)">0</strong></span>
                <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
                    ${!estaOnline()
                        ? `<button class="btn btn-outline" id="btn-assinar">✍️ Ass. Offline</button>`
                        : `<button class="btn btn-success" id="btn-zapsign"
                              style="${preenchimentoId ? 'display:inline-flex' : 'display:none'}">
                              📲 Enviar para Assinatura
                           </button>`
                    }
                    <button class="btn btn-primary" id="btn-save-cl">
                        ${estaOnline() ? '💾 Salvar' : '📵 Salvar Offline'}
                    </button>
                    <button class="btn btn-outline" id="btn-cancel-cl">Cancelar</button>
                </div>
            </div>
        </div>`;

        // Máscara CPF (fluxo A)
        const cpfInput = container.querySelector('#cl-cpf');
        if (cpfInput) {
            cpfInput.addEventListener('input', function() {
                let v = this.value.replace(/\D/g,'');
                if (v.length > 11) v = v.substring(0,11);
                v = v.replace(/(\d{3})(\d)/,'$1.$2')
                     .replace(/(\d{3})(\d)/,'$1.$2')
                     .replace(/(\d{3})(\d{1,2})$/,'$1-$2');
                this.value = v;
            });
        }

        // Buscar CPF (fluxo A)
        const btnBuscarCPF = container.querySelector('#btn-buscar-cpf');
        if (btnBuscarCPF) {
            btnBuscarCPF.onclick = async () => {
                const cpf = cpfInput.value;
                if (cpf.length < 14) { toast('CPF incompleto','warning'); return; }
                try {
                    const r = await fetch(`/api/checklists/buscar-colaborador/${cpf}`).then(r=>r.json());
                    if (r.encontrado) {
                        container.querySelector('#cl-nome-av').value  = r.nome  || '';
                        container.querySelector('#cl-cargo-av').value = r.cargo || '';
                        toast(`Colaborador encontrado: ${r.nome}`);
                    } else { toast('CPF não encontrado — preencha manualmente','warning'); }
                } catch(e) { toast('Erro ao buscar CPF','error'); }
            };
        }

        // Placa uppercase em tempo real
        const placaInput = container.querySelector('#cl-placa');
        if (placaInput) {
            placaInput.addEventListener('input', function() {
                this.value = this.value.toUpperCase();
            });
        }

        // Contador ao vivo
        function contagem() {
            let c=0,n=0,na=0,b=0;
            const nomes=new Set();
            container.querySelectorAll('.cl-radio').forEach(r=>{
                if(nomes.has(r.name))return; nomes.add(r.name);
                const ch=container.querySelector(`input[name="${r.name}"]:checked`);
                if(!ch){b++;return;}
                if(ch.value==='BOM'||ch.value==='CONFORME')c++;
                else if(ch.value==='RUIM'||ch.value==='NÃO CONFORME')n++;
                else na++;
            });
            container.querySelector('#cnt-c').textContent=c;
            container.querySelector('#cnt-n').textContent=n;
            container.querySelector('#cnt-na').textContent=na;
            container.querySelector('#cnt-b').textContent=b;
            const sel=container.querySelector('#cl-res');
            if(!sel.value) sel.value=n>0?'NÃO CONFORME':'CONFORME';
        }
        container.querySelectorAll('.cl-radio').forEach(r=>r.addEventListener('change',contagem));
        contagem();

        // ZapSign
        const btnZapInicial = container.querySelector('#btn-zapsign');
        if (btnZapInicial) {
            btnZapInicial.onclick = () => {
                const nomeAv = isMaq
                    ? (container.querySelector('[data-key="responsavel_maquina"]')?.value ||
                       container.querySelector('[data-key="responsavel_veiculo"]')?.value || '')
                    : (container.querySelector('#cl-nome-av')?.value || '');
                const telAv = existente?.telefone_colaborador || '';
                abrirModalZapSign(container, preenchimentoId, { nome_avaliado: nomeAv, telefone_colaborador: telAv });
            };
        }

        let sigInspetor = null, sigAvaliado = null;
        const btnAssinar = container.querySelector('#btn-assinar');
        if (btnAssinar) {
            btnAssinar.onclick = async () => {
                const nomeInspetor = container.querySelector('#cl-usr')?.selectedOptions[0]?.text || '';
                const nomeAvaliado = isMaq
                    ? (container.querySelector('[data-key="responsavel_maquina"]')?.value ||
                       container.querySelector('[data-key="responsavel_veiculo"]')?.value || '')
                    : (container.querySelector('#cl-nome-av')?.value || '');
                try {
                    const sigs = await criarModalAssinatura({ nomeInspetor, nomeAvaliado });
                    sigInspetor = sigs.assinatura_inspetor;
                    sigAvaliado = sigs.assinatura_avaliado;
                    btnAssinar.innerHTML = '✅ Assinado';
                    btnAssinar.className = 'btn btn-success btn-sm';
                    toast('Assinaturas capturadas!');
                } catch(e) { /* cancelado */ }
            };
        }

        const voltarCL = () => abrirChecklists(container, inspecaoId, navigate);
        container.querySelector('#btn-vcl').onclick = voltarCL;
        container.querySelector('#btn-cancel-cl').onclick = voltarCL;

        // Salvar
        container.querySelector('#btn-save-cl').onclick = async () => {
            // Validação por fluxo
            if (isMaq) {
                if (!validarCabecalho(container, modeloCompleto)) return;
            } else {
                const cpf  = container.querySelector('#cl-cpf')?.value||'';
                const nome = container.querySelector('#cl-nome-av')?.value||'';
                if (!cpf || cpf.length < 14) { toast('Informe o CPF do colaborador avaliado','warning'); return; }
                if (!nome) { toast('Informe o nome do colaborador avaliado','warning'); return; }
            }

            loading(true);
            try {
                const payload = _coletarPayload(container, modeloCompleto, inspecaoId);
                payload.assinatura_inspetor = sigInspetor;
                payload.assinatura_avaliado = sigAvaliado;

                if (!isMaq) {
                    payload.cpf_avaliado   = container.querySelector('#cl-cpf')?.value||'';
                    payload.nome_avaliado  = container.querySelector('#cl-nome-av')?.value||'';
                    payload.cargo_avaliado = container.querySelector('#cl-cargo-av')?.value||'';
                } else {
                    // Para máquinas, usar responsável como nome_avaliado (p/ PDF)
                    const resp = container.querySelector('[data-key="responsavel_maquina"]')?.value ||
                                 container.querySelector('[data-key="responsavel_veiculo"]')?.value || '';
                    payload.nome_avaliado = resp;
                    payload.cabecalho     = coletarCabecalho(container);
                }

                if (estaOnline()) {
                    let pid = preenchimentoId;
                    if (pid) {
                        await apiCL.atualizar(pid, payload);
                    } else {
                        const novo = await apiCL.salvar(payload);
                        pid = novo.id;
                        preenchimentoId = pid;
                    }
                    toast('Checklist salvo!');
                    const btnZ = container.querySelector('#btn-zapsign');
                    if (btnZ) {
                        btnZ.style.display = 'inline-flex';
                        btnZ.onclick = () => abrirModalZapSign(container, pid, payload);
                    }
                    // Propor criação de NCs para itens NÃO CONFORME
                    // Não usamos await — o modal é assíncrono e não deve bloquear o retorno
                    _proporNCs(container, pid, payload, modeloCompleto, inspecaoId, navigate);
                    voltarCL();
                } else {
                    await salvarOffline(payload);
                    toast('📵 Salvo offline — será sincronizado quando conectar');
                    atualizarBadge();
                }
                voltarCL();
            } catch(e) { toast(e.message,'error'); }
            finally { loading(false); }
        };

        // Upload foto
        container.querySelectorAll('.foto-input').forEach(input=>{
            input.addEventListener('change', async function(){
                const file=this.files[0];
                const itemId=parseInt(this.dataset.item);
                if(!file)return;
                const b64=await new Promise((res,rej)=>{
                    const rd=new FileReader();
                    rd.onload=e=>res(e.target.result.split(',')[1]);
                    rd.onerror=rej;
                    rd.readAsDataURL(file);
                });
                if(!estaOnline()){ toast('Foto será enviada quando conectar','warning'); return; }
                loading(true);
                try{
                    let pid=preenchimentoId;
                    if(!pid){
                        const novo=await apiCL.salvar(_coletarPayload(container,modeloCompleto,inspecaoId));
                        pid=novo.id; preenchimentoId=pid;
                    }
                    const result=await fetch('/api/checklists/foto',{method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({preenchimento_id:pid,item_id:itemId,filename:file.name,base64:b64})
                    }).then(r=>r.json());
                    const cell=container.querySelector(`.foto-cell[data-item="${itemId}"]`);
                    if(result.foto_url){
                        cell.innerHTML=`<a href="${result.foto_url}" target="_blank"><img src="${result.foto_url}" style="width:34px;height:34px;object-fit:cover;border-radius:4px"></a>`;
                        toast('Foto enviada ✓');
                    }else{
                        cell.innerHTML=`<span style="font-size:18px">✅</span>`;
                    }
                }catch(e){toast(e.message,'error');}finally{loading(false);}
            });
        });

    } catch(e){ loading(false); toast(e.message,'error'); }
}

function _coletarPayload(container, modelo, inspecaoId) {
    const respostas=[];
    modelo.secoes.forEach(s=>s.itens.forEach(item=>{
        const ch=container.querySelector(`input[name="sit_${item.id}"]:checked`);
        const ob=container.querySelector(`.cl-obs-item[data-item="${item.id}"]`);
        const qt=container.querySelector(`.cl-qtd[data-item="${item.id}"]`);
        respostas.push({item_id:item.id,situacao:ch?.value||null,observacao:ob?.value||null,quantidade:qt?.value||null});
    }));
    return {
        inspecao_id:        inspecaoId,
        modelo_id:          modelo.id,
        preenchido_por:     container.querySelector('#cl-usr')?.value||null,
        resultado_geral:    container.querySelector('#cl-res')?.value||null,
        observacoes_extras: container.querySelector('#cl-obs')?.value||null,
        respostas,
    };
}

// ── Proposta automática de NCs após salvar checklist ──────────
async function _proporNCs(container, pid, payload, modeloCompleto, inspecaoId, navigate) {
    // Itens NÃO CONFORME ou RUIM
    const naoConformes = [];
    payload.respostas.forEach(r => {
        const sit = (r.situacao || '').trim();
        const isNaoConforme = sit && sit !== 'CONFORME' && sit !== 'BOM' &&
                              sit !== 'N/A' && sit !== 'NÃO SE APLICA' && sit !== 'N/A' && sit !== '';
        if (isNaoConforme) {
            // Encontrar descrição do item no modelo
            let descItem = '';
            modeloCompleto.secoes?.forEach(s => {
                s.itens?.forEach(item => {
                    if (item.id === r.item_id) descItem = item.descricao;
                });
            });
            naoConformes.push({ item_id: r.item_id, descricao: descItem, observacao: r.observacao || '' });
        }
    });

    if (naoConformes.length === 0) return;

    // Buscar NCs já existentes desta inspeção para não duplicar
    let ncsExistentes = [];
    try {
        const resp = await fetch(`/api/ncs/?contrato_id=&limit=100`).then(r => r.json());
        ncsExistentes = (resp.data || resp || [])
            .filter(n => n.inspecao_id === inspecaoId)
            .map(n => n.descricao?.toLowerCase());
    } catch(e) {}

    // Filtrar só os que ainda não têm NC
    const pendentes = naoConformes.filter(nc =>
        !ncsExistentes.some(ex => ex && ex.includes(nc.descricao.toLowerCase().substring(0, 30)))
    );

    if (pendentes.length === 0) return;

    // Mostrar modal
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;
        display:flex;align-items:center;justify-content:center;padding:20px
    `;

    const nomeAvaliado = payload.nome_avaliado || payload.cabecalho?.responsavel_maquina
                      || payload.cabecalho?.responsavel_veiculo || '';

    overlay.innerHTML = `
    <div style="background:var(--fundo2,#fff);border-radius:16px;padding:28px;max-width:600px;
                width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.4)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <span style="font-size:24px">⚠️</span>
            <div style="font-size:16px;font-weight:800;color:var(--texto,#111)">
                ${pendentes.length} item(s) NÃO CONFORME${pendentes.length>1?'s':''}
            </div>
        </div>
        <div style="font-size:13px;color:var(--cinza4,#666);margin-bottom:20px">
            Deseja abrir Não Conformidades para os itens abaixo?
            ${nomeAvaliado ? `<strong style="color:var(--texto,#111)"> — ${nomeAvaliado}</strong>` : ''}
        </div>

        <div id="lista-nc-props" style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
            ${pendentes.map((nc, i) => `
            <div style="background:var(--cinza1,#f5f5f5);border-radius:10px;padding:14px;
                        border-left:4px solid var(--vermelho,#C0392B)">
                <div style="display:flex;align-items:flex-start;gap:10px">
                    <input type="checkbox" class="nc-check" data-idx="${i}"
                           style="margin-top:3px;width:16px;height:16px;cursor:pointer" checked>
                    <div style="flex:1">
                        <div style="font-size:13px;font-weight:700;color:var(--texto,#111);margin-bottom:6px">
                            ${nc.descricao}
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                            <div>
                                <label style="font-size:10px;font-weight:700;color:var(--cinza3,#999);
                                              text-transform:uppercase;display:block;margin-bottom:3px">
                                    Gravidade
                                </label>
                                <select class="nc-grav form-control" data-idx="${i}"
                                        style="font-size:12px;padding:4px 8px">
                                    <option value="BAIXA">BAIXA</option>
                                    <option value="MÉDIA" selected>MÉDIA</option>
                                    <option value="ALTA">ALTA</option>
                                    <option value="CRÍTICA">CRÍTICA</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-size:10px;font-weight:700;color:var(--cinza3,#999);
                                              text-transform:uppercase;display:block;margin-bottom:3px">
                                    Prazo
                                </label>
                                <input type="date" class="nc-prazo form-control" data-idx="${i}"
                                       style="font-size:12px;padding:4px 8px"
                                       value="${_dataMaisDias(7)}">
                            </div>
                        </div>
                        ${nc.observacao ? `
                        <div style="font-size:11px;color:var(--cinza4,#666);margin-top:6px">
                            Obs: ${nc.observacao}
                        </div>` : ''}
                    </div>
                </div>
            </div>`).join('')}
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end">
            <button id="nc-pular" class="btn btn-outline"
                    style="font-size:13px">Pular — criar depois</button>
            <button id="nc-criar" class="btn btn-danger"
                    style="font-size:13px">⚠️ Abrir NCs selecionadas</button>
        </div>
    </div>`;

    document.body.appendChild(overlay);

    // Fechar ao clicar fora
    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector('#nc-pular').onclick = () => overlay.remove();

    overlay.querySelector('#nc-criar').onclick = async () => {
        const checks = overlay.querySelectorAll('.nc-check');
        const gravs  = overlay.querySelectorAll('.nc-grav');
        const prazos = overlay.querySelectorAll('.nc-prazo');

        const selecionadas = pendentes.filter((_, i) => checks[i]?.checked);
        if (selecionadas.length === 0) { overlay.remove(); return; }

        loading(true);
        overlay.remove();

        let criadas = 0;
        for (let i = 0; i < pendentes.length; i++) {
            if (!checks[i]?.checked) continue;
            const nc = pendentes[i];
            try {
                await fetch('/api/ncs/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        descricao:    nc.descricao + (nc.observacao ? `\n\nObs: ${nc.observacao}` : '')
                                    + (nomeAvaliado ? `\n\nColaborador/Máquina: ${nomeAvaliado}` : ''),
                        gravidade:    gravs[i]?.value || 'MÉDIA',
                        prazo:        prazos[i]?.value || null,
                        inspecao_id:  inspecaoId,
                        acao_corretiva: '',
                    })
                });
                criadas++;
            } catch(e) { /* continua */ }
        }

        loading(false);
        if (criadas > 0) {
            toast(`✅ ${criadas} NC${criadas>1?'s':''} aberta${criadas>1?'s':''}!`, 'success');
            // Atualizar contador na lista de checklists
            abrirChecklists(container, inspecaoId, navigate);
        }
    };
}

function _dataMaisDias(dias) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d.toISOString().substring(0, 10);
}


// ── Formulário básico de inspeção ─────────────────────────────
async function abrirForm(container, id, navigate) {
    loading(true);
    try {
        const [municipios,contratos,usuarios,insp]=await Promise.all([
            refComCache('municipios', api.municipios),
            refComCache('contratos', api.contratos),
            refComCache('usuarios', api.usuarios),
            id&&estaOnline()?api.inspecoes.obter(id):Promise.resolve(null),
        ]);
        loading(false);
        container.innerHTML=`
        <div style="max-width:860px">
            <button class="btn btn-outline" id="btn-voltar">← Voltar</button>
            <h2 style="font-size:16px;font-weight:700;margin:16px 0">${id?'Editar':'Nova'} Inspeção de Campo</h2>
            ${!estaOnline()?`<div style="background:rgba(247,147,30,.1);border:1.5px solid var(--laranja);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:var(--laranja);font-weight:600">📵 Offline — campos de seleção limitados</div>`:''}
            <form id="form-insp">
                <div class="card" style="margin-bottom:14px">
                    <div class="card-title">Identificação</div>
                    <div class="form-grid form-grid-3">
                        <div class="form-group"><label>Data <span class="req">*</span></label>
                            <input type="date" name="data_inspecao" class="form-control" required value="${insp?.data_inspecao?.substring(0,10)||hoje()}">
                        </div>
                        <div class="form-group"><label>Tipo <span class="req">*</span></label>
                            <select name="tipo_inspecao" class="form-control" required>
                                ${TIPOS.map(t=>`<option value="${t}" ${insp?.tipo_inspecao===t?'selected':''}>${t}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group"><label>Responsável</label>
                            <select name="usuario_id" class="form-control" id="sel-resp">
                                <option value="">— Selecione —</option>
                                ${usuarios.map(u=>`<option value="${u.id}" ${insp?.usuario_id===u.id?'selected':''}>${u.nome}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group"><label>Município</label>
                            <select name="municipio_id" class="form-control" id="sel-mun">
                                <option value="">— Selecione —</option>
                                ${municipios.map(m=>`<option value="${m.id}" ${insp?.municipio_id===m.id?'selected':''}>${m.nome}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group"><label>Contrato</label>
                            <select name="contrato_id" class="form-control" id="sel-cont">
                                <option value="">— Selecione —</option>
                                ${contratos.map(c=>`<option value="${c.id}" ${insp?.contrato_id===c.id?'selected':''}>${c.codigo}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group"><label>Equipe</label>
                            <input type="text" name="equipe" class="form-control" value="${insp?.equipe||''}">
                        </div>
                        <div class="form-group" style="grid-column:span 3"><label>Local</label>
                            <input type="text" name="local_descricao" class="form-control" value="${insp?.local_descricao||''}">
                        </div>
                    </div>
                </div>
                <div class="card" style="margin-bottom:14px">
                    <div class="card-title">Observações</div>
                    <div class="form-group"><label>Pontos Positivos</label>
                        <textarea name="pontos_positivos" class="form-control">${insp?.pontos_positivos||''}</textarea>
                    </div>
                    <div class="form-group"><label>Observações Gerais</label>
                        <textarea name="observacoes" class="form-control">${insp?.observacoes||''}</textarea>
                    </div>
                </div>
                <div style="display:flex;gap:10px">
                    <button type="submit" class="btn btn-primary">💾 Salvar</button>
                    <button type="button" class="btn btn-outline" id="btn-cancelar">Cancelar</button>
                </div>
            </form>
        </div>`;

        const voltar=()=>renderInspecoes(container,document.getElementById('topbar-actions'),navigate);
        container.querySelector('#btn-voltar').onclick=voltar;
        container.querySelector('#btn-cancelar').onclick=voltar;
        container.querySelector('#form-insp').onsubmit=async e=>{
            e.preventDefault();
            const d=formData(e.target);
            loading(true);
            try{
                if(id){
                    // Edição: só online (precisa de server_id)
                    if(!estaOnline()){toast('📵 Offline — edição disponível apenas com conexão','warning');return;}
                    await api.inspecoes.atualizar(id,d);
                    toast('Atualizada!');
                    voltar();
                } else {
                    // Nova inspeção: tenta online, cai para offline
                    if(estaOnline()){
                        try{
                            const nova = await api.inspecoes.criar(d);
                            toast('Registrada!');
                            // Abrir checklists da nova inspeção diretamente
                            abrirChecklists(container, nova.id, navigate);
                            return;
                        }catch(errOnline){
                            // Rede caiu no meio — salva offline
                            console.warn('[Inspecoes] Falha online, salvando offline:', errOnline);
                        }
                    }
                    // Offline ou falha online
                    const local_id = await salvarInspecaoOffline({...d});
                    toast('📵 Inspeção salva localmente — será enviada ao reconectar');
                    voltar();
                }
            }catch(err){toast(err.message,'error');}finally{loading(false);}
        };
    }catch(e){loading(false);toast(e.message,'error');}
}

function hoje(){return new Date().toISOString().substring(0,10);}

// ── Modal ZapSign ─────────────────────────────────────────────
function abrirModalZapSign(container, preenchimentoId, payload) {
    const nomeColaborador = payload?.nome_avaliado || '';
    const telColabSugerido = payload?.telefone_colaborador || '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="max-width:480px;width:94%">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
            <div style="font-weight:800;font-size:16px">📲 Enviar para Assinatura</div>
            <button class="btn btn-outline btn-sm" id="fechar-zap">✕</button>
        </div>
        <div style="background:var(--laranja-pale);border:1.5px solid var(--laranja);
                    border-radius:8px;padding:12px 14px;margin-bottom:18px;font-size:13px;line-height:1.6">
            <strong>Como funciona:</strong> O sistema gera o PDF do checklist e envia um
            link via <strong>WhatsApp</strong> para o inspetor e o responsável assinarem
            digitalmente. O PDF certificado será salvo automaticamente.
        </div>
        <div class="form-group">
            <label>📱 WhatsApp do Inspetor SESMT <span class="req">*</span></label>
            <input type="tel" id="tel-inspetor" class="form-control"
                   placeholder="91999999999" maxlength="11" style="font-size:15px;letter-spacing:.05em">
            <div style="font-size:11px;color:var(--cinza3);margin-top:4px">Somente números, com DDD.</div>
        </div>
        <div class="form-group">
            <label>📱 WhatsApp do Responsável — ${esc(nomeColaborador)} <span class="req">*</span></label>
            <input type="tel" id="tel-colaborador" class="form-control"
                   placeholder="91999999999" maxlength="11"
                   value="${esc(telColabSugerido)}" style="font-size:15px;letter-spacing:.05em">
        </div>
        <div id="zap-erro" style="display:none;background:rgba(192,57,43,.1);border-radius:8px;
             padding:10px;font-size:12px;color:var(--vermelho);margin-bottom:12px"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
            <button class="btn btn-outline" id="btn-cancelar-zap">Cancelar</button>
            <button class="btn btn-success" id="btn-confirmar-zap">📲 Enviar pelo WhatsApp</button>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    const fechar = () => overlay.remove();
    overlay.querySelector('#fechar-zap').onclick = fechar;
    overlay.querySelector('#btn-cancelar-zap').onclick = fechar;
    overlay.onclick = e => { if (e.target === overlay) fechar(); };

    ['tel-inspetor','tel-colaborador'].forEach(id => {
        overlay.querySelector('#'+id).addEventListener('input', function() {
            this.value = this.value.replace(/\D/g,'').substring(0,11);
        });
    });

    overlay.querySelector('#btn-confirmar-zap').onclick = async () => {
        const telI = overlay.querySelector('#tel-inspetor').value.trim();
        const telC = overlay.querySelector('#tel-colaborador').value.trim();
        const erro = overlay.querySelector('#zap-erro');
        if (!telI||telI.length<10){ erro.textContent='Informe o WhatsApp do inspetor (com DDD).'; erro.style.display='block'; return; }
        if (!telC||telC.length<10){ erro.textContent='Informe o WhatsApp do responsável (com DDD).'; erro.style.display='block'; return; }
        erro.style.display='none';
        const btn=overlay.querySelector('#btn-confirmar-zap');
        btn.disabled=true;
        btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:6px"></div> Criando documento...';
        try {
            const r=await fetch(`/api/zapsign/enviar/${preenchimentoId}`,{
                method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({telefone_inspetor:telI,telefone_colaborador:telC})
            }).then(r=>r.json());
            if(r.ok||r.zapsign_token){
                overlay.querySelector('.modal-box').innerHTML=`
                    <div style="font-weight:800;font-size:16px;margin-bottom:16px">✅ Documento Criado!</div>
                    <div style="background:rgba(26,124,79,.1);border:1.5px solid var(--verde);border-radius:8px;
                                padding:12px 14px;margin-bottom:18px;font-size:13px;line-height:1.6;color:var(--verde)">
                        Documento gerado. Envie os links para cada signatário via WhatsApp.
                    </div>
                    ${(r.signers||[]).map((s,i)=>`
                    <div style="margin-bottom:12px;padding:12px;background:var(--cinza1);border-radius:8px">
                        <div style="font-size:11px;font-weight:700;color:var(--cinza4);text-transform:uppercase;margin-bottom:6px">
                            ${i===0?'👷 Inspetor SESMT':'👤 Responsável'}
                        </div>
                        <div style="font-size:13px;font-weight:600;margin-bottom:8px">${s.nome||''}</div>
                        <div style="display:flex;gap:8px;align-items:center">
                            <input type="text" value="${s.sign_url||''}" readonly
                                style="flex:1;font-size:11px;padding:6px 10px;border:1px solid var(--cinza2);border-radius:6px;background:#fff;color:var(--cinza4)">
                            <button class="btn btn-dark btn-sm" onclick="navigator.clipboard.writeText('${s.sign_url||''}');this.innerHTML='✅ Copiado'">📋 Copiar</button>
                            <a href="https://wa.me/55${i===0?telI:telC}?text=${encodeURIComponent('Documento aguardando assinatura: '+(s.sign_url||''))}"
                               target="_blank" class="btn btn-success btn-sm">📲 WhatsApp</a>
                        </div>
                    </div>`).join('')}
                    <div style="text-align:right;margin-top:16px">
                        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
                    </div>`;
            } else {
                erro.textContent=r.erro||'Erro ao criar documento. Tente novamente.';
                erro.style.display='block'; btn.disabled=false; btn.innerHTML='📲 Enviar pelo WhatsApp';
            }
        } catch(e) {
            erro.textContent='Erro de conexão: '+e.message;
            erro.style.display='block'; btn.disabled=false; btn.innerHTML='📲 Enviar pelo WhatsApp';
        }
    };
}

// ── Download de PDF individual de Checklist ───────────────────────────────────
async function baixarPDFChecklist(pid, cod, btn) {
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳';
    try {
        const resp = await fetch(`/api/checklists/preenchimento/${pid}/pdf`, { credentials: 'include' });
        if (!resp.ok) {
            const j = await resp.json().catch(() => ({}));
            toast(j.erro || 'Erro ao gerar PDF', 'error');
            return;
        }
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${cod || 'CHECKLIST'}.pdf`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
        toast('📄 PDF do checklist gerado!');
    } catch(e) {
        toast('Erro ao baixar PDF: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

// ── Download de Relatório PDF da Inspeção ─────────────────────────────────────
async function baixarRelatorioPDF(id, codigo, btn) {
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳';
    try {
        const resp = await fetch(`/api/inspecoes/${id}/pdf`, { credentials: 'include' });
        if (!resp.ok) {
            const j = await resp.json().catch(() => ({}));
            toast(j.erro || 'Erro ao gerar PDF', 'error');
            return;
        }
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${codigo || 'INSP'}_RELATORIO.pdf`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
        toast('📄 Relatório PDF gerado!');
    } catch(e) {
        toast('Erro ao baixar PDF: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

// ── Helper ────────────────────────────────────────────────────
function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
