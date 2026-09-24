// ── Toast ──────────────────────────────────────────────────────
export function toast(msg, tipo = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, 3500);
}

// ── Loading overlay ────────────────────────────────────────────
export function loading(show) {
    let el = document.getElementById('loading-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'loading-overlay';
        el.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(el);
    }
    el.style.display = show ? 'flex' : 'none';
}

// ── Confirm modal ──────────────────────────────────────────────
export function confirm(msg) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-box">
                <p>${msg}</p>
                <div class="modal-btns">
                    <button class="btn btn-danger" id="mc-sim">Confirmar</button>
                    <button class="btn btn-outline" id="mc-nao">Cancelar</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#mc-sim').onclick = () => { overlay.remove(); resolve(true); };
        overlay.querySelector('#mc-nao').onclick = () => { overlay.remove(); resolve(false); };
        overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
    });
}

// ── Paginação ──────────────────────────────────────────────────
export function renderPaginacao(container, total, page, perPage, onChange) {
    const totalPages = Math.ceil(total / perPage);
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    const btns = [];
    for (let i = 1; i <= totalPages; i++) {
        btns.push(`<button class="pg-btn ${i === page ? 'active' : ''}" data-p="${i}">${i}</button>`);
    }
    container.innerHTML = btns.join('');
    container.querySelectorAll('.pg-btn').forEach(b =>
        b.addEventListener('click', () => onChange(parseInt(b.dataset.p)))
    );
}

// ── Formatação ─────────────────────────────────────────────────
export const fmt = {
    data:    s => s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR') : '—',
    datahora:s => s ? new Date(s).toLocaleString('pt-BR') : '—',
    pct:     n => n != null ? (+n).toFixed(1) + '%' : '—',
    decimal: n => n != null ? (+n).toFixed(4) : '—',
    num:     n => n != null ? (+n).toLocaleString('pt-BR') : '—',
};

// ── Badge gravidade / status ───────────────────────────────────
export function badgeGrav(g) {
    const map = {
        'BAIXA': 'badge-baixa',
        'MÉDIA': 'badge-media',
        'ALTA':  'badge-alta',
        'CRÍTICA':'badge-critica'
    };
    return `<span class="badge ${map[g] || ''}">${g}</span>`;
}

export function badgeSt(s) {
    const map = {
        'ABERTA':                'badge-aberta',
        'EM TRATATIVA':          'badge-tratativa',
        'AGUARDANDO EVIDÊNCIA':  'badge-aguardando',
        'ENCERRADA':             'badge-encerrada',
        'REALIZADA':             'badge-realizada'
    };
    return `<span class="badge ${map[s] || ''}">${s}</span>`;
}

export function badgeTipo(t) {
    const map = {
        'Cliente':        'badge-cliente',
        'Interno':     'badge-interno',
        'Comunidade':  'badge-comunidade',
        'Treinamento': 'badge-treinamento',
        'Outro':       'badge-outro',
    };
    return `<span class="badge ${map[t] || 'badge-outro'}">${t}</span>`;
}

// ── Preencher <select> dinamicamente ──────────────────────────
export function fillSelect(sel, itens, valField, labelField, placeholder = '— Todos —') {
    sel.innerHTML = `<option value="">${placeholder}</option>` +
        itens.map(i => `<option value="${i[valField]}">${i[labelField]}</option>`).join('');
}

// ── Ler valores de form como objeto ───────────────────────────
export function formData(formEl) {
    const obj = {};
    new FormData(formEl).forEach((v, k) => {
        obj[k] = v === '' ? null : v;
    });
    formEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
        obj[cb.name] = cb.checked;
    });
    return obj;
}

// ── Dias para vencimento ───────────────────────────────────────
export function diasPrazo(dias) {
    if (dias == null) return '—';
    if (dias < 0) return `<span style="color:var(--vermelho);font-weight:700">${Math.abs(dias)}d vencida</span>`;
    if (dias === 0) return `<span style="color:var(--vermelho);font-weight:700">Vence hoje</span>`;
    if (dias <= 7) return `<span style="color:var(--amarelo);font-weight:600">${dias}d</span>`;
    return `<span style="color:var(--cinza4)">${dias}d</span>`;
}
