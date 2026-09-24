import { toast, loading, confirm, fmt } from '../js/ui.js';

export async function renderColaboradores(container, actions, navigate) {
    actions.innerHTML = `<button class="btn btn-primary" id="btn-novo-colab">+ Novo Colaborador</button>`;
    document.getElementById('btn-novo-colab').onclick = () => abrirForm(container, null, navigate);
    await carregarLista(container, navigate);
}

async function carregarLista(container, navigate, q = '') {
    loading(true);
    try {
        const url = '/api/colaboradores' + (q ? '?q=' + encodeURIComponent(q) : '');
        const resp = await fetch(url).then(r => r.json());
        const lista = resp.data || resp || [];

        container.innerHTML = `
        <div class="filtros" style="margin-bottom:16px">
            <div class="form-group" style="flex:1">
                <input type="text" id="busca-colab" class="form-control"
                    placeholder="🔍 Buscar por nome, CPF ou cargo..."
                    value="${q}" style="min-width:280px">
            </div>
            <div class="form-group" style="align-self:flex-end">
                <button class="btn btn-dark" id="btn-buscar">Buscar</button>
            </div>
            <div class="form-group" style="align-self:flex-end">
                <a href="/api/exportar/checklists" class="btn btn-outline" download>
                    📥 Exportar CSV
                </a>
            </div>
        </div>

        <div class="card">
            <div class="card-title" style="justify-content:space-between">
                <span>👥 Colaboradores</span>
                <span style="font-size:12px;color:var(--cinza3)">${lista.length} registro(s)</span>
            </div>
            <div class="table-wrap">
                <table>
                    <thead><tr>
                        <th>Nome</th><th>CPF</th><th>Cargo</th><th>Telefone</th><th>Contrato</th><th>Status</th><th></th>
                    </tr></thead>
                    <tbody>
                    ${lista.length === 0
                        ? `<tr><td colspan="7" style="text-align:center;padding:36px;color:var(--cinza3)">Nenhum colaborador encontrado</td></tr>`
                        : lista.map(c => `
                        <tr style="${!c.ativo ? 'opacity:.5' : ''}">
                            <td style="font-weight:600">${c.nome}</td>
                            <td style="font-size:12px;color:var(--cinza4)">${c.cpf || '—'}</td>
                            <td style="font-size:12px">${c.cargo || '—'}</td>
                            <td style="font-size:12px;color:var(--cinza4)">${c.telefone || '—'}</td>
                            <td style="font-size:12px;color:var(--cinza4)">${c.contrato || '—'}</td>
                            <td>
                                <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;
                                    background:${c.ativo ? 'rgba(26,124,79,.12)' : 'rgba(176,176,176,.15)'};
                                    color:${c.ativo ? 'var(--verde)' : 'var(--cinza3)'}">
                                    ${c.ativo ? 'Ativo' : 'Inativo'}
                                </span>
                            </td>
                            <td style="white-space:nowrap">
                                <button class="btn btn-outline btn-sm" data-edit="${c.id}">✏️</button>
                                <button class="btn btn-outline btn-sm" data-toggle="${c.id}" data-ativo="${c.ativo}">
                                    ${c.ativo ? '🚫' : '✅'}
                                </button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;

        container.querySelector('#busca-colab').onkeydown = e => {
            if (e.key === 'Enter') carregarLista(container, navigate, e.target.value);
        };
        container.querySelector('#btn-buscar').onclick = () =>
            carregarLista(container, navigate, container.querySelector('#busca-colab').value);

        container.querySelectorAll('[data-edit]').forEach(b =>
            b.onclick = () => abrirForm(container, parseInt(b.dataset.edit), navigate));

        container.querySelectorAll('[data-toggle]').forEach(b =>
            b.onclick = async () => {
                const ativo = b.dataset.ativo === 'true';
                if (!await confirm(ativo ? 'Desativar este colaborador?' : 'Reativar este colaborador?')) return;
                loading(true);
                try {
                    await fetch(`/api/colaboradores/${b.dataset.toggle}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ativo: !ativo })
                    });
                    toast(ativo ? 'Colaborador desativado' : 'Colaborador reativado');
                    carregarLista(container, navigate, q);
                } catch(e) { toast(e.message, 'error'); }
                finally { loading(false); }
            });

    } catch(e) { toast(e.message, 'error'); }
    finally { loading(false); }
}

async function abrirForm(container, id, navigate) {
    loading(true);
    let item = null;
    try {
        if (id) {
            const r = await fetch(`/api/colaboradores/${id}`).then(r => r.json());
            item = r.data || r;
        }
        loading(false);

        container.innerHTML = `
        <div style="max-width:720px">
            <button class="btn btn-outline" id="btn-voltar">← Voltar</button>
            <h2 style="font-size:16px;font-weight:700;margin:16px 0">
                ${id ? 'Editar Colaborador' : 'Novo Colaborador'}
            </h2>
            <form id="form-colab">
                <div class="card" style="margin-bottom:14px">
                    <div class="card-title">Dados Pessoais</div>
                    <div class="form-grid form-grid-2">
                        <div class="form-group" style="grid-column:span 2">
                            <label>Nome Completo <span class="req">*</span></label>
                            <input type="text" name="nome" class="form-control" required
                                   value="${item?.nome || ''}" placeholder="Nome completo">
                        </div>
                        <div class="form-group">
                            <label>CPF <span class="req">*</span></label>
                            <input type="text" name="cpf" class="form-control" required
                                   value="${item?.cpf || ''}" placeholder="000.000.000-00" maxlength="14"
                                   id="inp-cpf-colab">
                        </div>
                        <div class="form-group">
                            <label>WhatsApp</label>
                            <input type="text" name="telefone" class="form-control"
                                   value="${item?.telefone || ''}" placeholder="91999999999" maxlength="11">
                        </div>
                        <div class="form-group">
                            <label>Cargo / Função</label>
                            <input type="text" name="cargo" class="form-control"
                                   value="${item?.cargo || ''}" placeholder="Ex: Eletricista">
                        </div>
                        <div class="form-group">
                            <label>Contrato / Unidade</label>
                            <input type="text" name="contrato" class="form-control"
                                   value="${item?.contrato || ''}" placeholder="Ex: Centro e Oeste">
                        </div>
                    </div>
                </div>
                <div style="display:flex;gap:10px">
                    <button type="submit" class="btn btn-primary">💾 Salvar</button>
                    <button type="button" class="btn btn-outline" id="btn-cancelar">Cancelar</button>
                </div>
            </form>
        </div>`;

        // Máscara CPF
        const cpfInp = container.querySelector('#inp-cpf-colab');
        cpfInp.addEventListener('input', function() {
            let v = this.value.replace(/\D/g, '').substring(0, 11);
            v = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            this.value = v;
        });

        const voltar = () => renderColaboradores(container, document.getElementById('topbar-actions'), navigate);
        container.querySelector('#btn-voltar').onclick = voltar;
        container.querySelector('#btn-cancelar').onclick = voltar;

        container.querySelector('#form-colab').onsubmit = async e => {
            e.preventDefault();
            const d = Object.fromEntries(new FormData(e.target));
            loading(true);
            try {
                const url    = id ? `/api/colaboradores/${id}` : '/api/colaboradores';
                const method = id ? 'PUT' : 'POST';
                const r = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(d)
                }).then(r => r.json());
                if (r.erro) throw new Error(r.erro);
                toast(id ? 'Colaborador atualizado!' : 'Colaborador criado!');
                voltar();
            } catch(err) { toast(err.message, 'error'); }
            finally { loading(false); }
        };
    } catch(e) { loading(false); toast(e.message, 'error'); }
}
