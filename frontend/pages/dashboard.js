import { api } from '../js/api.js';
import { fmt, loading, toast } from '../js/ui.js';
import { estaOnline } from '../js/offline.js';

export async function renderDashboard(container, actions, navigate) {
    actions.innerHTML = '';
    loading(true);

    if (!estaOnline()) {
        loading(false);
        container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                    padding:60px 20px;text-align:center;color:#888">
            <div style="font-size:52px;margin-bottom:16px">📵</div>
            <h3 style="color:#333;margin-bottom:8px">Você está offline</h3>
            <p style="margin-bottom:24px;max-width:360px;font-size:14px">
                O Dashboard não está disponível sem conexão.<br>
                Use <strong>Inspeções</strong> ou <strong>Liderança</strong> para registrar dados offline.
            </p>
            <button onclick="window.location.reload()"
                style="padding:10px 24px;background:var(--laranja);color:#fff;border:none;
                       border-radius:6px;cursor:pointer;font-size:14px;font-weight:600">
                Tentar novamente
            </button>
        </div>`;
        return;
    }

    try {
        const [kpis, tendencia, ncs, inspecoes, ckAnalytics, ckHistorico] = await Promise.all([
            fetch('/api/dashboard/kpis').then(r=>r.json()).catch(()=>({data:{}})),
            fetch('/api/dashboard/tendencia').then(r=>r.json()).catch(()=>({data:[]})),
            fetch('/api/ncs/?limit=5').then(r=>r.json()).catch(()=>({data:[]})),
            fetch('/api/inspecoes/?limit=5').then(r=>r.json()).catch(()=>({data:[]})),
            fetch('/api/dashboard/checklists-analytics').then(r=>r.json()).catch(()=>({data:{}})),
            fetch('/api/checklists/preenchimentos?limit=5').then(r=>r.json()).catch(()=>({data:[]})),
        ]);

        const ck  = ckAnalytics.data || ckAnalytics || {};
        const ckH = Array.isArray(ckHistorico.data) ? ckHistorico.data : [];

        const k   = kpis.data || kpis || {};
        const ten = (tendencia.data || tendencia || []);
        const ncsLista  = Array.isArray(ncs.data)  ? ncs.data  : Array.isArray(ncs)  ? ncs  : [];
        const inspLista = Array.isArray(inspecoes.data) ? inspecoes.data : Array.isArray(inspecoes) ? inspecoes : [];

        const MES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        const mesAtual = new Date().toLocaleString('pt-BR',{month:'long',year:'numeric'});
        const anoAtual = new Date().getFullYear();

        container.innerHTML = `
        <!-- KPI Grid -->
        <div class="kpi-grid" style="margin-bottom:20px">
            <div class="kpi kpi-laranja">
                <div class="kpi-label">NDGS do Mês</div>
                <div class="kpi-value laranja">${k.ndgs_mes != null ? k.ndgs_mes : '—'}</div>
                <div class="kpi-sub">${mesAtual}</div>
            </div>
            <div class="kpi kpi-laranja">
                <div class="kpi-label">Inspeções (ano)</div>
                <div class="kpi-value laranja">${k.inspecoes_ano ?? k.inspecoes_mes ?? 0}</div>
                <div class="kpi-sub">${k.inspecoes_campo ?? 0} campo · ${k.inspecoes_lid ?? 0} liderança</div>
            </div>
            <div class="kpi ${(k.ncs_abertas??0)>0?'kpi-vermelho':'kpi-verde'}">
                <div class="kpi-label">NCs Abertas</div>
                <div class="kpi-value ${(k.ncs_abertas??0)>0?'danger':'success'}">${k.ncs_abertas ?? 0}</div>
                <div class="kpi-sub">${k.ncs_vencidas??0} vencidas</div>
            </div>
            <div class="kpi ${(k.ncs_criticas??0)>0?'kpi-vermelho':''}">
                <div class="kpi-label">NCs Críticas</div>
                <div class="kpi-value ${(k.ncs_criticas??0)>0?'danger':''}">${k.ncs_criticas ?? 0}</div>
                <div class="kpi-sub">gravidade crítica</div>
            </div>
            <div class="kpi kpi-azul">
                <div class="kpi-label">Checklists (ano)</div>
                <div class="kpi-value" style="color:var(--azul2)">${k.checklists_ano ?? k.checklists_mes ?? 0}</div>
                <div class="kpi-sub">preenchidos em ${anoAtual}</div>
            </div>
            <div class="kpi">
                <div class="kpi-label">Colaboradores</div>
                <div class="kpi-value">${k.colaboradores ?? 0}</div>
                <div class="kpi-sub">na base</div>
            </div>
        </div>

        <!-- Gráficos -->
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px">
            <div class="card" style="margin:0">
                <div class="card-title">📈 Evolução — Inspeções e NCs (12 meses)</div>
                <div style="position:relative;height:220px">
                    <canvas id="chart-tendencia"></canvas>
                </div>
            </div>
            <div class="card" style="margin:0">
                <div class="card-title">🗺️ Por Município (${anoAtual})</div>
                <div id="municipios-lista" style="display:flex;flex-direction:column;gap:8px;max-height:220px;overflow-y:auto">
                    ${(k.por_municipio||[]).length === 0
                        ? '<div style="color:var(--cinza3);font-size:13px;text-align:center;padding:30px">Sem dados no período</div>'
                        : (k.por_municipio||[]).map(m => `
                        <div style="display:flex;align-items:center;gap:8px">
                            <div style="font-size:12px;font-weight:600;min-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.municipio}</div>
                            <div style="flex:1;background:var(--cinza2);border-radius:4px;height:8px;overflow:hidden">
                                <div style="height:100%;background:var(--laranja);border-radius:4px;
                                            width:${Math.min(100, Math.round((m.total / Math.max(...(k.por_municipio||[]).map(x=>x.total),1))*100))}%"></div>
                            </div>
                            <div style="font-size:11px;color:var(--cinza4);font-weight:700;min-width:20px;text-align:right">${m.total}</div>
                        </div>`).join('')}
                </div>
            </div>
        </div>

        <!-- Tabelas -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="card" style="margin:0">
                <div class="card-title" style="justify-content:space-between">
                    <span>📋 Últimas Inspeções</span>
                    <a href="#inspecoes" style="font-size:11px;color:var(--laranja);text-decoration:none;font-weight:600">Ver todas →</a>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead><tr>
                            <th>Código</th><th>Data</th><th>Tipo</th><th>Local</th><th>NCs</th>
                        </tr></thead>
                        <tbody>
                        ${inspLista.length === 0
                            ? `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--cinza3)">Nenhuma inspeção</td></tr>`
                            : inspLista.slice(0,5).map(i => `
                            <tr style="cursor:pointer" onclick="location.hash='#inspecoes'">
                                <td style="font-weight:700;color:var(--azul2);font-size:12px">${i.codigo||'—'}</td>
                                <td style="color:var(--cinza4);font-size:12px;white-space:nowrap">${fmt.data(i.data_inspecao)}</td>
                                <td style="font-size:12px">${i.tipo_inspecao||'—'}</td>
                                <td style="font-size:12px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.municipio_nome||i.local_descricao||'—'}</td>
                                <td>${(i.qty_ncs||0)>0
                                    ? `<span style="background:rgba(192,57,43,.15);color:var(--vermelho);border-radius:4px;padding:2px 6px;font-size:11px;font-weight:700">${i.qty_ncs}</span>`
                                    : '<span style="color:var(--cinza3)">0</span>'}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card" style="margin:0">
                <div class="card-title" style="justify-content:space-between">
                    <span>⚠️ NCs Recentes</span>
                    <a href="#ncs" style="font-size:11px;color:var(--laranja);text-decoration:none;font-weight:600">Ver todas →</a>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px">
                ${ncsLista.length === 0
                    ? `<div style="text-align:center;padding:20px;color:var(--cinza3);font-size:13px">Nenhuma NC aberta</div>`
                    : ncsLista.slice(0,5).map(n => {
                        const corGrav = {'CRÍTICA':'var(--vermelho)','ALTA':'var(--laranja)','MÉDIA':'var(--amarelo)','BAIXA':'var(--verde)'}[n.gravidade]||'var(--cinza3)';
                        return `
                        <div style="display:flex;gap:10px;padding:10px;background:var(--cinza1);border-radius:8px;
                                    border-left:3px solid ${corGrav};cursor:pointer" onclick="location.hash='#ncs'">
                            <div style="flex:1;min-width:0">
                                <div style="font-size:11px;font-weight:700;color:var(--azul2)">${n.codigo}</div>
                                <div style="font-size:12px;color:var(--texto);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n.descricao||''}</div>
                            </div>
                            <div style="text-align:right;flex-shrink:0">
                                <div style="font-size:10px;font-weight:700;color:${corGrav}">${n.gravidade}</div>
                                <div style="font-size:10px;color:var(--cinza3)">${fmt.data(n.created_at)}</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>

        <!-- Analytics de Checklists -->
        <div id="ck-analytics-section" style="margin-top:20px"></div>`;

        // ── Seção analytics de checklists ─────────────────────────────────
        const ckSection = document.getElementById('ck-analytics-section');
        if (ckSection && ck.top_ncs) {
            const topNCs    = ck.top_ncs    || [];
            const porModelo = ck.por_modelo || [];
            const taxa      = ck.taxa       || [];

            ckSection.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
              <!-- Top NCs -->
              <div style="background:#fff;border-radius:10px;padding:18px;box-shadow:0 1px 6px rgba(0,0,0,.08)">
                <div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">
                  ⚠️ Itens Mais Não Conformes (${ck.ano})
                </div>
                ${topNCs.length === 0
                  ? '<div style="color:#999;font-size:13px;text-align:center;padding:20px">Nenhum registro</div>'
                  : topNCs.slice(0,6).map((nc,i) => `
                    <div style="display:flex;align-items:center;gap:10px;padding:7px 0;
                         border-bottom:1px solid #f5f5f5">
                      <div style="width:22px;height:22px;background:#FFF0E8;border-radius:50%;
                           display:flex;align-items:center;justify-content:center;
                           font-size:11px;font-weight:800;color:#E8500A;flex-shrink:0">${i+1}</div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:12px;font-weight:600;white-space:nowrap;
                             overflow:hidden;text-overflow:ellipsis">${nc.item}</div>
                        <div style="font-size:10px;color:#999">${nc.modelo}</div>
                      </div>
                      <div style="font-size:13px;font-weight:800;color:#C0392B;flex-shrink:0">${nc.total_nc}x</div>
                    </div>`).join('')}
              </div>

              <!-- Taxa de conformidade por modelo -->
              <div style="background:#fff;border-radius:10px;padding:18px;box-shadow:0 1px 6px rgba(0,0,0,.08)">
                <div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">
                  📊 Taxa de Conformidade (${ck.ano})
                </div>
                ${taxa.length === 0
                  ? '<div style="color:#999;font-size:13px;text-align:center;padding:20px">Nenhum registro</div>'
                  : taxa.map(t => {
                      const pct = t.taxa_conformidade ?? 0;
                      const cor = pct >= 90 ? '#1A7A3C' : pct >= 70 ? '#E8500A' : '#C0392B';
                      return `
                        <div style="margin-bottom:10px">
                          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                            <div style="font-size:12px;font-weight:600;color:#333">${t.modelo}</div>
                            <div style="font-size:12px;font-weight:800;color:${cor}">${pct}%</div>
                          </div>
                          <div style="background:#f0f0f0;border-radius:4px;height:6px">
                            <div style="background:${cor};width:${Math.min(pct,100)}%;height:6px;border-radius:4px;transition:width .5s"></div>
                          </div>
                        </div>`}).join('')}
              </div>
            </div>

            <!-- Últimos checklists lançados -->
            <div style="background:#fff;border-radius:10px;padding:18px;box-shadow:0 1px 6px rgba(0,0,0,.08);margin-bottom:16px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                <div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.05em">
                  ✅ Últimos Checklists Lançados
                </div>
                <a href="#checklists" onclick="navigate('checklists');return false"
                   style="font-size:12px;color:#E8500A;font-weight:600;text-decoration:none">
                  VER TODOS →
                </a>
              </div>
              ${ckH.length === 0
                ? '<div style="color:#999;font-size:13px;text-align:center;padding:16px">Nenhum checklist lançado</div>'
                : `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
                    <thead>
                      <tr style="border-bottom:2px solid #f0f0f0">
                        <th style="padding:6px 8px;text-align:left;color:#888;font-weight:600">Modelo</th>
                        <th style="padding:6px 8px;text-align:left;color:#888;font-weight:600">Colaborador</th>
                        <th style="padding:6px 8px;text-align:left;color:#888;font-weight:600">Data</th>
                        <th style="padding:6px 8px;text-align:center;color:#888;font-weight:600">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${ckH.map(c => {
                        const cor = c.resultado_geral === 'CONFORME' ? '#1A7A3C' : '#C0392B';
                        const cab = typeof c.cabecalho === 'string' ? JSON.parse(c.cabecalho||'{}') : (c.cabecalho||{});
                        const nomeColab = c.nome_avaliado || cab.colaborador_nome || cab.responsavel_maquina || '—';
                        return `<tr style="border-bottom:1px solid #f8f8f8">
                          <td style="padding:7px 8px;font-weight:600">${c.modelo_titulo||c.modelo_codigo||'—'}</td>
                          <td style="padding:7px 8px;color:#555">${nomeColab}</td>
                          <td style="padding:7px 8px;color:#888">${fmt.data(c.created_at)}</td>
                          <td style="padding:7px 8px;text-align:center">
                            <span style="background:${cor}22;color:${cor};font-size:10px;font-weight:700;
                                  padding:3px 8px;border-radius:20px">${c.resultado_geral||'—'}</span>
                          </td>
                        </tr>`;
                      }).join('')}
                    </tbody>
                  </table></div>`}
            </div>`;
        }

        // Gráfico tendência
        if (ten.length > 0) {
            const labels  = ten.map(t => MES[(t.mes||1)-1] + '/' + String(t.ano||2026).slice(2));
            const insps   = ten.map(t => parseInt(t.inspecoes)||0);
            const ncsData = ten.map(t => parseInt(t.ncs)||0);

            new Chart(document.getElementById('chart-tendencia'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Inspeções',
                            data: insps,
                            borderColor: '#F7931E',
                            backgroundColor: 'rgba(247,147,30,.12)',
                            borderWidth: 2.5,
                            pointRadius: 4,
                            pointBackgroundColor: '#F7931E',
                            tension: 0.3,
                            fill: true,
                            yAxisID: 'y',
                        },
                        {
                            label: 'NCs Abertas',
                            data: ncsData,
                            borderColor: '#C0392B',
                            backgroundColor: 'rgba(192,57,43,.08)',
                            borderWidth: 2,
                            pointRadius: 4,
                            pointBackgroundColor: '#C0392B',
                            tension: 0.3,
                            fill: true,
                            yAxisID: 'y',
                        },
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y:  { beginAtZero: true, grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { size: 11 }, stepSize: 1 } },
                        x:  { grid: { display: false }, ticks: { font: { size: 10 } } },
                    },
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 12 } }
                    }
                }
            });
        }

    } catch(e) {
        console.error('Dashboard error:', e);
        toast('Erro ao carregar dashboard', 'error');
    } finally {
        loading(false);
    }
}
