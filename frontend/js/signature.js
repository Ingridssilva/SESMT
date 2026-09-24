/**
 * signature.js — Canvas de Assinatura Digital
 * SESMT Empresa Exemplo
 *
 * Uso:
 *   import { criarPainelAssinatura } from '../js/signature.js';
 *
 *   const painel = criarPainelAssinatura({
 *     titulo: 'Assinatura do Inspetor',
 *     subtitulo: 'João da Silva — Técnico de Segurança',
 *     onSave: (base64PNG) => { ... }
 *   });
 *   container.appendChild(painel);
 */

export function criarPainelAssinatura({ titulo, subtitulo = '', onSave, obrigatorio = true }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'assinatura-painel';
    wrapper.style.cssText = `
        border: 1.5px solid var(--cinza2);
        border-radius: 10px;
        padding: 16px;
        background: var(--branco);
        margin-bottom: 12px;
    `;

    wrapper.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div>
                <div style="font-size:11px;font-weight:700;color:var(--cinza4);
                            text-transform:uppercase;letter-spacing:.05em">
                    ${titulo}${obrigatorio ? ' <span style="color:var(--vermelho)">*</span>' : ''}
                </div>
                ${subtitulo ? `<div style="font-size:12px;color:var(--cinza3);margin-top:2px">${subtitulo}</div>` : ''}
            </div>
            <div style="display:flex;gap:6px">
                <button type="button" class="btn-limpar-sig btn btn-outline btn-sm">🗑 Limpar</button>
                <div class="sig-status" style="font-size:11px;color:var(--cinza3);
                     display:flex;align-items:center;gap:4px;padding:4px 8px"></div>
            </div>
        </div>
        <canvas class="sig-canvas" style="
            width:100%;height:160px;
            border:1.5px dashed var(--cinza2);
            border-radius:8px;
            cursor:crosshair;
            background:#FAFAFA;
            touch-action:none;
            display:block;
        "></canvas>
        <div class="sig-hint" style="font-size:11px;color:var(--cinza3);margin-top:6px;text-align:center">
            ✍️ Assine acima com o dedo ou mouse
        </div>
    `;

    const canvas  = wrapper.querySelector('.sig-canvas');
    const status  = wrapper.querySelector('.sig-status');
    const hint    = wrapper.querySelector('.sig-hint');
    const btnLimpar = wrapper.querySelector('.btn-limpar-sig');

    // Ajustar resolução do canvas para DPI correto
    function ajustarCanvas() {
        const dpr  = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width  = rect.width  * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth   = 2.5;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
    }

    let desenhando  = false;
    let temAssinatura = false;
    let ultimoX = 0, ultimoY = 0;

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const src  = e.touches ? e.touches[0] : e;
        return {
            x: src.clientX - rect.left,
            y: src.clientY - rect.top,
        };
    }

    function iniciar(e) {
        e.preventDefault();
        desenhando = true;
        const { x, y } = getPos(e);
        ultimoX = x; ultimoY = y;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    function desenhar(e) {
        if (!desenhando) return;
        e.preventDefault();
        const { x, y } = getPos(e);
        const ctx = canvas.getContext('2d');
        ctx.lineTo(x, y);
        ctx.stroke();
        ultimoX = x; ultimoY = y;
        temAssinatura = true;

        // Mostrar status
        hint.style.display = 'none';
        status.innerHTML = '✅ <span style="color:var(--verde);font-weight:600">Assinado</span>';
        wrapper.style.borderColor = 'var(--verde)';
        canvas.style.borderColor  = 'var(--verde)';
        canvas.style.background   = '#F0FFF8';
    }

    function parar(e) {
        if (!desenhando) return;
        desenhando = false;
        // Salvar assinatura
        if (temAssinatura && onSave) {
            const png = canvas.toDataURL('image/png');
            onSave(png);
        }
    }

    // Mouse
    canvas.addEventListener('mousedown',  iniciar);
    canvas.addEventListener('mousemove',  desenhar);
    canvas.addEventListener('mouseup',    parar);
    canvas.addEventListener('mouseleave', parar);

    // Touch (mobile)
    canvas.addEventListener('touchstart', iniciar,  { passive: false });
    canvas.addEventListener('touchmove',  desenhar, { passive: false });
    canvas.addEventListener('touchend',   parar);

    // Limpar
    btnLimpar.addEventListener('click', () => {
        const ctx = canvas.getContext('2d');
        ajustarCanvas(); // re-scale
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        temAssinatura = false;
        hint.style.display = '';
        status.innerHTML   = '';
        wrapper.style.borderColor = 'var(--cinza2)';
        canvas.style.borderColor  = 'var(--cinza2)';
        canvas.style.background   = '#FAFAFA';
        if (onSave) onSave(null);
    });

    // Ajustar ao montar
    requestAnimationFrame(() => ajustarCanvas());
    window.addEventListener('resize', ajustarCanvas);

    // API pública
    wrapper.getBase64 = () => temAssinatura ? canvas.toDataURL('image/png') : null;
    wrapper.temAssinatura = () => temAssinatura;
    wrapper.setSubtitulo = (txt) => {
        const el = wrapper.querySelector('.sig-status');
        if (el) el.textContent = txt;
    };

    return wrapper;
}


/**
 * criarModalAssinatura — abre modal com dois painéis de assinatura
 * (inspetor + avaliado) e retorna Promise com { assinatura_inspetor, assinatura_avaliado }
 */
export function criarModalAssinatura({ nomeInspetor = '', nomeAvaliado = '' } = {}) {
    return new Promise((resolve, reject) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.alignItems = 'flex-start';
        overlay.style.paddingTop = '40px';
        overlay.style.overflowY  = 'auto';

        overlay.innerHTML = `
        <div style="
            background:#fff; border-radius:14px; padding:28px 28px 20px;
            width:100%; max-width:560px; margin:auto;
            box-shadow:0 20px 60px rgba(0,0,0,.25);
        ">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
                <div style="font-size:16px;font-weight:800;color:var(--preto)">✍️ Assinaturas</div>
                <button id="fechar-sig" class="btn btn-outline btn-sm">✕</button>
            </div>

            <div id="painel-inspetor"></div>
            <div id="painel-avaliado"></div>

            <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">
                <button id="btn-cancelar-sig" class="btn btn-outline">Cancelar</button>
                <button id="btn-confirmar-sig" class="btn btn-primary">✅ Confirmar Assinaturas</button>
            </div>

            <div id="sig-erro" style="display:none;margin-top:12px;
                 background:rgba(192,57,43,.1);border-radius:8px;padding:10px;
                 font-size:12px;color:var(--vermelho)"></div>
        </div>`;

        document.body.appendChild(overlay);

        // Criar painéis
        let sigInspetor = null, sigAvaliado = null;

        const pInspetor = criarPainelAssinatura({
            titulo:    'Assinatura do Inspetor / SESMT',
            subtitulo: nomeInspetor,
            onSave:    b64 => { sigInspetor = b64; },
        });

        const pAvaliado = criarPainelAssinatura({
            titulo:    'Assinatura do Colaborador Avaliado',
            subtitulo: nomeAvaliado,
            onSave:    b64 => { sigAvaliado = b64; },
        });

        overlay.querySelector('#painel-inspetor').appendChild(pInspetor);
        overlay.querySelector('#painel-avaliado').appendChild(pAvaliado);

        const fechar = () => { overlay.remove(); };

        overlay.querySelector('#fechar-sig').onclick      = () => { fechar(); reject('cancelado'); };
        overlay.querySelector('#btn-cancelar-sig').onclick = () => { fechar(); reject('cancelado'); };

        overlay.querySelector('#btn-confirmar-sig').onclick = () => {
            const err = overlay.querySelector('#sig-erro');

            // Validar — pelo menos o inspetor deve assinar
            if (!pInspetor.temAssinatura()) {
                err.textContent = 'A assinatura do inspetor é obrigatória.';
                err.style.display = 'block';
                return;
            }

            fechar();
            resolve({
                assinatura_inspetor: pInspetor.getBase64(),
                assinatura_avaliado: pAvaliado.getBase64(),
            });
        };
    });
}
