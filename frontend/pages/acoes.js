import { api }                       from '../js/api.js';
import { toast, loading, confirm,
         fmt, badgeTipo, fillSelect,
         formData }                   from '../js/ui.js';
import { estaOnline }                 from '../js/offline.js';

const TIPOS = ['Cliente', 'Interno', 'Comunidade', 'Treinamento', 'Outro'];
const MES_NOME = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                       'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const COR_TIPO = {
    'Cliente':        '#1B4F8A',
    'Interno':     '#2870C2',
    'Comunidade':  '#6C3483',
    'Treinamento': '#C49A00',
    'Outro':       '#9E9E9E',
};

export async function renderAcoes(container, actions, navigate) {
    actions.innerHTML = `<button class="btn btn-primary" id="btn-nova">+ Nova Ação</button>`;
    document.getElementById('btn-nova').onclick = () => {
        if (!estaOnline()) { toast('📵 Criação de Ações indisponível offline', 'warning'); return; }
        abrirForm(container, null, actions, navigate);
    };
    await carregarLista(container, actions, navigate);
}

async function carregarLista(container, actions, navigate, filtros = {}) {
    loading(true);

    if (!estaOnline()) {
        loading(false);
        container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                    padding:60px 20px;text-align:center;color:#888">
            <div style="font-size:48px;margin-bottom:16px">📵</div>
            <h3 style="color:#333;margin-bottom:8px">Você está offline</h3>
            <p style="font-size:14px;max-width:360px">
                Ações SESMT não estão disponíveis offline.<br>
                Os dados serão exibidos quando a conexão for restabelecida.
            </p>
        </div>`;
        return;
    }

    try {
        const [itens, statsData, contratos] = await Promise.all([
            api.acoes.listar(filtros),
            api.acoes.stats(),
            api.contratos(),
        ]);

        const totalAcoes   = statsData.totais?.total_acoes   || 0;
        const totalPessoas = statsData.totais?.total_pessoas  || 0;
        const porTipo      = statsData.por_tipo || [];
        const mensal       = statsData.mensal   || [];

        container.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:16px">
            <div class="kpi kpi-laranja">
                <div class="kpi-label">Total de Ações</div>
                <div class="kpi-value laranja">${totalAcoes}</div>
                <div class="kpi-sub">${new Date().getFullYear()}</div>
            </div>
            <div class="kpi kpi-laranja">
                <div class="kpi-label">Pessoas Impactadas</div>
                <div class="kpi-value laranja">${totalPessoas}</div>
                <div class="kpi-sub">acumulado no ano</div>
            </div>
            ${porTipo.map(t => `
            <div class="kpi" style="border-top:3px solid ${COR_TIPO[t.tipo]||'#ccc'}">
                <div class="kpi-label">${t.tipo}</div>
                <div class="kpi-value" style="font-size:22px;color:${COR_TIPO[t.tipo]||'#333'}">${t.qtd}</div>
                <div class="kpi-sub">${t.pessoas || 0} pessoas</div>
            </div>`).join('')}
        </div>

        ${mensal.length > 0 || porTipo.length > 0 ? `
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px">
            <div class="card" style="margin:0">
                <div class="card-title">📅 Evolução Mensal — ${new Date().getFullYear()}</div>
                <div style="position:relative;height:220px">
                    <canvas id="chart-mensal"></canvas>
                </div>
            </div>
            <div class="card" style="margin:0">
                <div class="card-title">🎯 Distribuição por Tipo</div>
                <div style="position:relative;height:220px;display:flex;align-items:center;justify-content:center">
                    <canvas id="chart-tipo"></canvas>
                </div>
            </div>
        </div>` : ""}

        <div class="filtros">
            <div class="form-group"><label>Tipo</label>
                <select class="form-control" id="f-tipo">
                    <option value="">Todos</option>
                    ${TIPOS.map(t => `<option value="${t}" ${filtros.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>Contrato</label>
                <select class="form-control" id="f-contrato">
                    <option value="">Todos</option>
                    ${contratos.map(c => `<option value="${c.codigo}" ${filtros.contrato === c.codigo ? 'selected' : ''}>${c.codigo}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>De</label>
                <input type="date" class="form-control" id="f-dini" value="${filtros.data_ini || ''}">
            </div>
            <div class="form-group"><label>Até</label>
                <input type="date" class="form-control" id="f-dfim" value="${filtros.data_fim || ''}">
            </div>
            <div class="form-group"><label>Busca</label>
                <input type="text" class="form-control" id="f-q"
                       placeholder="Evento..." value="${filtros.q || ''}" style="min-width:160px">
            </div>
            <div class="form-group" style="align-self:flex-end">
                <button class="btn btn-dark" id="btn-filtrar">Filtrar</button>
            </div>
        </div>

        <div class="card">
            <div class="card-title" style="justify-content:space-between">
                <span>📋 Registro de Ações</span>
                <span style="font-size:12px;color:var(--cinza3)">${itens.length} registro(s)</span>
            </div>
            <div class="table-wrap">
                <table>
                    <thead><tr>
                        <th>Data</th><th>Tipo</th><th>Evento</th><th>Colaborador</th>
                        <th>Cargo</th><th>Contrato</th><th style="text-align:center">Pessoas</th><th></th>
                    </tr></thead>
                    <tbody>
                    ${itens.length === 0
                        ? `<tr><td colspan="8" style="text-align:center;padding:36px;color:var(--cinza3)">Nenhuma ação encontrada</td></tr>`
                        : itens.map(a => `<tr>
                            <td style="white-space:nowrap;color:var(--cinza4)">${fmt.data(a.data_evento)}</td>
                            <td>${badgeTipo(a.tipo)}</td>
                            <td style="max-width:280px"><div style="font-weight:600;line-height:1.3">${truncar(a.evento, 70)}</div></td>
                            <td style="white-space:nowrap">${a.colaborador_nome || a.colaborador_nome_lookup || '—'}</td>
                            <td style="color:var(--cinza4);font-size:12px">${a.cargo || a.cargo_lookup || '—'}</td>
                            <td><span style="font-size:12px;color:var(--cinza4)">${a.contrato || '—'}</span></td>
                            <td style="text-align:center"><strong style="color:var(--laranja);font-size:15px">${a.pessoas_impactadas || 0}</strong></td>
                            <td style="white-space:nowrap">
                                <button class="btn btn-outline btn-sm" data-view="${a.id}">👁</button>
                                <button class="btn btn-outline btn-sm" data-edit="${a.id}">✏️</button>
                                <button class="btn btn-outline btn-sm" data-del="${a.id}">🗑</button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;

        // Gráfico mensal
        if (mensal.length > 0) {
            const todosMeses = Array.from({length: 12}, (_, i) => i + 1);
            const mesMap = {};
            mensal.forEach(m => { mesMap[m.mes] = m; });
            const labels  = todosMeses.map(m => MES_NOME[m]);
            const pessoas = todosMeses.map(m => mesMap[m]?.pessoas || 0);
            const acoes   = todosMeses.map(m => mesMap[m]?.acoes   || 0);

            new Chart(document.getElementById('chart-mensal'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Pessoas Impactadas',
                            data: pessoas,
                            backgroundColor: todosMeses.map(m => mesMap[m] ? 'rgba(247,147,30,.8)' : 'rgba(247,147,30,.12)'),
                            borderColor: 'rgba(247,147,30,1)',
                            borderWidth: 1,
                            borderRadius: 4,
                            borderSkipped: false,
                            yAxisID: 'y',
                            order: 2,
                        },
                        {
                            label: 'Nº de Ações',
                            data: acoes,
                            type: 'line',
                            borderColor: '#1B4F8A',
                            backgroundColor: 'rgba(27,79,138,.08)',
                            pointBackgroundColor: '#1B4F8A',
                            pointRadius: acoes.map(v => v > 0 ? 5 : 2),
                            tension: 0.3,
                            fill: false,
                            yAxisID: 'y2',
                            order: 1,
                            borderWidth: 2,
                        },
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y:  { beginAtZero: true, position: 'left',  grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { size: 11 } }, title: { display: true, text: 'Pessoas', font: { size: 11 } } },
                        y2: { beginAtZero: true, position: 'right', grid: { display: false },           ticks: { font: { size: 11 }, stepSize: 1 }, title: { display: true, text: 'Ações', font: { size: 11 } }, suggestedMax: Math.max(...acoes) + 2 || 5 },
                        x:  { grid: { display: false }, ticks: { font: { size: 11 } } }
                    },
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 16 } },
                        tooltip: { callbacks: { label: ctx => ctx.dataset.label === 'Pessoas Impactadas' ? ` ${ctx.parsed.y} pessoas` : ` ${ctx.parsed.y} ação(ões)` } }
                    }
                }
            });
        }

        // Donut por tipo
        if (porTipo.length > 0) {
            new Chart(document.getElementById('chart-tipo'), {
                type: 'doughnut',
                data: {
                    labels: porTipo.map(t => t.tipo),
                    datasets: [{
                        data: porTipo.map(t => t.qtd),
                        backgroundColor: porTipo.map(t => COR_TIPO[t.tipo] || '#ccc'),
                        borderColor: '#fff',
                        borderWidth: 3,
                        hoverOffset: 8,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '62%',
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
                        tooltip: { callbacks: { label: ctx => { const total = ctx.dataset.data.reduce((a,b)=>a+b,0); return ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed/total*100)}%)`; } } }
                    }
                }
            });
        }

        container.querySelector('#btn-filtrar').onclick = () => {
            const f = { tipo: container.querySelector('#f-tipo').value, contrato: container.querySelector('#f-contrato').value, data_ini: container.querySelector('#f-dini').value, data_fim: container.querySelector('#f-dfim').value, q: container.querySelector('#f-q').value };
            Object.keys(f).forEach(k => !f[k] && delete f[k]);
            carregarLista(container, actions, navigate, f);
        };
        container.querySelector('#f-q').onkeydown = e => { if (e.key === 'Enter') container.querySelector('#btn-filtrar').click(); };
        container.querySelectorAll('[data-view]').forEach(b => b.onclick = () => abrirDetalhe(container, parseInt(b.dataset.view), actions, navigate));
        container.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => abrirForm(container, parseInt(b.dataset.edit), actions, navigate));
        container.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
            if (!await confirm('Excluir esta ação?')) return;
            loading(true);
            try { await api.acoes.deletar(parseInt(b.dataset.del)); toast('Ação excluída'); carregarLista(container, actions, navigate); }
            catch(e) { toast(e.message, 'error'); } finally { loading(false); }
        });

    } catch(e) { toast(e.message, 'error'); } finally { loading(false); }
}

async function abrirDetalhe(container, id, actions, navigate) {
    loading(true);
    try {
        const a = await api.acoes.obter(id);
        loading(false);
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
        <div class="modal-box" style="max-width:600px;width:94%">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                <div style="font-weight:700;font-size:15px">Detalhes da Ação</div>
                <button class="btn btn-outline btn-sm" id="fechar-det">✕</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
                <div><div style="font-size:10px;color:var(--cinza3);text-transform:uppercase;margin-bottom:3px">Data</div><div style="font-weight:600">${fmt.data(a.data_evento)}</div></div>
                <div><div style="font-size:10px;color:var(--cinza3);text-transform:uppercase;margin-bottom:3px">Tipo</div><div>${badgeTipo(a.tipo)}</div></div>
                <div><div style="font-size:10px;color:var(--cinza3);text-transform:uppercase;margin-bottom:3px">Colaborador</div><div style="font-weight:600">${a.colaborador_nome||'—'}</div><div style="font-size:12px;color:var(--cinza4)">${a.cargo||''}</div></div>
                <div><div style="font-size:10px;color:var(--cinza3);text-transform:uppercase;margin-bottom:3px">Contrato</div><div>${a.contrato||'—'}</div></div>
                <div><div style="font-size:10px;color:var(--cinza3);text-transform:uppercase;margin-bottom:3px">Pessoas Impactadas</div><div style="font-size:28px;font-weight:800;color:var(--laranja)">${a.pessoas_impactadas||0}</div></div>
            </div>
            <div style="margin-bottom:12px">
                <div style="font-size:10px;color:var(--cinza3);text-transform:uppercase;margin-bottom:6px;font-weight:700">Evento</div>
                <div style="font-weight:600;font-size:14px;line-height:1.4">${a.evento}</div>
            </div>
            ${a.observacoes ? `<div style="background:var(--cinza1);border-radius:6px;padding:12px;font-size:13px;line-height:1.6;color:var(--cinza4)">${a.observacoes.replace(/\n/g, '<br>')}</div>` : ''}
            <div class="modal-btns" style="margin-top:16px">
                <button class="btn btn-primary" id="edit-det">✏️ Editar</button>
                <button class="btn btn-outline" id="fechar-det2">Fechar</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const fechar = () => overlay.remove();
        overlay.querySelector('#fechar-det').onclick = fechar;
        overlay.querySelector('#fechar-det2').onclick = fechar;
        overlay.onclick = e => { if (e.target === overlay) fechar(); };
        overlay.querySelector('#edit-det').onclick = () => { fechar(); abrirForm(container, id, actions, navigate); };
    } catch(e) { loading(false); toast(e.message, 'error'); }
}

async function abrirForm(container, id, actions, navigate) {
    loading(true);
    try {
        const [contratos, usuarios, item] = await Promise.all([
            api.contratos(), api.usuarios(),
            id ? api.acoes.obter(id) : Promise.resolve(null),
        ]);
        loading(false);
        container.innerHTML = `
        <div style="max-width:720px">
            <button class="btn btn-outline" id="btn-voltar">← Voltar</button>
            <h2 style="font-size:16px;font-weight:700;margin:16px 0">${id ? 'Editar' : 'Registrar'} Ação SESMT</h2>
            <form id="form-acao">
                <div class="card" style="margin-bottom:14px">
                    <div class="card-title">Identificação</div>
                    <div class="form-grid form-grid-3">
                        <div class="form-group"><label>Data <span class="req">*</span></label>
                            <input type="date" name="data_evento" class="form-control" required value="${item?.data_evento?.substring(0,10)||today()}">
                        </div>
                        <div class="form-group"><label>Tipo <span class="req">*</span></label>
                            <select name="tipo" class="form-control" required>
                                ${TIPOS.map(t => `<option value="${t}" ${item?.tipo===t?'selected':''}>${t}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group"><label>Contrato</label>
                            <select name="contrato" class="form-control">
                                <option value="">— Selecione —</option>
                                ${contratos.map(c => `<option value="${c.codigo}" ${item?.contrato===c.codigo?'selected':''}>${c.codigo}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                <div class="card" style="margin-bottom:14px">
                    <div class="card-title">Responsável</div>
                    <div class="form-grid form-grid-3">
                        <div class="form-group"><label>Técnico SESMT</label>
                            <select name="colaborador_id" class="form-control">
                                <option value="">— Nenhum —</option>
                                ${usuarios.map(u => `<option value="${u.id}" ${item?.colaborador_id===u.id?'selected':''}>${u.nome}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group"><label>Nome (livre)</label>
                            <input type="text" name="colaborador_nome" class="form-control" value="${item?.colaborador_nome||''}" placeholder="Ex: EDMAR MOURA">
                        </div>
                        <div class="form-group"><label>Cargo</label>
                            <input type="text" name="cargo" class="form-control" value="${item?.cargo||''}" placeholder="Ex: Técnico de Segurança">
                        </div>
                    </div>
                </div>
                <div class="card" style="margin-bottom:14px">
                    <div class="card-title">Ação</div>
                    <div class="form-group"><label>Evento <span class="req">*</span></label>
                        <input type="text" name="evento" class="form-control" required value="${item?.evento||''}" placeholder="Ex: Paradão de Segurança — Base Barcarena">
                    </div>
                    <div class="form-grid form-grid-2">
                        <div class="form-group"><label>Pessoas Impactadas</label>
                            <input type="number" name="pessoas_impactadas" class="form-control" min="0" value="${item?.pessoas_impactadas??0}">
                        </div>
                    </div>
                    <div class="form-group"><label>Observações</label>
                        <textarea name="observacoes" class="form-control" rows="5" placeholder="Detalhes da ação realizada...">${item?.observacoes||''}</textarea>
                    </div>
                </div>
                <div style="display:flex;gap:10px">
                    <button type="submit" class="btn btn-primary">💾 Salvar</button>
                    <button type="button" class="btn btn-outline" id="btn-cancelar">Cancelar</button>
                </div>
            </form>
        </div>`;
        const voltar = () => renderAcoes(container, actions, navigate);
        container.querySelector('#btn-voltar').onclick   = voltar;
        container.querySelector('#btn-cancelar').onclick = voltar;
        container.querySelector('#form-acao').onsubmit = async e => {
            e.preventDefault();
            const d = formData(e.target);
            loading(true);
            try {
                if (id) { await api.acoes.atualizar(id, d); toast('Atualizada!'); }
                else    { await api.acoes.criar(d);          toast('Registrada!'); }
                voltar();
            } catch(err) { toast(err.message, 'error'); } finally { loading(false); }
        };
    } catch(e) { loading(false); toast(e.message, 'error'); }
}

function today()  { return new Date().toISOString().substring(0, 10); }
function truncar(str, max) {
    if (!str) return '—';
    const l = str.split('\n')[0];
    return l.length <= max ? l : l.substring(0, max) + '…';
}
