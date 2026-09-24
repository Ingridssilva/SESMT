import { api } from '../js/api.js';
import { toast, loading, fmt } from '../js/ui.js';

export async function renderIndicadores(container, actions, navigate) {
    actions.innerHTML = '';
    loading(true);
    try {
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth() + 1;

        const [registros, autoCalc] = await Promise.all([
            fetch('/api/indicadores/').then(r=>r.json()).catch(()=>[]),
            fetch(`/api/indicadores/auto?ano=${anoAtual}&mes=${mesAtual}`).then(r=>r.json()).catch(()=>({})),
        ]);

        const lista  = registros.data || registros || [];
        const auto   = autoCalc.data || autoCalc || {};
        const meses  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                        'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

        // Montar dados para o gráfico dos últimos 12 meses
        const dadosGrafico = Array.from({length:12}, (_,i) => {
            const m = ((mesAtual - 1 - i + 12) % 12) + 1;
            const a = mesAtual - i <= 0 ? anoAtual - 1 : anoAtual;
            const reg = lista.find(r => r.mes === m && r.ano === a);
            return { mes: m, ano: a, label: meses[m-1].substring(0,3) + '/' + String(a).slice(2), ndgs: reg?.ndgs_geral || reg?.ndgs || reg?.valor || 0 };
        }).reverse();

        container.innerHTML = `
        <!-- Cálculo automático -->
        <div class="card" style="margin-bottom:16px;border-left:4px solid var(--laranja)">
            <div class="card-title">⚡ NDGS Calculado Automaticamente — ${meses[mesAtual-1]} ${anoAtual}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
                <div style="text-align:center;padding:16px;background:var(--cinza1);border-radius:8px">
                    <div style="font-size:10px;color:var(--cinza3);text-transform:uppercase;font-weight:700;margin-bottom:6px">Inspeções</div>
                    <div style="font-size:28px;font-weight:900;color:var(--laranja)">${auto.n_inspecoes ?? 0}</div>
                </div>
                <div style="text-align:center;padding:16px;background:var(--cinza1);border-radius:8px">
                    <div style="font-size:10px;color:var(--cinza3);text-transform:uppercase;font-weight:700;margin-bottom:6px">NCs Abertas</div>
                    <div style="font-size:28px;font-weight:900;color:var(--vermelho)">${auto.n_ncs ?? 0}</div>
                </div>
                <div style="text-align:center;padding:16px;background:var(--cinza1);border-radius:8px">
                    <div style="font-size:10px;color:var(--cinza3);text-transform:uppercase;font-weight:700;margin-bottom:6px">Checklists</div>
                    <div style="font-size:28px;font-weight:900;color:var(--azul2)">${auto.n_checklists ?? 0}</div>
                </div>
                <div style="text-align:center;padding:20px;background:var(--preto);border-radius:8px">
                    <div style="font-size:10px;color:rgba(255,255,255,.5);text-transform:uppercase;font-weight:700;margin-bottom:6px">NDGS Estimado</div>
                    <div style="font-size:42px;font-weight:900;color:var(--laranja);line-height:1">
                        ${auto.ndgs_calculado ?? '—'}
                    </div>
                </div>
            </div>
            <button class="btn btn-primary" id="btn-usar-auto">
                ✅ Usar este cálculo para salvar o indicador do mês
            </button>
        </div>

        <!-- Gráfico -->
        ${lista.length > 0 ? `
        <div class="card" style="margin-bottom:16px">
            <div class="card-title">📈 Evolução NDGS — 12 meses</div>
            <div style="position:relative;height:200px">
                <canvas id="chart-ndgs"></canvas>
            </div>
        </div>` : ''}

        <!-- Formulário manual -->
        <div class="card" style="margin-bottom:16px">
            <div class="card-title">➕ Registrar Indicadores Manualmente</div>
            <form id="form-ndgs">
                <div class="form-grid form-grid-3" style="margin-bottom:12px">
                    <div class="form-group">
                        <label>Mês <span class="req">*</span></label>
                        <select name="mes" class="form-control" required>
                            ${meses.map((m,i) => `<option value="${i+1}" ${i+1===mesAtual?'selected':''}>${m}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Ano <span class="req">*</span></label>
                        <input type="number" name="ano" class="form-control" value="${anoAtual}" min="2020" max="2030" required>
                    </div>
                    <div class="form-group">
                        <label>NDGS Geral <span class="req">*</span></label>
                        <input type="number" name="ndgs_geral" class="form-control" step="0.1" min="0" max="100"
                               placeholder="0 a 100" id="inp-ndgs" required>
                    </div>
                </div>
                <div class="form-grid form-grid-3" style="margin-bottom:16px">
                    <div class="form-group">
                        <label>Inspeções Realizadas</label>
                        <input type="number" name="inspecoes_realizadas" class="form-control" min="0"
                               value="${auto.n_inspecoes ?? ''}">
                    </div>
                    <div class="form-group">
                        <label>NCs Abertas</label>
                        <input type="number" name="ncs_abertas" class="form-control" min="0"
                               value="${auto.n_ncs ?? ''}">
                    </div>
                    <div class="form-group">
                        <label>NCs Encerradas</label>
                        <input type="number" name="ncs_encerradas" class="form-control" min="0">
                    </div>
                    <div class="form-group">
                        <label>Treinamentos</label>
                        <input type="number" name="treinamentos" class="form-control" min="0">
                    </div>
                    <div class="form-group">
                        <label>Pessoas Treinadas</label>
                        <input type="number" name="pessoas_treinadas" class="form-control" min="0">
                    </div>
                    <div class="form-group">
                        <label>Observações</label>
                        <input type="text" name="observacoes" class="form-control" placeholder="Observações...">
                    </div>
                </div>
                <button type="submit" class="btn btn-primary">💾 Salvar Indicadores</button>
            </form>
        </div>

        <!-- Histórico -->
        <div class="card">
            <div class="card-title">📊 Histórico de Indicadores</div>
            <div class="table-wrap">
                <table>
                    <thead><tr>
                        <th>Mês/Ano</th><th>NDGS</th><th>Inspeções</th><th>NCs Abertas</th>
                        <th>NCs Enc.</th><th>Treinamentos</th><th>Observações</th>
                    </tr></thead>
                    <tbody>
                    ${lista.length === 0
                        ? `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--cinza3)">Nenhum indicador registrado</td></tr>`
                        : lista.map(r => `
                        <tr>
                            <td style="font-weight:700">${meses[(r.mes||1)-1]} ${r.ano}</td>
                            <td>
                                <span style="font-size:18px;font-weight:900;
                                    color:${(r.ndgs_geral||r.ndgs||0)>=70?'var(--verde)':(r.ndgs_geral||r.ndgs||0)>=50?'var(--amarelo)':'var(--vermelho)'}">
                                    ${r.ndgs_geral ?? r.ndgs ?? '—'}
                                </span>
                            </td>
                            <td>${r.inspecoes_realizadas ?? '—'}</td>
                            <td>${r.ncs_abertas ?? '—'}</td>
                            <td>${r.ncs_encerradas ?? '—'}</td>
                            <td>${r.treinamentos ?? '—'}</td>
                            <td style="font-size:12px;color:var(--cinza4)">${r.observacoes || '—'}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;

        // Usar cálculo automático
        container.querySelector('#btn-usar-auto').onclick = () => {
            container.querySelector('[name="ndgs_geral"]').value = auto.ndgs_calculado ?? '';
        };

        // Gráfico
        if (lista.length > 0 && document.getElementById('chart-ndgs')) {
            new Chart(document.getElementById('chart-ndgs'), {
                type: 'bar',
                data: {
                    labels: dadosGrafico.map(d => d.label),
                    datasets: [{
                        label: 'NDGS',
                        data: dadosGrafico.map(d => d.ndgs),
                        backgroundColor: dadosGrafico.map(d =>
                            d.ndgs >= 70 ? 'rgba(26,124,79,.8)' :
                            d.ndgs >= 50 ? 'rgba(196,154,0,.8)' :
                            d.ndgs > 0   ? 'rgba(192,57,43,.8)' : 'rgba(176,176,176,.2)'
                        ),
                        borderRadius: 4,
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { size: 11 } } },
                        x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // Submit
        container.querySelector('#form-ndgs').onsubmit = async e => {
            e.preventDefault();
            const d = Object.fromEntries(new FormData(e.target));
            // converter para números
            ['mes','ano','ndgs_geral','inspecoes_realizadas','ncs_abertas','ncs_encerradas','treinamentos','pessoas_treinadas'].forEach(k => {
                if (d[k]) d[k] = parseFloat(d[k]);
            });
            loading(true);
            try {
                const r = await fetch('/api/indicadores/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(d)
                }).then(r => r.json());
                if (r.erro) throw new Error(r.erro);
                toast('Indicadores salvos!');
                renderIndicadores(container, actions, navigate);
            } catch(err) { toast(err.message, 'error'); }
            finally { loading(false); }
        };

    } catch(e) { toast(e.message || 'Erro ao carregar indicadores', 'error'); }
    finally { loading(false); }
}
