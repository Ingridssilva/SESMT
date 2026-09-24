/**
 * checklist-lancamento.js
 * Página mobile-first para lançamento de checklists no campo.
 * Funciona offline — dados ficam em localStorage e sincronizam ao voltar online.
 */

export function renderChecklistLancamento(container, actions, navigate) {
    // ── estilos injetados uma vez ──────────────────────────────────────────
    if (!document.getElementById('ck-lan-styles')) {
        const s = document.createElement('style');
        s.id = 'ck-lan-styles';
        s.textContent = `
        #ck-lan { --laranja:#E8500A; --laranja-esc:#C44008; --laranja-cl:#FFF0E8;
          --cinza-esc:#1A1A1A; --cinza-med:#4A4A4A; --cinza-cl:#F5F5F5;
          --borda:#E0E0E0; --verde:#1A7A3C; --verde-bg:#E8F5EE;
          --vermelho:#C0392B; --vermelho-bg:#FDECEA;
          --amarelo:#7A6000; --amarelo-bg:#FFF8E0;
          --branco:#FFFFFF; --radius:14px; font-family:inherit; }

        #ck-lan { padding:0 !important; }

        /* telas */
        .ckl-tela { display:none; flex-direction:column; }
        .ckl-tela.ativa { display:flex; }

        /* header interno */
        .ckl-hdr { background:var(--laranja); color:#fff;
          padding:14px 16px 12px; display:flex; align-items:center; gap:10px;
          box-shadow:0 2px 8px rgba(232,80,10,.3); flex-shrink:0; }
        .ckl-hdr-back { background:rgba(255,255,255,.2); border:none; color:#fff;
          width:36px; height:36px; border-radius:50%; font-size:18px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .ckl-hdr-titulo { font-size:16px; font-weight:700; flex:1; line-height:1.2; }
        .ckl-hdr-sub { font-size:11px; opacity:.85; margin-top:1px; }
        .ckl-hdr-prog { font-size:12px; font-weight:700;
          background:rgba(255,255,255,.25); padding:4px 10px;
          border-radius:20px; flex-shrink:0; }
        .ckl-prog-wrap { background:rgba(0,0,0,.15); height:4px; flex-shrink:0; }
        .ckl-prog-fill { height:100%; background:#fff; transition:width .3s; }

        /* scroll */
        .ckl-scroll { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:16px; }

        /* cards de modelo */
        .ckl-card-modelo { background:var(--branco); border-radius:var(--radius);
          padding:16px; margin-bottom:10px;
          box-shadow:0 2px 12px rgba(0,0,0,.10); cursor:pointer;
          border:2px solid transparent; transition:border-color .15s,transform .1s;
          display:flex; align-items:center; gap:14px; }
        .ckl-card-modelo:active { transform:scale(.98); border-color:var(--laranja); }
        .ckl-card-icone { width:48px; height:48px; background:var(--laranja-cl);
          border-radius:12px; display:flex; align-items:center;
          justify-content:center; font-size:22px; flex-shrink:0; }
        .ckl-card-info { flex:1; }
        .ckl-card-titulo { font-size:14px; font-weight:700; line-height:1.3; }
        .ckl-card-cod { font-size:11px; color:var(--cinza-med); margin-top:2px; }

        /* formulário cabecalho */
        .ckl-fg { margin-bottom:14px; }
        .ckl-lbl { font-size:12px; font-weight:600; color:var(--cinza-med);
          margin-bottom:5px; display:block; }
        .ckl-inp { width:100%; border:1.5px solid var(--borda); border-radius:10px;
          padding:12px 14px; font-size:15px; background:var(--branco);
          color:var(--cinza-esc); outline:none; transition:border-color .15s;
          -webkit-appearance:none; font-family:inherit; }
        .ckl-inp:focus { border-color:var(--laranja); }

        /* botão primário */
        .ckl-btn-prim { width:100%; background:var(--laranja); color:#fff; border:none;
          border-radius:12px; padding:16px; font-size:16px; font-weight:700;
          cursor:pointer; margin-top:8px; transition:background .15s,transform .1s;
          font-family:inherit; }
        .ckl-btn-prim:active { background:var(--laranja-esc); transform:scale(.98); }
        .ckl-btn-prim:disabled { background:#ccc; cursor:not-allowed; }

        /* item */
        .ckl-secao-badge { display:inline-block; background:var(--laranja-cl);
          color:var(--laranja-esc); font-size:11px; font-weight:700;
          padding:4px 10px; border-radius:20px; margin-bottom:12px;
          text-transform:uppercase; letter-spacing:.5px; }
        .ckl-item-desc { font-size:18px; font-weight:700; line-height:1.4;
          margin-bottom:24px; color:var(--cinza-esc); }
        .ckl-bots { display:flex; flex-direction:column; gap:12px; margin-bottom:24px; }
        .ckl-bot-sit { border:2.5px solid var(--borda); border-radius:14px;
          padding:18px 20px; font-size:17px; font-weight:700; cursor:pointer;
          background:var(--branco); display:flex; align-items:center; gap:14px;
          transition:all .15s; text-align:left; font-family:inherit; width:100%; }
        .ckl-bot-sit:active { transform:scale(.98); }
        .ckl-sit-icone { font-size:26px; flex-shrink:0; }
        .ckl-sit-sub { font-size:12px; font-weight:400; opacity:.7; margin-top:2px; }
        .ckl-bot-sit.conforme    { border-color:var(--verde);    background:var(--verde-bg);    color:var(--verde); }
        .ckl-bot-sit.nc         { border-color:var(--vermelho); background:var(--vermelho-bg); color:var(--vermelho); }
        .ckl-bot-sit.na         { border-color:var(--amarelo);  background:var(--amarelo-bg);  color:var(--amarelo); }
        .ckl-bot-sit.bom        { border-color:var(--verde);    background:var(--verde-bg);    color:var(--verde); }
        .ckl-bot-sit.ruim       { border-color:var(--vermelho); background:var(--vermelho-bg); color:var(--vermelho); }

        /* quantidade */
        .ckl-quant { display:flex; align-items:center; margin-bottom:18px; }
        .ckl-quant-btn { width:48px; height:48px; background:var(--cinza-cl);
          border:1.5px solid var(--borda); font-size:22px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; font-weight:700; }
        .ckl-quant-btn:first-child { border-radius:10px 0 0 10px; }
        .ckl-quant-btn:last-child  { border-radius:0 10px 10px 0; }
        .ckl-quant-val { flex:1; text-align:center; font-size:20px; font-weight:700;
          border:1.5px solid var(--borda); border-left:none; border-right:none;
          padding:10px; background:var(--branco); }

        /* obs */
        .ckl-obs-toggle { background:none; border:1.5px dashed var(--borda);
          border-radius:10px; padding:12px 14px; width:100%; text-align:left;
          font-size:13px; color:var(--cinza-med); cursor:pointer;
          display:flex; align-items:center; gap:8px; font-family:inherit; }
        .ckl-obs-inp { width:100%; border:1.5px solid var(--borda); border-radius:10px;
          padding:12px 14px; font-size:14px; resize:none; min-height:80px;
          font-family:inherit; background:var(--branco); outline:none; display:none; }
        .ckl-obs-inp:focus { border-color:var(--laranja); }
        .ckl-obs-inp.vis { display:block; }

        /* nav inferior */
        .ckl-nav-inf { flex-shrink:0; padding:12px 16px; background:var(--branco);
          border-top:1px solid var(--borda); display:flex; gap:10px; }
        .ckl-btn-sec { flex:1; background:var(--cinza-cl); border:1.5px solid var(--borda);
          border-radius:10px; padding:13px; font-size:14px; font-weight:600;
          cursor:pointer; color:var(--cinza-esc); font-family:inherit; }

        /* resumo */
        .ckl-res-hdr { background:var(--branco); border-radius:var(--radius);
          padding:20px; margin-bottom:16px;
          box-shadow:0 2px 12px rgba(0,0,0,.10); text-align:center; }
        .ckl-stats { display:grid; grid-template-columns:1fr 1fr 1fr;
          gap:10px; margin-bottom:16px; }
        .ckl-stat { background:var(--branco); border-radius:12px; padding:14px 8px;
          text-align:center; box-shadow:0 2px 12px rgba(0,0,0,.10); }
        .ckl-stat-num { font-size:24px; font-weight:800; }
        .ckl-stat-lbl { font-size:10px; color:var(--cinza-med); margin-top:2px;
          text-transform:uppercase; letter-spacing:.5px; }
        .ckl-stat.v .ckl-stat-num { color:var(--verde); }
        .ckl-stat.r .ckl-stat-num { color:var(--vermelho); }
        .ckl-stat.c .ckl-stat-num { color:var(--cinza-med); }
        .ckl-nc-item { background:var(--vermelho-bg); border-left:4px solid var(--vermelho);
          border-radius:0 10px 10px 0; padding:12px 14px; margin-bottom:8px;
          font-size:13px; }
        .ckl-nc-item strong { display:block; font-size:11px; color:var(--vermelho);
          margin-bottom:2px; text-transform:uppercase; }
        .ckl-resultado-wrap { display:flex; gap:10px; margin-bottom:20px; }
        .ckl-res-btn { flex:1; border:2.5px solid var(--borda); border-radius:12px;
          padding:14px 10px; font-size:14px; font-weight:700; cursor:pointer;
          background:var(--branco); font-family:inherit; transition:all .15s; }
        .ckl-res-btn.ok  { border-color:var(--verde);    background:var(--verde-bg);    color:var(--verde); }
        .ckl-res-btn.nok { border-color:var(--vermelho); background:var(--vermelho-bg); color:var(--vermelho); }

        /* offline */
        .ckl-foto-thumb { position:relative; width:80px; height:80px;
          border-radius:10px; overflow:hidden; border:2px solid #E8500A; flex-shrink:0; }
        .ckl-foto-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
        .ckl-foto-del { position:absolute; top:2px; right:2px; background:rgba(0,0,0,.6);
          color:#fff; border:none; border-radius:50%; width:20px; height:20px;
          font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .ckl-offline-badge { display:none; background:#7A6000; color:#fff;
          font-size:11px; font-weight:700; padding:3px 8px; border-radius:4px; }
        .ckl-offline-badge.vis { display:inline-block; }

        /* secao label */
        .ckl-sec-lbl { font-size:11px; font-weight:700; color:var(--cinza-med);
          text-transform:uppercase; letter-spacing:.8px; margin:20px 0 8px; }
        `;
        document.head.appendChild(s);
    }

    // ── estado ──────────────────────────────────────────────────────────────
    let usuarioMe = null;
    let modelos = [];
    let modeloAtual = null;
    let itensTodos = [];
    let itemIdx = 0;
    let respostas = {};
    let cabecalho = {};
    let resultadoGeral = null;
    let isOffline = !navigator.onLine;

    const ICONES = {
        'SESMT_CHECKLIST_01':'🦺','SESMT_CHECKLIST_02':'🛡️',
        'SESMT_CHECKLIST_04':'🚜','SESMT_FISC_RET':'🔍',
        'SESMT_FISC_RET_01':'🔍','SESMT_FISC_CAM':'🚛','SESMT_FISC_CAM_01':'🚛',
    };

    // Modelos que inspecionam UM colaborador específico (EPI, EPC)
    const MODELOS_COM_COLABORADOR = ['SESMT_CHECKLIST_01', 'SESMT_CHECKLIST_02'];

    // Colaborador selecionado via modal
    let colaboradorSelecionado = null;
    let payloadLocalId = null; // ID único do preenchimento atual (para chave das fotos no IDB)

    const CAMPOS = {
        'SESMT_CHECKLIST_01': [
            {id:'colaborador_nome',  label:'Nome do Colaborador', type:'text', req:true},
            {id:'colaborador_funcao',label:'Função',              type:'text', req:false},
            {id:'matricula',         label:'Matrícula',           type:'text', req:false},
            {id:'equipe',            label:'Equipe',              type:'text', req:true},
            {id:'local',             label:'Obra / Local',        type:'text', req:true},
            {id:'data',              label:'Data',                type:'date', req:true},
            {id:'hora',              label:'Hora',                type:'time', req:false},
        ],
        'SESMT_CHECKLIST_02': [
            {id:'equipe',      label:'Equipe',        type:'text', req:true},
            {id:'responsavel', label:'Responsável',   type:'text', req:true},
            {id:'local',       label:'Obra / Local',  type:'text', req:true},
            {id:'data',        label:'Data',           type:'date', req:true},
            {id:'hora',        label:'Hora',           type:'time', req:false},
        ],
        'SESMT_CHECKLIST_04': [
            {id:'equipe',             label:'Equipe',                  type:'text', req:true},
            {id:'encarregado',        label:'Encarregado',             type:'text', req:false},
            {id:'responsavel_maquina',label:'Responsável pela Máquina',type:'text', req:true},
            {id:'horimetro',          label:'Horímetro',               type:'text', req:false},
            {id:'data',               label:'Data',                     type:'date', req:true},
            {id:'hora',               label:'Hora',                     type:'time', req:false},
        ],
        'DEFAULT': [
            {id:'equipe',             label:'Equipe',                  type:'text', req:true},
            {id:'encarregado',        label:'Encarregado',             type:'text', req:false},
            {id:'responsavel_maquina',label:'Responsável pela Máquina',type:'text', req:false},
            {id:'documento',          label:'Documento (CNH etc.)',     type:'text', req:false},
            {id:'data',               label:'Data',                     type:'date', req:true},
            {id:'hora',               label:'Hora',                     type:'time', req:false},
        ],
    };

    const SITS_CFG = {
        'CONFORME':      {cls:'conforme', icone:'✅', sub:'Item em conformidade'},
        'NÃO CONFORME':  {cls:'nc',       icone:'❌', sub:'Abrir não conformidade'},
        'NÃO SE APLICA': {cls:'na',       icone:'—',  sub:'Não se aplica'},
        'N/A':           {cls:'na',       icone:'—',  sub:'Não se aplica'},
        'BOM':           {cls:'bom',      icone:'👍', sub:'Em bom estado'},
        'RUIM':          {cls:'ruim',     icone:'👎', sub:'Em mau estado'},
    };

    // ── render principal ──────────────────────────────────────────────────
    container.id = 'ck-lan';
    container.innerHTML = `
    <!-- TELA 1: SELEÇÃO -->
    <div class="ckl-tela ativa" id="ckl-t1">
      <div class="ckl-scroll">
        <div style="text-align:center;padding:28px 0 16px">
          <div style="font-size:44px">🦺</div>
          <div style="font-size:20px;font-weight:800;color:#E8500A;margin-top:8px">Lançamento de Checklist</div>
          <div style="font-size:13px;color:#4A4A4A;margin-top:4px">Selecione o tipo de inspeção</div>
        </div>
        <div class="ckl-sec-lbl">Modelos disponíveis</div>
        <div id="ckl-modelos"><div style="text-align:center;padding:40px;color:#999;font-size:14px">Carregando...</div></div>
        <div style="height:16px"></div>
        <div style="background:#FFF8E0;border-radius:12px;padding:14px 16px;font-size:12px;color:#7A6000;line-height:1.6">
          ⚡ <strong>Funciona offline.</strong> Preencha mesmo sem sinal. Os dados são enviados automaticamente quando a conexão voltar.
        </div>
        <div id="ckl-pendentes-aviso" style="display:none;background:#E8F5EE;border-radius:12px;padding:12px 16px;font-size:12px;color:#1A7A3C;margin-top:10px;line-height:1.5"></div>

        <!-- Histórico de lançamentos -->
        <div class="ckl-sec-lbl" id="ckl-hist-lbl" style="display:none">Lançamentos recentes</div>
        <div id="ckl-historico"></div>

        <div style="height:20px"></div>
      </div>
    </div>

    <!-- TELA 2: CABEÇALHO -->
    <div class="ckl-tela" id="ckl-t2">
      <div class="ckl-hdr">
        <button class="ckl-hdr-back" id="ckl-back-cab">←</button>
        <div><div class="ckl-hdr-titulo" id="ckl-cab-titulo">—</div>
        <div class="ckl-hdr-sub">Informações gerais</div></div>
      </div>
      <div class="ckl-scroll">
        <div style="height:4px"></div>
        <div id="ckl-campos-cab"></div>
        <button class="ckl-btn-prim" id="ckl-btn-iniciar">Iniciar Checklist →</button>
        <div style="height:20px"></div>
      </div>
    </div>

    <!-- TELA 3: ITEM -->
    <div class="ckl-tela" id="ckl-t3">
      <div class="ckl-hdr">
        <button class="ckl-hdr-back" id="ckl-back-item">←</button>
        <div style="flex:1">
          <div class="ckl-hdr-titulo" id="ckl-item-modelo">—</div>
          <div class="ckl-hdr-sub" id="ckl-item-secao">—</div>
        </div>
        <div class="ckl-hdr-prog" id="ckl-item-prog">0/0</div>
      </div>
      <div class="ckl-prog-wrap"><div class="ckl-prog-fill" id="ckl-pfill" style="width:0%"></div></div>
      <div class="ckl-scroll" id="ckl-scroll-item">
        <div style="height:8px"></div>
        <div class="ckl-secao-badge" id="ckl-item-badge">Seção</div>
        <div class="ckl-item-desc" id="ckl-item-desc">—</div>
        <div class="ckl-bots" id="ckl-bots-sit"></div>
        <div id="ckl-quant-wrap" style="display:none">
          <div class="ckl-sec-lbl" style="margin-top:0">Quantidade</div>
          <div class="ckl-quant">
            <button class="ckl-quant-btn" id="ckl-q-menos">−</button>
            <div class="ckl-quant-val" id="ckl-q-val">0</div>
            <button class="ckl-quant-btn" id="ckl-q-mais">+</button>
          </div>
        </div>
        <div>
          <button class="ckl-obs-toggle" id="ckl-obs-toggle">📝 Adicionar observação</button>
          <textarea class="ckl-obs-inp" id="ckl-obs-inp" rows="3" placeholder="Digite a observação..."></textarea>
        </div>

        <!-- Fotos do item -->
        <div id="ckl-foto-wrap" style="margin-bottom:16px">
          <input type="file" id="ckl-foto-inp" accept="image/*" capture="environment"
            style="display:none" multiple>
          <button class="ckl-obs-toggle" id="ckl-foto-btn" style="margin-top:8px">
            📷 Adicionar foto
          </button>
          <div id="ckl-fotos-preview" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"></div>
        </div>

        <div style="height:80px"></div>
      </div>
      <div class="ckl-nav-inf">
        <button class="ckl-btn-sec" id="ckl-btn-ant">← Anterior</button>
        <button class="ckl-btn-sec" id="ckl-btn-pular" style="flex:0.6">Pular</button>
      </div>
    </div>

    <!-- TELA 4: RESUMO -->
    <div class="ckl-tela" id="ckl-t4">
      <div class="ckl-hdr">
        <div style="flex:1">
          <div class="ckl-hdr-titulo">Resumo da Inspeção</div>
          <div class="ckl-hdr-sub" id="ckl-res-modelo">—</div>
        </div>
        <span class="ckl-offline-badge" id="ckl-offline-badge">OFFLINE</span>
      </div>
      <div class="ckl-scroll">
        <div style="height:8px"></div>
        <div class="ckl-res-hdr">
          <div style="font-size:48px;margin-bottom:8px" id="ckl-res-emoji">✅</div>
          <div style="font-size:18px;font-weight:800" id="ckl-res-titulo">—</div>
          <div style="font-size:13px;color:#4A4A4A;margin-top:4px" id="ckl-res-sub">—</div>
        </div>
        <div class="ckl-stats">
          <div class="ckl-stat v"><div class="ckl-stat-num" id="ckl-s-conf">0</div><div class="ckl-stat-lbl">Conformes</div></div>
          <div class="ckl-stat r"><div class="ckl-stat-num" id="ckl-s-nc">0</div><div class="ckl-stat-lbl">Não conf.</div></div>
          <div class="ckl-stat c"><div class="ckl-stat-num" id="ckl-s-na">0</div><div class="ckl-stat-lbl">N/A</div></div>
        </div>
        <div id="ckl-nc-wrap" style="display:none">
          <div class="ckl-sec-lbl" style="margin-top:0">Itens não conformes</div>
          <div id="ckl-nc-lista"></div>
        </div>
        <div class="ckl-sec-lbl">Resultado geral</div>
        <div class="ckl-resultado-wrap">
          <button class="ckl-res-btn" id="ckl-rb-conf" onclick="">✅ Conforme</button>
          <button class="ckl-res-btn" id="ckl-rb-nc"   onclick="">❌ Não Conforme</button>
        </div>
        <div class="ckl-sec-lbl" style="margin-top:0">Observações extras</div>
        <textarea class="ckl-inp" id="ckl-obs-extras" rows="3"
          placeholder="Observações gerais sobre a inspeção..."></textarea>
        <button class="ckl-btn-prim" id="ckl-btn-enviar" style="margin-top:16px">Salvar e Enviar</button>
        <div style="height:24px"></div>
      </div>
    </div>
    `;

    // ── helpers de tela ───────────────────────────────────────────────────
    function tela(id) {
        container.querySelectorAll('.ckl-tela').forEach(t => t.classList.remove('ativa'));
        container.querySelector(id).classList.add('ativa');
        container.querySelector('.ckl-scroll')?.scrollTo(0,0);
    }

    function toast(msg, dur=2500) {
        // reusar toast global se existir
        let el = document.getElementById('ck-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ck-toast';
            el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:#1A1A1A;color:#fff;padding:12px 20px;border-radius:30px;font-size:14px;font-weight:600;opacity:0;transition:all .3s;pointer-events:none;white-space:nowrap;z-index:9999';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(0)';
        setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(-50%) translateY(20px)'; }, dur);
    }

    function atualizarOffline() {
        const b = document.getElementById('ckl-offline-badge');
        if (b) b.classList.toggle('vis', isOffline);
    }

    // ── TELA 1: modelos ──────────────────────────────────────────────────
    async function carregarHistorico() {
        try {
            const r = await fetch('/api/checklists/preenchimentos?limit=5', {credentials:'include'});
            if (!r.ok) return;
            const d = await r.json();
            const lista = Array.isArray(d.data) ? d.data : [];
            const el = document.getElementById('ckl-historico');
            const lbl = document.getElementById('ckl-hist-lbl');
            if (!el || !lista.length) return;
            if (lbl) lbl.style.display = 'block';
            el.innerHTML = lista.map(c => {
                const cor = c.resultado_geral === 'CONFORME' ? '#1A7A3C' : '#C0392B';
                const bg  = c.resultado_geral === 'CONFORME' ? '#E8F5EE' : '#FDECEA';
                const cab = typeof c.cabecalho === 'string'
                    ? (() => { try { return JSON.parse(c.cabecalho); } catch { return {}; } })()
                    : (c.cabecalho || {});
                const nomeColab = c.nome_avaliado || cab.colaborador_nome ||
                                  cab.responsavel_maquina || cab.equipe || '—';
                const data = c.created_at
                    ? new Date(c.created_at).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'})
                    : '—';
                return `
                  <div style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:8px;
                       box-shadow:0 2px 8px rgba(0,0,0,.07);display:flex;align-items:center;gap:12px">
                    <div style="width:40px;height:40px;background:${bg};border-radius:10px;
                         display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
                      ${c.resultado_geral === 'CONFORME' ? '✅' : '⚠️'}
                    </div>
                    <div style="flex:1;min-width:0">
                      <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        ${c.modelo_titulo || c.modelo_codigo || '—'}
                      </div>
                      <div style="font-size:11px;color:#888;margin-top:2px">${nomeColab} · ${data}</div>
                    </div>
                    <span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;
                          background:${bg};color:${cor};white-space:nowrap">
                      ${c.resultado_geral || '—'}
                    </span>
                  </div>`;
            }).join('');
        } catch {}
    }

    async function carregarModelos() {
        const pendentes = JSON.parse(localStorage.getItem('sesmt_ck_pendentes')||'[]');
        const aviso = document.getElementById('ckl-pendentes-aviso');
        if (pendentes.length && aviso) {
            aviso.style.display = 'block';
            aviso.textContent = `📦 ${pendentes.length} checklist(s) pendente(s) de envio. Serão sincronizados automaticamente.`;
        }
        try {
            const r = await fetch('/api/checklists/modelos', {credentials:'include'});
            if (!r.ok) throw new Error();
            modelos = await r.json();
            localStorage.setItem('sesmt_ck_modelos', JSON.stringify(modelos));
        } catch {
            const c = localStorage.getItem('sesmt_ck_modelos');
            if (c) { modelos = JSON.parse(c); toast('📦 Modelos do cache'); }
        }
        renderModelos();
    }

    function renderModelos() {
        const el = document.getElementById('ckl-modelos');
        if (!modelos.length) {
            el.innerHTML = '<div style="color:#999;text-align:center;padding:24px;font-size:14px">Nenhum modelo disponível</div>';
            return;
        }
        el.innerHTML = modelos.map(m => `
          <div class="ckl-card-modelo" data-id="${m.id}">
            <div class="ckl-card-icone">${ICONES[m.codigo]||'📋'}</div>
            <div class="ckl-card-info">
              <div class="ckl-card-titulo">${m.titulo}</div>
              <div class="ckl-card-cod">${m.codigo} · ${m.tipo==='ambos'?'Campo e Liderança':'Campo'}</div>
            </div>
            <span style="color:#E8500A;font-size:18px">›</span>
          </div>`).join('');
        el.querySelectorAll('.ckl-card-modelo').forEach(c =>
            c.addEventListener('click', () => selecionarModelo(+c.dataset.id)));
    }

    // ── TELA 2: cabeçalho ────────────────────────────────────────────────
    async function selecionarModelo(id) {
        modeloAtual = modelos.find(m => m.id === id);
        if (!modeloAtual) return;
        document.getElementById('ckl-cab-titulo').textContent = modeloAtual.titulo;

        const campos = CAMPOS[modeloAtual.codigo] || CAMPOS['DEFAULT'];
        const hoje = new Date().toISOString().split('T')[0];
        const agora = new Date().toTimeString().slice(0,5);
        const temColaborador = MODELOS_COM_COLABORADOR.includes(modeloAtual.codigo);
        colaboradorSelecionado = null;

        let htmlCampos = '';

        // Se o modelo inspeciona um colaborador, mostrar seletor no topo
        if (temColaborador) {
            htmlCampos += `
              <div class="ckl-fg">
                <label class="ckl-lbl">Colaborador Inspecionado *</label>
                <button type="button" id="ckl-btn-sel-colab" style="
                  width:100%;border:2px dashed #E8500A;border-radius:10px;
                  padding:14px 16px;background:#FFF0E8;color:#E8500A;font-size:15px;
                  font-weight:700;cursor:pointer;text-align:left;font-family:inherit;
                  display:flex;align-items:center;gap:10px;">
                  <span style="font-size:20px">👤</span>
                  <span id="ckl-colab-label">Selecionar colaborador da base...</span>
                </button>
                <input type="hidden" id="ckcab-colaborador_nome">
                <input type="hidden" id="ckcab-colaborador_funcao">
                <input type="hidden" id="ckcab-matricula">
              </div>`;
        }

        htmlCampos += campos
          .filter(c => !temColaborador || !['colaborador_nome','colaborador_funcao','matricula'].includes(c.id))
          .map(c => `
            <div class="ckl-fg">
              <label class="ckl-lbl">${c.label}${c.req?' *':''}</label>
              <input class="ckl-inp" type="${c.type}" id="ckcab-${c.id}"
                value="${c.type==='date'?hoje:c.type==='time'?agora:''}"
                placeholder="${c.label}" ${c.req?'required':''}>
            </div>`).join('');

        document.getElementById('ckl-campos-cab').innerHTML = htmlCampos;

        await carregarItens(id);

        // Pré-preencher campos com dados do usuário logado
        if (usuarioMe) {
            const colab = usuarioMe.colaborador;
            const nomeAzure = usuarioMe.nome || '';
            const preencher = (fid, val) => {
                const el = document.getElementById('ckcab-'+fid);
                if (el && !el.value && val) el.value = val;
            };
            if (colab) {
                preencher('colaborador_nome',   colab.nome);
                preencher('colaborador_funcao', colab.cargo);
                preencher('matricula',          colab.matricula);
            } else {
                preencher('colaborador_nome', nomeAzure);
            }
        }

        tela('#ckl-t2');

        // Bind do botão seletor após DOM visível
        const _btnSel = document.getElementById('ckl-btn-sel-colab');
        if (_btnSel) _btnSel.addEventListener('click', seletorColaborador);
    }

    async function carregarItens(modeloId) {
        const key = `sesmt_ck_itens_${modeloId}`;
        try {
            const r = await fetch(`/api/checklists/modelos/${modeloId}/itens`, {credentials:'include'});
            if (!r.ok) throw new Error();
            itensTodos = await r.json();
            localStorage.setItem(key, JSON.stringify(itensTodos));
        } catch {
            const c = localStorage.getItem(key);
            itensTodos = c ? JSON.parse(c) : [];
            if (!c) toast('❌ Sem itens disponíveis offline');
        }
    }

    function iniciarChecklist() {
        const campos = CAMPOS[modeloAtual.codigo] || CAMPOS['DEFAULT'];
        const temColaborador = MODELOS_COM_COLABORADOR.includes(modeloAtual.codigo);

        // Validar colaborador selecionado
        if (temColaborador && !colaboradorSelecionado) {
            toast('⚠️ Selecione o colaborador inspecionado');
            return;
        }

        for (const c of campos) {
            if (!c.req) continue;
            if (temColaborador && ['colaborador_nome','colaborador_funcao','matricula'].includes(c.id)) continue;
            const el = document.getElementById('ckcab-'+c.id);
            if (!el?.value?.trim()) { toast('⚠️ Preencha: '+c.label); el?.focus(); return; }
        }
        cabecalho = {};
        campos.forEach(c => {
            const el = document.getElementById('ckcab-'+c.id);
            if (el) cabecalho[c.id] = el.value.trim();
        });
        if (!itensTodos.length) { toast('❌ Nenhum item carregado'); return; }
        // Gerar ID único para este preenchimento (usado como chave no IDB das fotos)
        payloadLocalId = 'ckl_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
        itemIdx = 0; respostas = {};
        renderItem();
        tela('#ckl-t3');
    }

    // ── TELA 3: item ─────────────────────────────────────────────────────
    function renderItem() {
        if (itemIdx >= itensTodos.length) { renderResumo(); tela('#ckl-t4'); return; }
        const item = itensTodos[itemIdx];
        const total = itensTodos.length;
        const perc = Math.round((itemIdx/total)*100);
        const resp = respostas[item.id];

        document.getElementById('ckl-item-modelo').textContent = modeloAtual.titulo;
        document.getElementById('ckl-item-secao').textContent  = item.secao_titulo||'';
        document.getElementById('ckl-item-badge').textContent  = item.secao_titulo||'Seção';
        document.getElementById('ckl-item-desc').textContent   = item.descricao;
        document.getElementById('ckl-item-prog').textContent   = `${itemIdx+1}/${total}`;
        document.getElementById('ckl-pfill').style.width       = perc+'%';

        // botões situação
        const sits = modeloAtual.tipo_situacao || ['CONFORME','NÃO CONFORME','N/A'];
        document.getElementById('ckl-bots-sit').innerHTML = sits.map(s => {
            const cfg = SITS_CFG[s] || {cls:'',icone:'•',sub:''};
            const sel = resp?.situacao === s;
            return `<button class="ckl-bot-sit ${sel?cfg.cls:''}"
              data-sit="${s}" style="${sel?'opacity:1':''}">
              <span class="ckl-sit-icone">${cfg.icone}</span>
              <div style="flex:1"><div>${s}</div><div class="ckl-sit-sub">${cfg.sub}</div></div>
              ${sel?'<span style="margin-left:auto;font-size:20px">✓</span>':''}
            </button>`;
        }).join('');
        document.getElementById('ckl-bots-sit').querySelectorAll('.ckl-bot-sit')
            .forEach(b => b.addEventListener('click', () => selecionarSit(b.dataset.sit)));

        // quantidade
        const qw = document.getElementById('ckl-quant-wrap');
        qw.style.display = item.tem_quant ? 'block' : 'none';
        if (item.tem_quant) document.getElementById('ckl-q-val').textContent = resp?.quant??0;

        // obs
        const obsInp = document.getElementById('ckl-obs-inp');
        const obsToggle = document.getElementById('ckl-obs-toggle');
        obsInp.value = resp?.obs||'';
        if (resp?.obs) { obsInp.classList.add('vis'); obsToggle.style.display='none'; }
        else { obsInp.classList.remove('vis'); obsToggle.style.display='flex'; }

        // Fotos do item atual — carregar do IDB
        const fotosPreview = document.getElementById('ckl-fotos-preview');
        if (fotosPreview) {
            fotosPreview.innerHTML = '';
            const fotoIds = resp?.foto_ids || [];
            if (fotoIds.length && payloadLocalId) {
                listarFotosIDB(payloadLocalId).then(todas => {
                    const doItem = todas.filter(f => fotoIds.includes(f.foto_id));
                    doItem.forEach(f => adicionarThumb(f.base64, f.foto_id));
                    atualizarContadorFoto(item.id);
                });
            } else {
                atualizarContadorFoto(item.id);
            }
        }

        document.getElementById('ckl-scroll-item')?.scrollTo(0,0);
        document.getElementById('ckl-btn-ant').disabled = itemIdx===0;

        // Bind dos eventos de foto (novo a cada render)
        bindFotoInput();
    }

    function selecionarSit(sit) {
        const item = itensTodos[itemIdx];
        if (!respostas[item.id]) respostas[item.id]={};
        respostas[item.id].situacao = sit;
        renderItem();
        setTimeout(() => avancar(), 280);
    }

    function avancar() {
        salvarObs();
        itemIdx++;
        renderItem();
    }

    function salvarObs() {
        const item = itensTodos[itemIdx];
        if (!item) return;
        const obsInp = document.getElementById('ckl-obs-inp');
        if (obsInp?.classList.contains('vis') && obsInp.value.trim()) {
            if (!respostas[item.id]) respostas[item.id]={};
            respostas[item.id].obs = obsInp.value.trim();
        }
        // Fotos já são salvas em tempo real pelo input handler
    }

    function voltarItem() {
        if (itemIdx===0) { tela('#ckl-t2'); return; }
        itemIdx--;
        renderItem();
    }

    // ── TELA 4: resumo ───────────────────────────────────────────────────
    function renderResumo() {
        atualizarOffline();
        document.getElementById('ckl-res-modelo').textContent = modeloAtual.titulo;
        let conf=0, nc=0, na=0;
        const ncItens=[];
        itensTodos.forEach(item => {
            const r = respostas[item.id];
            if (!r?.situacao) return;
            const s = r.situacao;
            if (s==='CONFORME'||s==='BOM') conf++;
            else if (s==='NÃO CONFORME'||s==='RUIM') { nc++; ncItens.push({...item, obs:r.obs}); }
            else na++;
        });
        document.getElementById('ckl-s-conf').textContent = conf;
        document.getElementById('ckl-s-nc').textContent   = nc;
        document.getElementById('ckl-s-na').textContent   = na;

        if (nc===0) {
            document.getElementById('ckl-res-emoji').textContent   = '✅';
            document.getElementById('ckl-res-titulo').textContent  = 'Ótimo resultado!';
            resultadoGeral = 'CONFORME';
        } else {
            document.getElementById('ckl-res-emoji').textContent   = '⚠️';
            document.getElementById('ckl-res-titulo').textContent  = `${nc} item${nc>1?'s':''} não conforme${nc>1?'s':''}`;
            resultadoGeral = 'NÃO CONFORME';
        }
        document.getElementById('ckl-res-sub').textContent =
            `${conf+nc+na} de ${itensTodos.length} itens respondidos`;

        const ncWrap = document.getElementById('ckl-nc-wrap');
        if (ncItens.length) {
            ncWrap.style.display='block';
            document.getElementById('ckl-nc-lista').innerHTML = ncItens.map(i=>`
              <div class="ckl-nc-item">
                <strong>${i.secao_titulo||''}</strong>${i.descricao}
                ${i.obs?`<div style="margin-top:4px;font-style:italic;opacity:.8">Obs: ${i.obs}</div>`:''}
              </div>`).join('');
        } else ncWrap.style.display='none';

        setResultado(resultadoGeral);
    }

    function setResultado(val) {
        resultadoGeral = val;
        document.getElementById('ckl-rb-conf').className = 'ckl-res-btn'+(val==='CONFORME'?' ok':'');
        document.getElementById('ckl-rb-nc').className   = 'ckl-res-btn'+(val==='NÃO CONFORME'?' nok':'');
    }

    // ── ENVIO ────────────────────────────────────────────────────────────
    async function enviarChecklist() {
        if (!resultadoGeral) { toast('⚠️ Selecione o resultado geral'); return; }
        const payload = {
            modelo_id: modeloAtual.id,
            cabecalho: {...cabecalho, modelo_codigo:modeloAtual.codigo},
            resultado: resultadoGeral,
            observacoes_extras: document.getElementById('ckl-obs-extras').value.trim(),
            respostas: await Promise.all(itensTodos.map(async item => {
                const r = respostas[item.id] || {};
                // Buscar base64 das fotos do IDB
                let fotosBase64 = [];
                if (r.foto_ids?.length && payloadLocalId) {
                    const todas = await listarFotosIDB(payloadLocalId);
                    fotosBase64 = todas
                        .filter(f => r.foto_ids.includes(f.foto_id))
                        .map(f => f.base64);
                }
                return {
                    item_id:  item.id,
                    situacao: r.situacao||null,
                    quant:    r.quant??null,
                    obs:      r.obs||null,
                    fotos:    fotosBase64,
                };
            })).then(rs => rs.filter(r => r.situacao)),
            local_id: payloadLocalId,
            created_at: new Date().toISOString(),
        };

        if (isOffline) {
            salvarPendente(payload);
            toast('📦 Salvo offline — será enviado com sinal');
            setTimeout(() => { resetar(); tela('#ckl-t1'); }, 1600);
            return;
        }

        document.getElementById('ckl-btn-enviar').disabled = true;
        document.getElementById('ckl-btn-enviar').textContent = 'Enviando...';
        try {
            const r = await fetch('/api/checklists/preenchimentos', {
                method:'POST', credentials:'include',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify(payload),
            });
            if (!r.ok) throw new Error('Erro '+r.status);
            toast('✅ Checklist enviado com sucesso!');
            setTimeout(() => { resetar(); tela('#ckl-t1'); carregarHistorico(); }, 1600);
        } catch {
            salvarPendente(payload);
            toast('📦 Sem conexão — salvo para sincronizar depois');
            setTimeout(() => { resetar(); tela('#ckl-t1'); }, 2000);
        } finally {
            const btn = document.getElementById('ckl-btn-enviar');
            if (btn) { btn.disabled=false; btn.textContent='Salvar e Enviar'; }
        }
    }

    function salvarPendente(payload) {
        const p = JSON.parse(localStorage.getItem('sesmt_ck_pendentes')||'[]');
        p.push(payload);
        localStorage.setItem('sesmt_ck_pendentes', JSON.stringify(p));
    }

    async function sincronizarPendentes() {
        const p = JSON.parse(localStorage.getItem('sesmt_ck_pendentes')||'[]');
        if (!p.length) return;
        const ok=[];
        for (const pl of p) {
            try {
                const r = await fetch('/api/checklists/preenchimentos',{
                    method:'POST',credentials:'include',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify(pl),
                });
                if (r.ok) ok.push(pl.local_id);
            } catch{}
        }
        if (ok.length) {
            localStorage.setItem('sesmt_ck_pendentes',
                JSON.stringify(p.filter(x=>!ok.includes(x.local_id))));
            toast(`✅ ${ok.length} checklist(s) sincronizado(s)`);
            carregarModelos(); // atualizar aviso de pendentes
        }
    }

    async function resetar() {
        // Limpar fotos do IDB do preenchimento atual
        if (payloadLocalId) {
            await deletarFotosPreenchimentoIDB(payloadLocalId).catch(() => {});
        }
        modeloAtual=null; itensTodos=[]; itemIdx=0;
        respostas={}; cabecalho={}; resultadoGeral=null; payloadLocalId=null;
    }

    // ── eventos ──────────────────────────────────────────────────────────
    // ── seletor de colaborador ───────────────────────────────────────────────
    async function seletorColaborador() {
        let colabs = [];
        try {
            const r = await fetch('/api/colaboradores', {credentials:'include'});
            if (r.ok) { const d = await r.json(); colabs = d.data || d || []; }
        } catch {}

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;';
        overlay.innerHTML = `
          <div style="background:#fff;border-radius:14px;padding:20px;width:100%;max-width:560px;margin:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
              <div style="font-weight:800;font-size:16px">\u{1F464} Selecionar Colaborador</div>
              <button id="ckl-sel-fechar" style="background:#f0f0f0;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:16px">✕</button>
            </div>
            <input type="text" id="ckl-sel-busca" placeholder="🔍 Buscar por nome ou cargo..."
              style="width:100%;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;margin-bottom:12px">
            <div id="ckl-sel-lista" style="max-height:55vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px">
              ${colabs.length === 0
                ? '<div style="text-align:center;padding:24px;color:#999;font-size:14px">Nenhum colaborador</div>'
                : colabs.map(c => `
                  <div class="ckl-sel-item"
                    data-cpf="${c.cpf||''}" data-nome="${c.nome}"
                    data-cargo="${c.cargo||''}" data-mat="${c.matricula||''}"
                    style="display:flex;align-items:center;gap:10px;padding:10px 12px;
                           border-radius:8px;cursor:pointer;border:1.5px solid #eee;background:#fff">
                    <div style="width:38px;height:38px;background:#E8500A;border-radius:50%;
                                display:flex;align-items:center;justify-content:center;
                                font-weight:800;color:#fff;font-size:13px;flex-shrink:0">
                      ${c.nome.split(' ').map(p=>p[0]||'').join('').substring(0,2).toUpperCase()}
                    </div>
                    <div style="flex:1;min-width:0">
                      <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.nome}</div>
                      <div style="font-size:11px;color:#888">${c.cargo||''}</div>
                    </div>
                    <div style="font-size:12px;color:#E8500A;font-weight:700">Selecionar →</div>
                  </div>`).join('')}
            </div>
          </div>`;

        document.body.appendChild(overlay);
        const fechar = () => overlay.remove();
        overlay.querySelector('#ckl-sel-fechar').onclick = fechar;
        overlay.onclick = e => { if (e.target === overlay) fechar(); };

        overlay.querySelector('#ckl-sel-busca').addEventListener('input', function() {
            const q = this.value.toLowerCase();
            overlay.querySelectorAll('.ckl-sel-item').forEach(el => {
                const txt = (el.dataset.nome+' '+el.dataset.cargo).toLowerCase();
                el.style.display = txt.includes(q) ? '' : 'none';
            });
        });

        overlay.querySelectorAll('.ckl-sel-item').forEach(el => {
            el.addEventListener('mouseover', () => { el.style.background='#FFF0E8'; el.style.borderColor='#E8500A'; });
            el.addEventListener('mouseout',  () => { el.style.background='#fff'; el.style.borderColor='#eee'; });
            el.onclick = () => {
                colaboradorSelecionado = {
                    nome:      el.dataset.nome,
                    cargo:     el.dataset.cargo,
                    matricula: el.dataset.mat,
                    cpf:       el.dataset.cpf,
                };
                const n = document.getElementById('ckcab-colaborador_nome');
                const f = document.getElementById('ckcab-colaborador_funcao');
                const m = document.getElementById('ckcab-matricula');
                if (n) n.value = colaboradorSelecionado.nome;
                if (f) f.value = colaboradorSelecionado.cargo;
                if (m) m.value = colaboradorSelecionado.matricula;
                const label = document.getElementById('ckl-colab-label');
                if (label) label.textContent = colaboradorSelecionado.nome +
                    (colaboradorSelecionado.cargo ? ' · '+colaboradorSelecionado.cargo : '');
                const btn = document.getElementById('ckl-btn-sel-colab');
                if (btn) {
                    btn.style.borderStyle = 'solid';
                    btn.style.borderColor = '#1A7A3C';
                    btn.style.background  = '#E8F5EE';
                    btn.style.color       = '#1A7A3C';
                }
                fechar();
                toast('✅ ' + colaboradorSelecionado.nome);
            };
        });

        setTimeout(() => overlay.querySelector('#ckl-sel-busca')?.focus(), 100);
    }

    // ── fotos ───────────────────────────────────────────────────────────────
    function adicionarThumb(base64, foto_id) {
        const wrap = document.getElementById('ckl-fotos-preview');
        if (!wrap) return;
        const div = document.createElement('div');
        div.className = 'ckl-foto-thumb';
        div.dataset.fotoId = foto_id;
        div.innerHTML = `<img src="${base64}">
          <button class="ckl-foto-del" title="Remover">✕</button>`;
        div.querySelector('.ckl-foto-del').onclick = () => removerFoto(foto_id, div);
        wrap.appendChild(div);
    }

    async function removerFoto(foto_id, divEl) {
        const item = itensTodos[itemIdx];
        if (!item || !respostas[item.id]?.foto_ids) return;
        // Remover do IDB
        await deletarFotoIDB(foto_id).catch(() => {});
        // Remover da lista de IDs
        respostas[item.id].foto_ids = respostas[item.id].foto_ids.filter(id => id !== foto_id);
        // Remover do DOM
        divEl?.remove();
        atualizarContadorFoto(item.id);
    }

    function atualizarContadorFoto(itemId) {
        const qtd = respostas[itemId]?.foto_ids?.length || 0;
        const btn = document.getElementById('ckl-foto-btn');
        if (btn) btn.textContent = qtd > 0 ? `📷 ${qtd} foto${qtd>1?'s':''} adicionada${qtd>1?'s':''} · Adicionar mais` : '📷 Adicionar foto';
    }

    // ── IndexedDB para fotos (sem limite de 5MB do localStorage) ──────────
    const IDB_NAME    = 'sesmt_cklan_fotos';
    const IDB_VERSION = 1;

    function abrirFotoDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('fotos')) {
                    const s = db.createObjectStore('fotos', { keyPath: 'foto_id' });
                    s.createIndex('prench_local_id', 'prench_local_id', { unique: false });
                    s.createIndex('item_id', 'item_id', { unique: false });
                }
            };
            req.onsuccess = e => resolve(e.target.result);
            req.onerror   = e => reject(e.target.error);
        });
    }

    async function salvarFotoIDB(prenchLocalId, itemId, base64, idx) {
        const db = await abrirFotoDB();
        const foto_id = `cklan_${prenchLocalId}_${itemId}_${idx}`;
        return new Promise((resolve, reject) => {
            const tx  = db.transaction('fotos', 'readwrite');
            const req = tx.objectStore('fotos').put({
                foto_id, prench_local_id: prenchLocalId,
                item_id: itemId, base64,
                created_at: new Date().toISOString(),
            });
            req.onsuccess = () => resolve(foto_id);
            req.onerror   = e => reject(e.target.error);
        });
    }

    async function listarFotosIDB(prenchLocalId) {
        const db = await abrirFotoDB();
        return new Promise((resolve, reject) => {
            const tx    = db.transaction('fotos', 'readonly');
            const idx   = tx.objectStore('fotos').index('prench_local_id');
            const req   = idx.getAll(prenchLocalId);
            req.onsuccess = e => resolve(e.target.result);
            req.onerror   = e => reject(e.target.error);
        });
    }

    async function deletarFotoIDB(foto_id) {
        const db = await abrirFotoDB();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction('fotos', 'readwrite');
            const req = tx.objectStore('fotos').delete(foto_id);
            req.onsuccess = () => resolve();
            req.onerror   = e => reject(e.target.error);
        });
    }

    async function deletarFotosPreenchimentoIDB(prenchLocalId) {
        const fotos = await listarFotosIDB(prenchLocalId);
        for (const f of fotos) await deletarFotoIDB(f.foto_id);
    }

    function comprimirImagem(file, maxDim, quality) {
        return new Promise(resolve => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                let w = img.width, h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                    else       { w = Math.round(w * maxDim / h); h = maxDim; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = url;
        });
    }

    function bindFotoInput() {
        const inp = document.getElementById('ckl-foto-inp');
        const btn = document.getElementById('ckl-foto-btn');
        if (!inp || !btn) return;
        btn.onclick = () => inp.click();
        inp.onchange = async () => {
            const item = itensTodos[itemIdx];
            if (!item) return;
            if (!respostas[item.id]) respostas[item.id] = {};
            if (!respostas[item.id].foto_ids) respostas[item.id].foto_ids = [];

            // Usar o local_id do preenchimento como chave (gerado ao iniciar)
            const prenchLocalId = payloadLocalId;

            for (const file of Array.from(inp.files)) {
                const b64 = await comprimirImagem(file, 1200, 0.75);
                const idx  = respostas[item.id].foto_ids.length;
                const fid  = await salvarFotoIDB(prenchLocalId, item.id, b64, idx);
                respostas[item.id].foto_ids.push(fid);
                adicionarThumb(b64, fid);
            }
            inp.value = '';
            atualizarContadorFoto(item.id);
        };
    }

    document.getElementById('ckl-back-cab').onclick  = () => { resetar(); tela('#ckl-t1'); };
    document.getElementById('ckl-btn-iniciar').onclick = iniciarChecklist;
    document.getElementById('ckl-back-item').onclick = voltarItem;
    document.getElementById('ckl-btn-ant').onclick   = voltarItem;
    document.getElementById('ckl-btn-pular').onclick  = () => { salvarObs(); itemIdx++; renderItem(); };
    document.getElementById('ckl-q-menos').onclick   = () => {
        const item=itensTodos[itemIdx];
        if(!respostas[item.id])respostas[item.id]={};
        respostas[item.id].quant=Math.max(0,(respostas[item.id].quant??0)-1);
        document.getElementById('ckl-q-val').textContent=respostas[item.id].quant;
    };
    document.getElementById('ckl-q-mais').onclick    = () => {
        const item=itensTodos[itemIdx];
        if(!respostas[item.id])respostas[item.id]={};
        respostas[item.id].quant=(respostas[item.id].quant??0)+1;
        document.getElementById('ckl-q-val').textContent=respostas[item.id].quant;
    };
    document.getElementById('ckl-obs-toggle').onclick = () => {
        const inp=document.getElementById('ckl-obs-inp');
        inp.classList.add('vis');
        document.getElementById('ckl-obs-toggle').style.display='none';
        inp.focus();
    };
    document.getElementById('ckl-rb-conf').onclick = () => setResultado('CONFORME');
    document.getElementById('ckl-rb-nc').onclick   = () => setResultado('NÃO CONFORME');
    document.getElementById('ckl-btn-enviar').onclick = enviarChecklist;

    window.addEventListener('online',  () => { isOffline=false; sincronizarPendentes(); });
    window.addEventListener('offline', () => { isOffline=true; });

    // ── iniciar ──────────────────────────────────────────────────────────
    fetch('/api/me', {credentials:'include'})
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.data) usuarioMe = d.data; })
        .catch(() => {});

    carregarModelos();
    if (navigator.onLine) { sincronizarPendentes(); carregarHistorico(); }
}
