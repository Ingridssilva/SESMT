import { api }                              from '../js/api.js';
import { toast, loading, confirm, fmt,
         fillSelect, formData }             from '../js/ui.js';
import { salvarOffline, salvarLiderancaOffline,
         listarLiderancaOffline, deletarLiderancaOffline,
         listarTodos, deletarOffline, sync,
         estaOnline, atualizarBadge,
         refComCache, preCarregarRefs }     from '../js/offline.js';
import { criarModalAssinatura }             from '../js/signature.js';

const TIPOS = ['NR-10','NR-35','NR-18','NR-06','NR-12','AMBIENTAL','GERAL','OUTRA'];

const apiCL = {
    modelos:   ()      => fetch('/api/checklists/modelos?tipo=lideranca').then(r=>r.json()),
    modelo:    (id)    => fetch(`/api/checklists/modelo/${id}`).then(r=>r.json()),
    listar:    (p={})  => fetch('/api/checklists/preenchimentos?'+new URLSearchParams(p)).then(r=>r.json()),
    salvar:    (d)     => fetch('/api/checklists/preenchimentos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(r=>r.json()),
    atualizar: (id,d)  => fetch(`/api/checklists/preenchimento/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(r=>r.json()),
    deletar:   (id)    => fetch(`/api/checklists/preenchimento/${id}`,{method:'DELETE'}).then(r=>r.json()),
    assinaturas:(id,d) => fetch(`/api/checklists/preenchimento/${id}/assinaturas`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(r=>r.json()),
};

const COR_SIT = { 'BOM':'#1A7C4F','CONFORME':'#1A7C4F','RUIM':'#C0392B','NÃO CONFORME':'#C0392B','N/A':'#9E9E9E' };

export async function renderLideranca(container, actions, navigate) {
    actions.innerHTML = `<button class="btn btn-primary" id="btn-nova">+ Nova Ins. Liderança</button>`;
    document.getElementById('btn-nova').onclick = () => abrirForm(container, null, navigate);
    await carregarLista(container, navigate);
}

// ── Lista principal ───────────────────────────────────────────
async function carregarLista(container, navigate, filtros = {}) {
    loading(true);
    try {
        // Buscar online e offline simultaneamente
        const [itensOnline, itensOffline] = await Promise.all([
            estaOnline() ? api.lideranca.listar(filtros).catch(()=>[]) : Promise.resolve([]),
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
                <span>📋 Inspeções de Liderança</span>
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
                            // Pendentes offline primeiro
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
                            // Online
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
                                    <button class="btn btn-outline btn-sm" data-edit="${i.id}">✏️</button>
                                    <button class="btn btn-outline btn-sm" data-del="${i.id}">🗑</button>
                                </td>
                            </tr>`)
                          ].join('')}
                    </tbody>
                </table>
            </div>
        </div>`;

        // Sync
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
        container.querySelectorAll('[data-edit]').forEach(b =>
            b.onclick=()=>abrirForm(container, parseInt(b.dataset.edit), navigate));
        container.querySelectorAll('[data-del]').forEach(b =>
            b.onclick=async()=>{
                if(!await confirm('Excluir inspeção?'))return;
                loading(true);
                try{ await api.lideranca.deletar(parseInt(b.dataset.del)); toast('Excluída'); carregarLista(container,navigate,filtros); }
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
async function abrirChecklists(container, liderancaId, navigate) {
    loading(true);
    try {
        const [modelos, preenchimentos] = await Promise.all([
            apiCL.modelos(),
            estaOnline() ? apiCL.listar({lideranca_id: liderancaId}) : Promise.resolve([]),
        ]);
        loading(false);

        // Agrupar preenchimentos por modelo (múltiplos por modelo)
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
                    return `
                    <div class="card" style="margin:0">
                        <!-- Cabeçalho do modelo -->
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                            <div>
                                <div style="font-weight:700;font-size:14px">${m.titulo}</div>
                                <div style="font-size:11px;color:var(--cinza3)">${m.codigo}</div>
                            </div>
                            <button class="btn btn-primary btn-sm" data-novo="${m.id}">
                                + Novo Colaborador
                            </button>
                        </div>

                        ${lista.length === 0 ? `
                        <div style="text-align:center;padding:20px;color:var(--cinza3);font-size:13px;
                                    border:1.5px dashed var(--cinza2);border-radius:8px">
                            Nenhum colaborador avaliado ainda.<br>
                            Clique em <strong>"+ Novo Colaborador"</strong> para iniciar.
                        </div>` : `
                        <div style="display:flex;flex-direction:column;gap:8px">
                            ${lista.map(p => {
                                const nconf = p.qty_nao_conformes || 0;
                                const cor   = nconf > 0 ? 'var(--vermelho)' : 'var(--verde)';
                                const zapSt = p.zapsign_status;
                                const zapBadge = zapSt === 'assinado'
                                    ? `<span style="font-size:10px;background:#1A7C4F;color:#fff;border-radius:4px;padding:2px 7px">✅ Assinado</span>`
                                    : (zapSt === 'enviado' || zapSt === 'parcial')
                                    ? `<span style="font-size:10px;background:#C49A00;color:#fff;border-radius:4px;padding:2px 7px">⏳ Aguardando</span>`
                                    : '';
                                return `
                                <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;
                                            background:var(--cinza1);border-radius:8px;
                                            border-left:4px solid ${cor};flex-wrap:wrap">
                                    <!-- Info colaborador -->
                                    <div style="flex:1;min-width:180px">
                                        <div style="font-weight:700;font-size:13px">
                                            ${p.nome_avaliado || '<span style="color:var(--cinza3)">Sem nome</span>'}
                                        </div>
                                        <div style="font-size:11px;color:var(--cinza4)">
                                            ${p.cargo_avaliado ? p.cargo_avaliado + ' · ' : ''}
                                            ${p.cpf_avaliado ? 'CPF: ' + p.cpf_avaliado : ''}
                                        </div>
                                    </div>
                                    <!-- Resultado -->
                                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                                        <strong style="color:${cor};font-size:12px">${p.resultado_geral || '—'}</strong>
                                        ${nconf > 0 ? `<span class="badge badge-critica">${nconf} NC</span>` : ''}
                                        ${zapBadge}
                                        <span style="font-size:11px;color:var(--cinza3)">${fmt.data(p.created_at)}</span>
                                    </div>
                                    <!-- Ações -->
                                    <div style="display:flex;gap:6px">
                                        <button class="btn btn-outline btn-sm" data-fill="${m.id}" data-pid="${p.id}">✏️ Editar</button>
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

        // Botão novo colaborador — abre seletor inteligente
        container.querySelectorAll('[data-novo]').forEach(b =>
            b.onclick = () => abrirSeletorColaborador(container, parseInt(b.dataset.novo), liderancaId, navigate));

        // Editar preenchimento existente
        container.querySelectorAll('[data-fill]').forEach(b =>
            b.onclick = () => abrirFormChecklist(container, parseInt(b.dataset.fill), liderancaId, b.dataset.pid ? parseInt(b.dataset.pid) : null, navigate));

        // Deletar
        container.querySelectorAll('[data-delp]').forEach(b =>
            b.onclick = async () => {
                if (!await confirm('Excluir este preenchimento?')) return;
                loading(true);
                try {
                    await apiCL.deletar(parseInt(b.dataset.delp));
                    toast('Excluído');
                    abrirChecklists(container, liderancaId, navigate);
                } catch(e) { toast(e.message, 'error'); }
                finally { loading(false); }
            });

    } catch(e) { loading(false); toast(e.message, 'error'); }
}

// ── Seletor rápido de colaboradores ──────────────────────────
async function abrirSeletorColaborador(container, modeloId, liderancaId, navigate) {
    // Buscar lista de colaboradores
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

        <!-- Busca -->
        <div style="position:relative;margin-bottom:14px">
            <input type="text" id="busca-colab" placeholder="🔍 Buscar por nome, CPF ou cargo..."
                style="width:100%;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;
                       font-size:13px;font-family:inherit;color:#1A1A1A;background:#fff;box-sizing:border-box;outline:none"
                onfocus="this.style.borderColor='#F7931E'" onblur="this.style.borderColor='#ddd'">
        </div>

        <!-- Tabs -->
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

        <!-- Lista da base -->
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

        <!-- Form manual -->
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

    // Tabs
    overlay.querySelector('#tab-base').onclick = () => {
        overlay.querySelector('#painel-base').style.display = '';
        overlay.querySelector('#painel-manual').style.display = 'none';
        overlay.querySelector('#tab-base').className = 'btn btn-dark btn-sm';
        overlay.querySelector('#tab-manual').className = 'btn btn-outline btn-sm';
    };
    overlay.querySelector('#tab-manual').onclick = () => {
        overlay.querySelector('#painel-base').style.display = 'none';
        overlay.querySelector('#painel-manual').style.display = '';
        overlay.querySelector('#tab-base').className = 'btn btn-outline btn-sm';
        overlay.querySelector('#tab-manual').className = 'btn btn-dark btn-sm';
    };

    // Busca na lista
    overlay.querySelector('#busca-colab').addEventListener('input', function() {
        const q = this.value.toLowerCase();
        overlay.querySelectorAll('.colab-item').forEach(el => {
            const txt = (el.dataset.nome + el.dataset.cpf + el.dataset.cargo).toLowerCase();
            el.style.display = txt.includes(q) ? '' : 'none';
        });
    });

    // Máscara CPF manual
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

    // Selecionar da lista
    overlay.querySelectorAll('.colab-item').forEach(el => {
        el.addEventListener('mouseover', () => {
            el.style.background = '#FFF4E8';
            el.style.borderColor = '#F7931E';
        });
        el.addEventListener('mouseout', () => {
            el.style.background = '#fff';
            el.style.borderColor = '#eee';
        });
        el.onclick = () => {
            fechar();
            abrirFormChecklist(container, modeloId, liderancaId, null, navigate, {
                cpf:      el.dataset.cpf,
                nome:     el.dataset.nome,
                cargo:    el.dataset.cargo,
                telefone: el.dataset.tel,
            });
        };
    });

    // Confirmar manual
    const btnManual = overlay.querySelector('#btn-confirmar-manual');
    if (btnManual) {
        btnManual.onclick = () => {
            const cpf  = overlay.querySelector('#m-cpf').value;
            const nome = overlay.querySelector('#m-nome').value.trim();
            if (!cpf || cpf.length < 14) { toast('CPF inválido','warning'); return; }
            if (!nome) { toast('Informe o nome','warning'); return; }
            fechar();
            abrirFormChecklist(container, modeloId, liderancaId, null, navigate, {
                cpf,
                nome,
                cargo:    overlay.querySelector('#m-cargo').value.trim(),
                telefone: overlay.querySelector('#m-tel').value.trim(),
            });
        };
    }
}

// ── Formulário de preenchimento com CPF + Assinatura + Offline ─
async function abrirFormChecklist(container, modeloId, liderancaId, preenchimentoId, navigate, colaboradorPreSelecionado = null) {
    loading(true);
    try {
        const [modelo, usuarios, existente] = await Promise.all([
            apiCL.modelo(modeloId),
            estaOnline() ? api.usuarios() : Promise.resolve([]),
            preenchimentoId ? fetch(`/api/checklists/preenchimento/${preenchimentoId}`).then(r=>r.json()) : Promise.resolve(null),
        ]);
        loading(false);

        const rMap = {};
        (existente?.respostas||[]).forEach(r=>{ rMap[r.item_id]=r; });
        const tipos = modelo.tipo_situacao || ['CONFORME','NÃO CONFORME','N/A'];
        const temQuant = tipos.includes('BOM');

        container.innerHTML = `
        <div style="max-width:1000px">
            <button class="btn btn-outline" id="btn-vcl">← Voltar</button>
            <h2 style="font-size:15px;font-weight:700;margin:16px 0">
                ${modelo.titulo}
                <span style="font-size:11px;color:var(--cinza3);font-weight:400;margin-left:8px">${modelo.codigo}</span>
                ${!estaOnline()?'<span style="font-size:11px;background:var(--laranja);color:#fff;border-radius:4px;padding:2px 8px;margin-left:8px">📵 OFFLINE</span>':''}
            </h2>

            <!-- Identificação do avaliado -->
            <div class="card" style="margin-bottom:14px;border-left:4px solid var(--laranja)">
                <div class="card-title">👤 Colaborador Avaliado</div>
                <div class="form-grid form-grid-3">
                    <div class="form-group">
                        <label>CPF <span class="req">*</span></label>
                        <div style="display:flex;gap:8px">
                            <input type="text" id="cl-cpf" class="form-control"
                                   placeholder="000.000.000-00" maxlength="14"
                                   value="${existente?.cpf_avaliado || colaboradorPreSelecionado?.cpf || ''}"
                                   style="flex:1">
                            ${estaOnline()?`<button type="button" class="btn btn-outline btn-sm" id="btn-buscar-cpf" style="white-space:nowrap">🔍 Buscar</button>`:''}
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Nome Completo <span class="req">*</span></label>
                        <input type="text" id="cl-nome-av" class="form-control"
                               placeholder="Nome do colaborador"
                               value="${existente?.nome_avaliado || colaboradorPreSelecionado?.nome || ''}">
                    </div>
                    <div class="form-group">
                        <label>Cargo / Função</label>
                        <input type="text" id="cl-cargo-av" class="form-control"
                               placeholder="Ex: Eletricista"
                               value="${existente?.cargo_avaliado || colaboradorPreSelecionado?.cargo || ''}">
                    </div>
                </div>
            </div>

            <!-- Cabeçalho -->
            <div class="card" style="margin-bottom:14px">
                <div class="card-title">Responsável pela Inspeção</div>
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
                        <input type="text" class="form-control" id="cl-obs" value="${existente?.observacoes_extras||''}">
                    </div>
                </div>
            </div>

            <!-- Seções de itens -->
            ${modelo.secoes.map(secao=>`
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
                                ${temQuant?`<td>
                                    <input type="number" class="form-control cl-qtd" data-item="${item.id}"
                                        value="${resp.quantidade||''}" min="0"
                                        style="padding:4px 6px;text-align:center;width:60px">
                                </td>`:''}
                                <td>
                                    <input type="text" class="form-control cl-obs-item" data-item="${item.id}"
                                        value="${resp.observacao||''}" placeholder="obs..."
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

        // Máscara CPF
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

        // Buscar CPF online
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
                    } else {
                        toast('CPF não encontrado — preencha manualmente','warning');
                    }
                } catch(e) { toast('Erro ao buscar CPF','error'); }
            };
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

        // Botão ZapSign — ligar onclick (visível ao editar, oculto ao criar)
        const btnZapInicial = container.querySelector('#btn-zapsign');
        if (btnZapInicial) {
            btnZapInicial.onclick = () => {
                const nomeAv = container.querySelector('#cl-nome-av')?.value || '';
                const telAv  = existente?.telefone_colaborador || '';
                abrirModalZapSign(container, preenchimentoId, {
                    nome_avaliado:        nomeAv,
                    telefone_colaborador: telAv,
                });
            };
        }

        // Variáveis de assinatura offline
        let sigInspetor = null, sigAvaliado = null;

        // Botão assinatura offline (canvas) — só aparece quando offline
        const btnAssinar = container.querySelector('#btn-assinar');
        if (btnAssinar) {
            btnAssinar.onclick = async () => {
                const nomeInspetor = container.querySelector('#cl-usr')?.selectedOptions[0]?.text || '';
                const nomeAvaliado = container.querySelector('#cl-nome-av')?.value || '';
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

        const voltarCL=()=>abrirChecklists(container, liderancaId, navigate);
        container.querySelector('#btn-vcl').onclick=voltarCL;
        container.querySelector('#btn-cancel-cl').onclick=voltarCL;

        // Salvar
        container.querySelector('#btn-save-cl').onclick = async () => {
            // Validar CPF e nome
            const cpf  = container.querySelector('#cl-cpf')?.value||'';
            const nome = container.querySelector('#cl-nome-av')?.value||'';
            if (!cpf || cpf.length < 14) { toast('Informe o CPF do colaborador avaliado','warning'); return; }
            if (!nome) { toast('Informe o nome do colaborador avaliado','warning'); return; }

            loading(true);
            try {
                const payload = await _coletarPayload(container, modelo, liderancaId, null);
                payload.cpf_avaliado       = cpf;
                payload.nome_avaliado      = nome;
                payload.cargo_avaliado     = container.querySelector('#cl-cargo-av')?.value||'';
                payload.assinatura_inspetor = sigInspetor;
                payload.assinatura_avaliado = sigAvaliado;

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
                    // Mostrar botão ZapSign após salvar
                    const btnZ = container.querySelector('#btn-zapsign');
                    if (btnZ) {
                        btnZ.style.display = 'inline-flex';
                        btnZ.onclick = () => abrirModalZapSign(container, pid, payload);
                    }
                } else {
                    // Salvar offline no IndexedDB
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
                        const novo=await apiCL.salvar(await _coletarPayload(container,modelo,liderancaId,null));
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

async function _coletarPayload(container, modelo, liderancaId, preenchimentoId) {
    const respostas=[];
    modelo.secoes.forEach(s=>s.itens.forEach(item=>{
        const ch=container.querySelector(`input[name="sit_${item.id}"]:checked`);
        const ob=container.querySelector(`.cl-obs-item[data-item="${item.id}"]`);
        const qt=container.querySelector(`.cl-qtd[data-item="${item.id}"]`);
        respostas.push({item_id:item.id,situacao:ch?.value||null,observacao:ob?.value||null,quantidade:qt?.value||null});
    }));
    return {
        lideranca_id:        liderancaId,
        modelo_id:          modelo.id,
        preenchido_por:     container.querySelector('#cl-usr')?.value||null,
        resultado_geral:    container.querySelector('#cl-res')?.value||null,
        observacoes_extras: container.querySelector('#cl-obs')?.value||null,
        respostas,
    };
}

// ── Formulário básico de inspeção ─────────────────────────────
async function abrirForm(container, id, navigate) {
    loading(true);
    try {
        const [municipios,contratos,usuarios,insp]=await Promise.all([
            refComCache('municipios', api.municipios),
            refComCache('contratos', api.contratos),
            refComCache('usuarios', api.usuarios),
            id&&estaOnline()?api.lideranca.obter(id):Promise.resolve(null),
        ]);
        loading(false);
        container.innerHTML=`
        <div style="max-width:860px">
            <button class="btn btn-outline" id="btn-voltar">← Voltar</button>
            <h2 style="font-size:16px;font-weight:700;margin:16px 0">${id?'Editar':'Nova'} Inspeção de Liderança</h2>
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

        const voltar=()=>renderLideranca(container,document.getElementById('topbar-actions'),navigate);
        container.querySelector('#btn-voltar').onclick=voltar;
        container.querySelector('#btn-cancelar').onclick=voltar;
        container.querySelector('#form-insp').onsubmit=async e=>{
            e.preventDefault();
            const d=formData(e.target);
            loading(true);
            try{
                if(id){
                    if(!estaOnline()){toast('📵 Offline — edição disponível apenas com conexão','warning');return;}
                    await api.lideranca.atualizar(id,d);
                    toast('Atualizada!');
                    voltar();
                } else {
                    if(estaOnline()){
                        try{
                            const nova = await api.lideranca.criar(d);
                            toast('Registrada!');
                            abrirChecklists(container, nova.id, navigate);
                            return;
                        }catch(errOnline){
                            console.warn('[Lideranca] Falha online, salvando offline:', errOnline);
                        }
                    }
                    const local_id = await salvarLiderancaOffline({...d});
                    toast('📵 Inspeção salva localmente — será enviada ao reconectar');
                    voltar();
                }
            }catch(err){toast(err.message,'error');}finally{loading(false);}
        };
    }catch(e){loading(false);toast(e.message,'error');}
}

function hoje(){return new Date().toISOString().substring(0,10);}

// ── Modal ZapSign — pede telefones e envia ────────────────────
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
            link via <strong>WhatsApp</strong> para o inspetor e o colaborador assinarem
            digitalmente. O PDF certificado será salvo automaticamente.
        </div>

        <div class="form-group">
            <label>📱 WhatsApp do Inspetor SESMT <span class="req">*</span></label>
            <input type="tel" id="tel-inspetor" class="form-control"
                   placeholder="91999999999" maxlength="11"
                   style="font-size:15px;letter-spacing:.05em">
            <div style="font-size:11px;color:var(--cinza3);margin-top:4px">Somente números, com DDD. Ex: 91999999999</div>
        </div>

        <div class="form-group">
            <label>📱 WhatsApp do Colaborador — ${nomeColaborador} <span class="req">*</span></label>
            <input type="tel" id="tel-colaborador" class="form-control"
                   placeholder="91999999999" maxlength="11"
                   value="${telColabSugerido}"
                   style="font-size:15px;letter-spacing:.05em">
        </div>

        <div id="zap-erro" style="display:none;background:rgba(192,57,43,.1);border-radius:8px;
             padding:10px;font-size:12px;color:var(--vermelho);margin-bottom:12px"></div>

        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
            <button class="btn btn-outline" id="btn-cancelar-zap">Cancelar</button>
            <button class="btn btn-success" id="btn-confirmar-zap">
                📲 Enviar pelo WhatsApp
            </button>
        </div>
    </div>`;

    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    overlay.querySelector('#fechar-zap').onclick = fechar;
    overlay.querySelector('#btn-cancelar-zap').onclick = fechar;
    overlay.onclick = e => { if (e.target === overlay) fechar(); };

    // Mascarar telefones
    ['tel-inspetor','tel-colaborador'].forEach(id => {
        overlay.querySelector('#'+id).addEventListener('input', function() {
            this.value = this.value.replace(/\D/g,'').substring(0,11);
        });
    });

    overlay.querySelector('#btn-confirmar-zap').onclick = async () => {
        const telI = overlay.querySelector('#tel-inspetor').value.trim();
        const telC = overlay.querySelector('#tel-colaborador').value.trim();
        const erro = overlay.querySelector('#zap-erro');

        if (!telI || telI.length < 10) {
            erro.textContent = 'Informe o WhatsApp do inspetor (com DDD).';
            erro.style.display = 'block'; return;
        }
        if (!telC || telC.length < 10) {
            erro.textContent = 'Informe o WhatsApp do colaborador (com DDD).';
            erro.style.display = 'block'; return;
        }

        erro.style.display = 'none';
        const btn = overlay.querySelector('#btn-confirmar-zap');
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:6px"></div> Criando documento...';

        try {
            const r = await fetch(`/api/zapsign/enviar/${preenchimentoId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telefone_inspetor:    telI,
                    telefone_colaborador: telC,
                })
            }).then(r => r.json());

            if (r.ok || r.zapsign_token) {
                // Mostrar links de assinatura
                const signers = r.signers || [];
                const linksHtml = signers.map((s, i) => `
                    <div style="margin-bottom:12px;padding:12px;background:var(--cinza1);border-radius:8px">
                        <div style="font-size:11px;font-weight:700;color:var(--cinza4);text-transform:uppercase;margin-bottom:6px">
                            ${i === 0 ? '👷 Inspetor SESMT' : '👤 Colaborador Avaliado'}
                        </div>
                        <div style="font-size:13px;font-weight:600;margin-bottom:8px">${s.nome || ''}</div>
                        <div style="display:flex;gap:8px;align-items:center">
                            <input type="text" value="${s.sign_url || ''}" readonly
                                style="flex:1;font-size:11px;padding:6px 10px;border:1px solid var(--cinza2);border-radius:6px;background:#fff;color:var(--cinza4)">
                            <button class="btn btn-dark btn-sm" onclick="navigator.clipboard.writeText('${s.sign_url || ''}');this.innerHTML='✅ Copiado'">
                                📋 Copiar
                            </button>
                            <a href="https://wa.me/55${i === 0 ? telI : telC}?text=${encodeURIComponent('Olá! Você tem um documento aguardando sua assinatura: ' + (s.sign_url || ''))}"
                               target="_blank" class="btn btn-success btn-sm">
                                📲 WhatsApp
                            </a>
                        </div>
                    </div>
                `).join('');

                overlay.querySelector('.modal-box').innerHTML = `
                    <div style="font-weight:800;font-size:16px;margin-bottom:16px">✅ Documento Criado!</div>
                    <div style="background:rgba(26,124,79,.1);border:1.5px solid var(--verde);border-radius:8px;
                                padding:12px 14px;margin-bottom:18px;font-size:13px;line-height:1.6;color:var(--verde)">
                        <strong>Documento gerado com sucesso.</strong> Envie os links abaixo para cada signatário via WhatsApp.
                        Clique em "📲 WhatsApp" para abrir a conversa direto.
                    </div>
                    ${linksHtml}
                    <div style="text-align:right;margin-top:16px">
                        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
                    </div>
                `;

                // Atualizar botão na tela
                const btnZ = container.querySelector('#btn-zapsign');
                if (btnZ) {
                    btnZ.innerHTML = '⏳ Aguardando Assinaturas';
                    btnZ.style.background = 'var(--cinza3)';
                    btnZ.disabled = true;
                }
            } else {
                erro.textContent = r.erro || 'Erro ao criar documento. Tente novamente.';
                erro.style.display = 'block';
                btn.disabled = false;
                btn.innerHTML = '📲 Enviar pelo WhatsApp';
            }
        } catch(e) {
            erro.textContent = 'Erro de conexão: ' + e.message;
            erro.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = '📲 Enviar pelo WhatsApp';
        }
    };
}
