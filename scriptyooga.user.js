// ==UserScript==
// @name         Confirmar Pedido Yooga - V89.0 (Estabilização iPhone Moderno)
// @version      89.0
// @description  Correção para travamentos e sumiço de pedidos em iPhones modernos (WebKit Engine Fix).
// @author       Mateus / Ajustes Estabilidade
// @match        *://app.yooga.com.br/*
// @match        *://confirmacao-entrega-propria.ifood.com.br/*
// @updateURL    https://raw.githubusercontent.com/mateus0855/Scripityoogaandoid/main/scriptyooga.meta.js
// @downloadURL  https://raw.githubusercontent.com/mateus0855/Scripityoogaandoid/main/scriptyooga.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const URL_MESAS_YOOGA = "https://app.yooga.com.br/mesas/delivery";
    const SENHA_MATEUS = "Theus@2806";

    let rotaAtivaFiltro = localStorage.getItem('ultimaRotaYooga') || "TODOS";
    let ultimasRotasDetectadas = "";
    let printPedidosDoDia = [];

    // Seletores otimizados e mais tolerantes a mudanças do framework
    const SELETOR_FILTRO_NATIVO = "order-manager-component select, .inputs .filter select";
    const SELETOR_BOTOES_REMOVER = "delivery-actions-bar .button-group";
    const SELETOR_INTEGRATION_PILLS = "integration-pills";
    const SELETOR_BOTAO_ACEITAR = "order-manager-component .accept";
    const SELETOR_CONTAINER_LISTA = "order-manager-component .left .content";

    const isYoogaHost = window.location.hostname === "app.yooga.com.br";
    const isIfoodHost = window.location.hostname.includes("ifood.com.br");

    const ESTILO_FIX_ROLAGEM = `
        ${SELETOR_CONTAINER_LISTA} {
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            overscroll-behavior-y: contain !important;
            padding-bottom: 40px !important;
            box-sizing: border-box !important;
        }
        delivery-order:last-child {
            display: block !important;
            margin-bottom: 40px !important;
        }
        .yooga-hidden-pedido-final {
            display: block !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            min-height: 220px !important;
        }
    `;

    function agendarLoop(fn, delay) {
        setTimeout(() => {
            try { fn(); } catch(e) { console.error("Erro no loop script: ", e); }
            agendarLoop(fn, delay);
        }, delay);
    }

    function aplicarFixRolagem() {
        if (!isYoogaHost) return;
        if (!document.getElementById('yooga-fix-scroll')) {
            const style = document.createElement('style');
            style.id = 'yooga-fix-scroll';
            style.textContent = ESTILO_FIX_ROLAGEM;
            document.head.appendChild(style);
        }
    }

    function executarRemocaoVisual() {
        if (!isYoogaHost) return;
        const grupoBotoes = document.querySelector(SELETOR_BOTOES_REMOVER);
        if (grupoBotoes) grupoBotoes.remove();

        const integrationPills = document.querySelector(SELETOR_INTEGRATION_PILLS);
        if (integrationPills) integrationPills.remove();

        const botaoAceitar = document.querySelector(SELETOR_BOTAO_ACEITAR);
        if (botaoAceitar) {
            const pai = botaoAceitar.parentElement;
            botaoAceitar.remove();
            if (pai && pai.children.length === 0) pai.remove();
        }
    }

    function executarSegurancaEntregador() {
        if (!isYoogaHost) return;
        const selectEntregador = document.querySelector('select[formcontrolname="deliveryman"]') || document.querySelector('select.ng-valid.ng-dirty');
        const btnFiltrar = document.querySelector('.yooga-button-style.fill-primary') || document.querySelector('button.fill-primary');

        if (selectEntregador && btnFiltrar) {
            const nomeSelecionado = selectEntregador.options[selectEntregador.selectedIndex]?.text || "";
            if (nomeSelecionado.trim() === "Mateus" && btnFiltrar.dataset.desbloqueado !== "true") {
                btnFiltrar.style.backgroundColor = "gray";
                btnFiltrar.style.pointerEvents = "none";
                btnFiltrar.style.opacity = "0.5";

                const senha = prompt("⚠️ MATEUS SELECIONADO\nDigite a senha:");
                if (senha === SENHA_MATEUS) {
                    btnFiltrar.dataset.desbloqueado = "true";
                    btnFiltrar.style.backgroundColor = "";
                    btnFiltrar.style.pointerEvents = "auto";
                    btnFiltrar.style.opacity = "1";
                } else {
                    alert("❌ Senha Incorreta!");
                    selectEntregador.selectedIndex = 0;
                    btnFiltrar.style.backgroundColor = "";
                    btnFiltrar.style.pointerEvents = "auto";
                    btnFiltrar.style.opacity = "1";
                }
            } else if (nomeSelecionado.trim() !== "Mateus") {
                btnFiltrar.dataset.desbloqueado = "false";
                btnFiltrar.style.backgroundColor = "";
                btnFiltrar.style.pointerEvents = "auto";
                btnFiltrar.style.opacity = "1";
            }
        }
    }

    function executarBotaoIfood() {
        if (!isYoogaHost || !window.location.href.includes("/delivery")) return;
        if (!document.getElementById("btn-confirmar-yooga")) {
            let tel = document.querySelector(".cliente-telefone") || document.querySelector(".customer-phone") || document.querySelector(".text-bold.m-0");
            const num = tel ? tel.innerText.replace(/\D/g, '') : "";
            if (num.startsWith("0800") || num.length >= 8) { 
                const ref = document.querySelector("p.entregar-em") || document.querySelector(".delivery-info");
                if (ref) {
                    const btn = document.createElement("div");
                    btn.id = "btn-confirmar-yooga";
                    btn.innerText = "CONFIRMAR IFOOD";
                    btn.style = "background-color: #add8e6; color: #000; padding: 12px; border-radius: 8px; text-align: center; cursor: pointer; font-weight: bold; font-size: 14px; display: inline-block; border: 1px solid #90cbdc; margin-bottom: 10px; width: 100%; box-sizing: border-box;";
                    btn.onclick = () => { window.location.href = "https://confirmacao-entrega-propria.ifood.com.br/numero-pedido?cod=" + num.slice(-8); };
                    ref.insertAdjacentElement('beforebegin', btn);
                }
            }
        }
    }

    function executarAutomacaoIfood() {
        if (!isIfoodHost) return;
        const d1 = document.querySelector('[aria-label*="Digit 1"]');
        const cod = new URLSearchParams(window.location.search).get('cod');
        if (d1 && cod) {
            window.history.replaceState({}, document.title, window.location.pathname);
            cod.split('').forEach((n, i) => {
                setTimeout(() => {
                    const c = document.querySelector(`[aria-label*="Digit ${i + 1}"]`);
                    if (c) { c.focus(); c.click(); document.execCommand('insertText', false, n); c.dispatchEvent(new Event('input', { bubbles: true })); }
                    if (i === 7) setTimeout(() => { const b = document.querySelector(".kLtoWA.hsczDC, button[type='submit']"); if (b) b.click(); }, 600);
                }, i * 100);
            });
        }
        const okBtn = Array.from(document.querySelectorAll(".kLtoWA.hsczDC, button")).find(b => b.innerText.toLowerCase().includes("entendi"));
        if (okBtn) { okBtn.click(); setTimeout(() => { window.location.href = URL_MESAS_YOOGA; }, 800); }
    }

    function simularPedidoOcultoNoFinal() {
        if (!isYoogaHost) return;
        const containerLista = document.querySelector(SELETOR_CONTAINER_LISTA);
        if (!containerLista) return;

        let placeholder = containerLista.querySelector('.yooga-hidden-pedido-final');
        if (!placeholder) {
            placeholder = document.createElement('delivery-order');
            placeholder.className = 'yooga-hidden-pedido-final';
            placeholder.setAttribute('aria-hidden', 'true');
            placeholder.setAttribute('data-yooga-hidden-final', 'true');
            containerLista.appendChild(placeholder);
        }
    }

    function executarProcessamentoPedidos() {
        if (!isYoogaHost) return;

        const selectFiltro = document.querySelector(SELETOR_FILTRO_NATIVO);
        const cardsPedidos = document.querySelectorAll('delivery-order:not(.yooga-hidden-pedido-final)');

        // Se o componente nativo do Yooga ainda não carregou os pedidos originais, aborta para não quebrar a página
        if (!selectFiltro || cardsPedidos.length === 0) return;

        simularPedidoOcultoNoFinal();

        // Limpeza segura: apenas remove opções velhas injetadas anteriormente, nunca os elementos nativos do app
        if (!selectFiltro.dataset.limpoNativo) {
            const opcoes = selectFiltro.querySelectorAll('option');
            opcoes.forEach((opt, idx) => {
                if (idx >= 3 && idx <= 9) opt.remove(); // Remove apenas o range de lixo nativo original uma vez
            });
            selectFiltro.dataset.limpoNativo = "true";
        }

        let rotasEncontradas = new Set();
        let listaTemporariaParaPrint = [];

        cardsPedidos.forEach(card => {
            const badgeSpan = card.querySelector('.badge-neutral span') || card.querySelector('[class*="badge"]') || card;
            const textoCard = badgeSpan.innerText || "";
            let rotaDoCard = "SEM_ROTA";

            if (textoCard.includes('Rota')) {
                const match = textoCard.match(/Rota\s+([A-Z0-9]+)/i);
                if (match && match[1]) {
                    rotaDoCard = match[1].toUpperCase();
                    rotasEncontradas.add(rotaDoCard);
                }
            }

            listaTemporariaParaPrint.push({ elemento: card, rota: rotaDoCard });
        });

        let rotaSalvaValida = localStorage.getItem('ultimaRotaYooga') || "TODOS";
        if (rotaSalvaValida !== "TODOS" && rotasEncontradas.size > 0 && !rotasEncontradas.has(rotaSalvaValida)) {
            localStorage.removeItem('ultimaRotaYooga');
            rotaAtivaFiltro = "TODOS";
            rotaSalvaValida = "TODOS";
        }

        if (rotaAtivaFiltro === "TODOS" || printPedidosDoDia.length === 0) {
            if (listaTemporariaParaPrint.length > 0) printPedidosDoDia = listaTemporariaParaPrint;
        }

        const assinaturaRotasAtuais = Array.from(rotasEncontradas).sort().join(',');

        if (assinaturaRotasAtuais !== ultimasRotasDetectadas) {
            ultimasRotasDetectadas = assinaturaRotasAtuais; // CORREÇÃO AQUI: Atribuição direta da string de comparação

            selectFiltro.querySelectorAll('option.rota-injetada').forEach(opt => opt.remove());

            rotasEncontradas.forEach(letra => {
                const novaOpcao = document.createElement('option');
                novaOpcao.value = "OPEN";
                novaOpcao.textContent = `Rota ${letra}`;
                novaOpcao.className = 'rota-injetada';
                selectFiltro.appendChild(novaOpcao);
            });

            let textoParaProcurar = rotaSalvaValida === "TODOS" ? "" : `Rota ${rotaSalvaValida}`;
            if (textoParaProcurar) {
                Array.from(selectFiltro.options).forEach((opt, idx) => {
                    if (opt.text.trim() === textoParaProcurar.trim()) selectFiltro.selectedIndex = idx;
                });
            } else {
                if(selectFiltro.options[selectFiltro.selectedIndex]?.text.includes("Rota")) selectFiltro.selectedIndex = 0;
            }
        }

        if (!selectFiltro.dataset.escutandoRotas) {
            selectFiltro.dataset.escutandoRotas = "true";
            const gerenciarTrocaDeFiltro = (e) => {
                const textoSelecionado = e.target.options[e.target.selectedIndex]?.text || "";
                if (textoSelecionado.includes("Rota ")) {
                    rotaAtivaFiltro = textoSelecionado.replace("Rota ", "").trim();
                    localStorage.setItem('ultimaRotaYooga', rotaAtivaFiltro);
                } else {
                    rotaAtivaFiltro = "TODOS";
                    localStorage.removeItem('ultimaRotaYooga');
                }
                atualizarVisualizacaoCardsBaseadoNoPrint();
            };

            selectFiltro.addEventListener('change', gerenciarTrocaDeFiltro);
        }

        atualizarVisualizacaoCardsBaseadoNoPrint();
    }

    function atualizarVisualizacaoCardsBaseadoNoPrint() {
        const rotaFiltroDefinitiva = localStorage.getItem('ultimaRotaYooga') || "TODOS";
        if (printPedidosDoDia.length === 0) return;

        printPedidosDoDia.forEach(pedido => {
            if (pedido.elemento && pedido.elemento.isConnected) { // Verifica se o elemento ainda existe fisicamente no DOM
                if (rotaFiltroDefinitiva === "TODOS") {
                    pedido.elemento.style.setProperty('display', 'block', 'important');
                } else {
                    if (pedido.rota === rotaFiltroDefinitiva) {
                        pedido.elemento.style.setProperty('display', 'block', 'important');
                    } else {
                        pedido.elemento.style.setProperty('display', 'none', 'important');
                    }
                }
            }
        });
    }

    function inicializarAutomacoes() {
        if (isYoogaHost) {
            aplicarFixRolagem();
            agendarLoop(executarRemocaoVisual, 1500);
            agendarLoop(executarSegurancaEntregador, 2500);
            agendarLoop(executarBotaoIfood, 2000);
            agendarLoop(executarProcessamentoPedidos, 3000); // Reduzido ligeiramente para dar agilidade sem travar
        }
        if (isIfoodHost) {
            agendarLoop(executarAutomacaoIfood, 1000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarAutomacoes, { once: true });
    } else {
        inicializarAutomacoes();
    }
})();
