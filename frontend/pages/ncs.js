import { api }                              from '../js/api.js';
import { toast, loading, confirm, fmt,
         badgeGrav, badgeSt, fillSelect,
         formData, diasPrazo }              from '../js/ui.js';
import { estaOnline }                       from '../js/offline.js';

const GRAVIDADES = ['BAIXA','MÉDIA','ALTA','CRÍTICA'];
const STATUS_NC  = ['ABERTA','EM TRATATIVA','AGUARDANDO EVIDÊNCIA','ENCERRADA'];

export async function renderNcs(container, actions, navigate) {
    actions.innerHTML = `
        <a href="/api/exportar/ncs" class="btn btn-outline btn-sm" download title="Exportar CSV">📥 CSV</a>
        <button class="btn btn-danger" id="btn-nova">+ Abrir NC</button>
    `;
    document.getElementById('btn-nova').onclick = () => {
        if (!estaOnline()) { toast('📵 Criação de NCs indisponível offline', 'warning'); return; }
        abrirForm(container, navigate);
    };
    await carregarLista(container, navigate);
}

async function carregarLista(container, navigate, filtros = {}) {
    loading(true);

    if (!estaOnline()) {
        loading(false);
        container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                    padding:60px 20px;text-align:center;color:#888">
            <div style="font-size:48px;margin-bottom:16px">📵</div>
            <h3 style="color:#333;margin-bottom:8px">Você está offline</h3>
            <p style="font-size:14px;max-width:360px">
                Não Conformidades não estão disponíveis offline.<br>
                Os dados serão exibidos quando a conexão for restabelecida.
            </p>
        </div>`;
        return;
    }

    try {
        const itens = await api.ncs.listar(filtros);
        container.innerHTML = `
        <div class="filtros">
          <div class="form-group"><label>Gravidade</label>
            <select class="form-control" id="f-grav">
              <option value="">Todas</option>
              ${GRAVIDADES.map(g=>`<option ${filtros.gravidade===g?'selected':''}>${g}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Status</label>
            <select class="form-control" id="f-status">
              <option value="">Todos</option>
              ${STATUS_NC.map(s=>`<option ${filtros.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="align-self:flex-end">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;text-transform:none;font-size:13px">
              <input type="checkbox" id="f-venc" ${filtros.vencidas?'checked':''}> Só vencidas
            </label>
          </div>
          <button class="btn btn-dark" id="btn-filtrar">Filtrar</button>
        </div>

        <div class="card">
          <div class="card-title" style="justify-content:space-between">
            <span>⚠️ Não Conformidades</span>
            <span style="font-size:12px;color:var(--cinza3)">${itens.length} registro(s)</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Código</th><th>Abertura</th><th>Gravidade</th>
                <th>Descrição</th><th>Responsável</th><th>Prazo</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                ${itens.length===0
                  ? `<tr><td colspan="8" style="text-align:center;padding:36px;color:var(--cinza3)">Nenhuma NC registrada</td></tr>`
                  : itens.map(n=>`<tr>
                      <td style="font-weight:700;color:var(--azul2)">${n.codigo}</td>
                      <td style="white-space:nowrap;color:var(--cinza4)">${fmt.data(n.created_at)}</td>
                      <td>${badgeGrav(n.gravidade)}</td>
                      <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                          title="${n.descricao}">${n.descricao}</td>
                      <td>${n.responsavel_nome||'—'}</td>
                      <td>${diasPrazo(n.dias_prazo)}</td>
                      <td>${badgeSt(n.status)}</td>
                      <td style="white-space:nowrap">
                        <button class="btn btn-outline btn-sm" data-ver="${n.id}">Ver</button>
                        <button class="btn btn-outline btn-sm" data-del="${n.id}">🗑</button>
                      </td>
                    </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`;

        container.querySelector('#btn-filtrar').onclick = () => carregarLista(container, navigate, {
            gravidade: container.querySelector('#f-grav').value||undefined,
            status:    container.querySelector('#f-status').value||undefined,
            vencidas:  container.querySelector('#f-venc').checked?'1':undefined,
        });

        container.querySelectorAll('[data-ver]').forEach(b=>
            b.onclick=()=>abrirDetalhe(container,parseInt(b.dataset.ver),navigate));
        container.querySelectorAll('[data-del]').forEach(b=>
            b.onclick=async()=>{
                if(!await confirm('Excluir esta NC e seu histórico?'))return;
                loading(true);
                try{await api.ncs.deletar(parseInt(b.dataset.del));toast('NC excluída');carregarLista(container,navigate,filtros);}
                catch(e){toast(e.message,'error');}finally{loading(false);}
            });
    } catch(e){toast(e.message,'error');}finally{loading(false);}
}

async function abrirDetalhe(container, id, navigate) {
    loading(true);
    try {
        const nc = await api.ncs.obter(id);
        loading(false);
        const corGrav = {'CRÍTICA':'var(--vermelho)','ALTA':'var(--laranja)','MÉDIA':'var(--amarelo)','BAIXA':'var(--verde)'}[nc.gravidade]||'var(--cinza3)';

        container.innerHTML = `
        <div style="max-width:900px">
          <div style="display:flex;gap:10px;margin-bottom:16px">
            <button class="btn btn-outline" id="btn-voltar">← Voltar</button>
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
            <div>
              <div class="card" style="border-left:4px solid ${corGrav}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
                  <div>
                    <div style="font-size:22px;font-weight:800;color:var(--texto)">${nc.codigo}</div>
                    <div style="font-size:12px;color:var(--cinza3);margin-top:2px">Aberta em ${fmt.data(nc.created_at)}</div>
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">${badgeGrav(nc.gravidade)} ${badgeSt(nc.status)}</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
                  <div><span style="color:var(--cinza3)">Contrato:</span> ${nc.contrato_cod||'—'}</div>
                  <div><span style="color:var(--cinza3)">Responsável:</span> <strong>${nc.responsavel_nome||'—'}</strong></div>
                  <div><span style="color:var(--cinza3)">Prazo:</span> ${nc.prazo?fmt.data(nc.prazo):'—'}</div>
                  <div><span style="color:var(--cinza3)">Inspeção:</span> ${nc.inspecao_cod||'—'}</div>
                </div>
              </div>
              <div class="card">
                <div class="card-title">Descrição</div>
                <p style="line-height:1.7;font-size:14px">${nc.descricao}</p>
              </div>
              ${nc.causa_raiz||nc.acao_corretiva?`
              <div class="card">
                <div class="card-title">Plano de Ação</div>
                ${nc.causa_raiz?`<div style="margin-bottom:10px"><div style="font-size:11px;color:var(--cinza3);text-transform:uppercase;font-weight:700;margin-bottom:4px">Causa Raiz</div><p style="font-size:13px;line-height:1.6">${nc.causa_raiz}</p></div>`:''}
                ${nc.acao_corretiva?`<div><div style="font-size:11px;color:var(--cinza3);text-transform:uppercase;font-weight:700;margin-bottom:4px">Ação Corretiva</div><p style="font-size:13px;line-height:1.6">${nc.acao_corretiva}</p></div>`:''}
              </div>`:''}
            </div>
            <div>
              <div class="card">
                <div class="card-title">Histórico</div>
                ${nc.historico&&nc.historico.length>0
                  ? `<ul class="timeline">${nc.historico.map(h=>`
                      <li>
                        <div class="tl-dot" style="background:${h.status_novo==='ENCERRADA'?'var(--verde)':'var(--laranja)'}">
                          ${h.status_novo==='ENCERRADA'?'✓':'→'}
                        </div>
                        <div class="tl-body">
                          <div style="font-size:12px;font-weight:700">${h.status_anterior?h.status_anterior+' → ':''}${h.status_novo}</div>
                          ${h.observacao?`<div style="font-size:12px;margin-top:3px;color:var(--cinza4)">${h.observacao}</div>`:''}
                          <div class="tl-meta">${h.usuario_nome||''} · ${fmt.data(h.created_at)}</div>
                        </div>
                      </li>`).join('')}</ul>`
                  : `<div style="color:var(--cinza3);font-size:13px">Sem histórico</div>`}

                ${nc.status!=='ENCERRADA'?`
                <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--cinza2)">
                  <div style="font-size:11px;font-weight:700;color:var(--cinza4);text-transform:uppercase;margin-bottom:8px">Atualizar Status</div>
                  <select class="form-control" id="novo-status" style="margin-bottom:8px">
                    ${STATUS_NC.map(s=>`<option ${nc.status===s?'selected':''}>${s}</option>`).join('')}
                  </select>
                  <textarea class="form-control" id="obs-status" placeholder="Observação..." rows="3" style="margin-bottom:8px"></textarea>
                  <button class="btn btn-primary" id="btn-salvar-status" style="width:100%;justify-content:center">Salvar</button>
                </div>`:''}
              </div>
            </div>
          </div>
        </div>`;

        container.querySelector('#btn-voltar').onclick=()=>renderNcs(container,document.getElementById('topbar-actions'),navigate);
        const btnSalvar=container.querySelector('#btn-salvar-status');
        if(btnSalvar){
            btnSalvar.onclick=async()=>{
                loading(true);
                try{
                    await api.ncs.status(id,{status:container.querySelector('#novo-status').value,observacao:container.querySelector('#obs-status').value});
                    toast('Status atualizado!');
                    abrirDetalhe(container,id,navigate);
                }catch(e){toast(e.message,'error');}finally{loading(false);}
            };
        }
    }catch(e){loading(false);toast(e.message,'error');}
}

async function abrirForm(container, navigate) {
    loading(true);
    try {
        const [contratos,usuarios,inspecoes]=await Promise.all([
            api.contratos(),api.usuarios(),api.inspecoes.listar(),
        ]);
        loading(false);
        container.innerHTML=`
        <div style="max-width:860px">
          <button class="btn btn-outline" id="btn-voltar">← Voltar</button>
          <h2 style="font-size:16px;font-weight:700;color:var(--texto);margin:16px 0">Abrir Não Conformidade</h2>
          <form id="form-nc">
            <div class="card" style="margin-bottom:14px">
              <div class="card-title">Identificação</div>
              <div class="form-grid form-grid-3">
                <div class="form-group"><label>Gravidade <span class="req">*</span></label>
                  <select name="gravidade" class="form-control" required>
                    ${GRAVIDADES.map(g=>`<option>${g}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group"><label>Contrato</label>
                  <select name="contrato_id" class="form-control" id="sel-cont"></select>
                </div>
                <div class="form-group"><label>Responsável</label>
                  <select name="responsavel_id" class="form-control" id="sel-resp"></select>
                </div>
                <div class="form-group"><label>Prazo</label>
                  <input type="date" name="prazo" class="form-control">
                </div>
                <div class="form-group"><label>Inspeção Vinculada</label>
                  <select name="inspecao_id" class="form-control" id="sel-insp"></select>
                </div>
              </div>
            </div>
            <div class="card" style="margin-bottom:14px">
              <div class="card-title">Descrição e Plano de Ação</div>
              <div class="form-group"><label>Descrição <span class="req">*</span></label>
                <textarea name="descricao" class="form-control" rows="4" required placeholder="Descreva a não conformidade..."></textarea>
              </div>
              <div class="form-group"><label>Causa Raiz</label>
                <textarea name="causa_raiz" class="form-control" rows="3"></textarea>
              </div>
              <div class="form-group"><label>Ação Corretiva</label>
                <textarea name="acao_corretiva" class="form-control" rows="3"></textarea>
              </div>
            </div>
            <div style="display:flex;gap:10px">
              <button type="submit" class="btn btn-danger">⚠️ Abrir NC</button>
              <button type="button" class="btn btn-outline" id="btn-cancelar">Cancelar</button>
            </div>
          </form>
        </div>`;

        fillSelect(container.querySelector('#sel-cont'),contratos,'id','codigo');
        fillSelect(container.querySelector('#sel-resp'),usuarios,'id','nome');
        fillSelect(container.querySelector('#sel-insp'),
            inspecoes.map(i=>({id:i.id,label:`${i.codigo} — ${(i.local_descricao||i.municipio_nome||'').substring(0,40)}`})),
            'id','label');

        const voltar=()=>renderNcs(container,document.getElementById('topbar-actions'),navigate);
        container.querySelector('#btn-voltar').onclick=voltar;
        container.querySelector('#btn-cancelar').onclick=voltar;
        container.querySelector('#form-nc').onsubmit=async e=>{
            e.preventDefault();
            const d=formData(e.target);
            loading(true);
            try{
                const nc=await api.ncs.criar(d);
                toast(`NC ${nc.codigo} aberta!`);
                abrirDetalhe(container,nc.id,navigate);
            }catch(err){toast(err.message,'error');}finally{loading(false);}
        };
    }catch(e){loading(false);toast(e.message,'error');}
}
