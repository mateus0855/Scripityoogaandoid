// ==UserScript==
// @name         Confirmar Pedido Yooga - V110
// @version      110
// @description  Correção na validação do prompt: cancelar ação não exibe mais mensagem de senha incorreta.
// @author       Mateus
// @match        *://app.yooga.com.br/*
// @match        *://confirmacao-entrega-propria.ifood.com.br/*
// @match        *://food-b-h5.99app.com/*
// @updateURL    https://raw.githubusercontent.com/mateus0855/Scripityoogaandoid/main/scriptyooga.meta.js
// @downloadURL  https://raw.githubusercontent.com/mateus0855/Scripityoogaandoid/main/scriptyooga.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const URL_MESAS_YOOGA = "https://app.yooga.com.br/mesas/delivery";

    // Mapa de entregadores e suas respectivas senhas
    const SENHAS_ENTREGADORES = {
        "Mateus": "Theus@2806",
        "Entregador Diarista": "Theus@2806",
        "Entregador Diarista 2": "Theus@2806",
        "Guilherme": "995406634",
        "Pedro Augusto Alves Lima costa": "ukm0b32",
        "Geovane": "94380508"
    };

    // Recupera a última rota salva no navegador. Se não existir, o padrão é "TODOS".
    let rotaAtivaFiltro = localStorage.getItem('ultimaRotaYooga') || "TODOS";
    let ultimasRotasDetectadas = "";

    // O nosso "print" na memória: guarda a referência dos elementos físicos e suas rotas
    let printPedidosDoDia = [];

    // Seletores
    const SELETOR_FILTRO_NATIVO = "body > app-root > ion-app > ion-router-outlet > app-navigation > ion-tabs > div > ion-router-outlet > order-manager > order-manager-component > div > div.left > div.content > div:nth-child(2) > div.bottom > div.inputs > div.filter > select";
    const SELETOR_BOTOES_REMOVER = "body > app-root > ion-app > ion-router-outlet > app-navigation > ion-tabs > div > ion-router-outlet > order-manager > order-manager-component > div > div.left > div.content > div:nth-child(2) > delivery-actions-bar > div > div.button-parent > div.button-group";
    const SELETOR_INTEGRATION_PILLS = "body > app-root > ion-app > ion-router-outlet > app-navigation > ion-tabs > div > ion-router-outlet > order-manager > order-manager-component > div > div.left > div.content > div:nth-child(2) > div.bottom > integration-pills";
    const SELETOR_BOTAO_ACEITAR = "body > app-root > ion-app > ion-router-outlet > app-navigation > ion-tabs > div > ion-router-outlet > order-manager > order-manager-component > div > div.left > div.accept";

    const URL_CONFIRMACAO_99 = "https://food-b-h5.99app.com/pt-BR/v2/confirmacao-entrega";
    const SELETOR_IMG_99 = "#shepherd-delivery-mocked-order > delivery-order:nth-child(1) > div > div.top > div.left-side > img";
    const SELETOR_INPUT_99 = "#app > div > div.page-container > div.input-section > div > div:nth-child(1) > input[type=text]";
    const SELETOR_YOOGA_CONFIRMAR = "body > app-root > ion-app > ion-router-outlet > app-navigation > ion-tabs > div > ion-router-outlet > order-manager > order-manager-component > div > div.right > app-ver-pedido-component > app-actions-section > ion-footer > div > div.ion-text-right.right-grid > yoo-button.button-emphasis.button-success.button-medium.button-base";
    const SELETOR_YOOGA_FINALIZAR = "#shepherd-delivery-confirm-finish-order > div.button-group.mt-6 > ion-button.md.button.button-solid.ion-activatable.ion-focusable.hydrated";
    const is99Host = window.location.hostname === "food-b-h5.99app.com";
    const isYoogaHost = window.location.hostname === "app.yooga.com.br";
    const isIfoodHost = window.location.hostname.includes("ifood.com.br");

    const ESTILO_FIX_ROLAGEM = `
        body > app-root > ion-app > ion-router-outlet > app-navigation > ion-tabs > div > ion-router-outlet > order-manager > order-manager-component > div > div.left > div.content {
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            overscroll-behavior-y: contain !important;
            padding-bottom: 32px !important;
            box-sizing: border-box !important;
            scroll-padding-bottom: 32px !important;
        }

        body > app-root > ion-app > ion-router-outlet > app-navigation > ion-tabs > div > ion-router-outlet > order-manager > order-manager-component > div > div.left > div.content delivery-order:last-child {
            display: block !important;
            margin-bottom: 32px !important;
        }

        body > app-root > ion-app > ion-router-outlet > app-navigation > ion-tabs > div > ion-router-outlet > order-manager > order-manager-component > div > div.left > div.content .yooga-hidden-pedido-final {
            display: block !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            min-height: 220px !important;
            margin-bottom: 0 !important;
            contain: layout style !important;
        }
    `;

    function agendarLoop(fn, delay) {
        try {
            fn();
        } catch (error) {
            console.error('Erro no agendarLoop:', error);
        } finally {
            setTimeout(() => agendarLoop(fn, delay), delay);
        }
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

    // --- 0. REMOÇÃO DOS ELEMENTOS VISUAIS ---
    function executarRemocaoVisual() {
        if (!isYoogaHost) return;

        const grupoBotoes = document.querySelector(SELETOR_BOTOES_REMOVER);
        if (grupoBotoes) {
            grupoBotoes.remove();
        }

        const integrationPills = document.querySelector(SELETOR_INTEGRATION_PILLS);
        if (integrationPills) {
            integrationPills.remove();
        }

        const botaoAceitar = document.querySelector(SELETOR_BOTAO_ACEITAR);
        if (botaoAceitar) {
            const pai = botaoAceitar.parentElement;
            botaoAceitar.remove();

            if (pai && pai.children.length === 0) {
                pai.remove();
            }
        }
    }

    // --- 1. LÓGICA DE SEGURANÇA DO ENTREGADOR (GLOBAL DELEGATION) ---
    let travaSenhaEmAndamento = false;

    function interceptarSelecaoEntregador(e) {
        if (!isYoogaHost || travaSenhaEmAndamento) return;

        const target = e.target;
        const nomesCadastrados = Object.keys(SENHAS_ENTREGADORES);

        if (target && target.tagName === 'SELECT' && (target.getAttribute('formcontrolname') === 'deliveryman' || target.classList.contains('ng-dirty') || target.closest('.deliveryman') || nomesCadastrados.some(nome => target.options[target.selectedIndex]?.text.includes(nome)))) {

            const nomeSelecionado = target.options[target.selectedIndex]?.text.trim() || "";
            const chaveEntregador = nomesCadastrados.find(nome => nomeSelecionado === nome || nomeSelecionado.includes(nome));

            if (chaveEntregador && target.dataset.autorizado !== "true") {
                travaSenhaEmAndamento = true;

                const btnFiltrar = document.querySelector('.yooga-button-style.fill-primary') || document.querySelector('button.fill-primary');
                if (btnFiltrar) {
                    btnFiltrar.style.backgroundColor = "gray";
                    btnFiltrar.style.pointerEvents = "none";
                    btnFiltrar.style.opacity = "0.5";
                }

                setTimeout(() => {
                    const senhaDigitada = prompt(`⚠️ ${chaveEntregador.toUpperCase()} SELECIONADO\nDigite a senha:`);
                    const senhaEsperada = SENHAS_ENTREGADORES[chaveEntregador];

                    // Se o usuário clicou em Cancelar no prompt
                    if (senhaDigitada === null) {
                        target.dataset.autorizado = "false";
                        target.selectedIndex = 0;
                        target.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    // Se digitou a senha correta
                    else if (senhaDigitada === senhaEsperada) {
                        target.dataset.autorizado = "true";
                    }
                    // Se digitou algo, mas a senha está errada
                    else {
                        alert("❌ Senha Incorreta!");
                        target.dataset.autorizado = "false";
                        target.selectedIndex = 0;
                        target.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    if (btnFiltrar) {
                        btnFiltrar.style.backgroundColor = "";
                        btnFiltrar.style.pointerEvents = "auto";
                        btnFiltrar.style.opacity = "1";
                    }

                    travaSenhaEmAndamento = false;
                }, 100);
            } else if (!chaveEntregador) {
                target.dataset.autorizado = "false";
            }
        }
    }

    // Ouvintes globais na página para garantir captura imediata no clique/seleção
    document.addEventListener('change', interceptarSelecaoEntregador, true);
    document.addEventListener('input', interceptarSelecaoEntregador, true);

    // --- 2. BOTÃO IFOOD NO DELIVERY ---
    function executarBotaoIfood() {
        if (!isYoogaHost || !window.location.href.includes("/delivery")) return;

        if (!document.getElementById("btn-confirmar-yooga")) {
            let tel = document.querySelector(".cliente-telefone") || document.querySelector(".customer-phone") || document.querySelector(".text-bold.m-0");
            const num = tel ? tel.innerText.replace(/\D/g, '') : "";
            const ref = document.querySelector("p.entregar-em");
            if (!ref) return;

            const is99 = !!document.querySelector(SELETOR_IMG_99) && SELETOR_IMG_99_OK();
            let tipo = "yooga";
            if (num.startsWith("0800")) tipo = "ifood";
            else if (is99) tipo = "99food";

            const cfg = {
                ifood: { texto: "Confirmar Ifood", bg: "#e53935", cor: "#fff", borda: "#b71c1c" },
                "99food": { texto: "Confirmar 99Food", bg: "#ffd600", cor: "#000", borda: "#c7a500" },
                yooga: { texto: "Confirmar Yooga", bg: "#1e88e5", cor: "#fff", borda: "#1565c0" }
            }[tipo];

            const btn = document.createElement("div");
            btn.id = "btn-confirmar-yooga";
            btn.innerText = cfg.texto;
            btn.style = `background-color: ${cfg.bg}; color: ${cfg.cor}; padding: 10px 18px; border-radius: 8px; text-align: center; cursor: pointer; font-weight: bold; font-size: 14px; display: inline-block; border: 1px solid ${cfg.borda}; margin-bottom: 10px; width: 100%; box-sizing: border-box;`;
            btn.onclick = () => {
                if (tipo === "ifood") {
                    window.location.href = "https://confirmacao-entrega-propria.ifood.com.br/numero-pedido?cod=" + num.slice(-8);
                } else if (tipo === "99food") {
                    try { navigator.clipboard.writeText(num); } catch (e) {}
                    window.location.href = URL_CONFIRMACAO_99 + "#cod=" + encodeURIComponent(num);
                } else {
                    confirmarPedidoYooga();
                }
            };
            ref.insertAdjacentElement('beforebegin', btn);
        }
    }

    function SELETOR_IMG_99_OK() {
        const img = document.querySelector(SELETOR_IMG_99);
        return !!img && (img.getAttribute('src') || "").includes("/assets/imgs/99-logo.png");
    }

    // Clica no botão de confirmar do Yooga e depois no botão de finalizar do modal
    function confirmarPedidoYooga() {
        const b1 = document.querySelector(SELETOR_YOOGA_CONFIRMAR);
        if (!b1) return;
        b1.click();
        let tentativas = 0;
        const t = setInterval(() => {
            const b2 = document.querySelector(SELETOR_YOOGA_FINALIZAR);
            if (b2) {
                clearInterval(t);
                b2.click();
            } else if (++tentativas > 40) {
                clearInterval(t);
            }
        }, 250);
    }

    // --- LÓGICA NA 99FOOD: cola o localizador no input ---
    function executarAutomacao99() {
        if (!is99Host) return;
        const m = window.location.hash.match(/cod=([^&]+)/);
        if (!m) return;
        const input = document.querySelector(SELETOR_INPUT_99);
        if (!input) return;
        const cod = decodeURIComponent(m[1]);
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        input.focus();
        setter.call(input, cod);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // --- 3. LÓGICA NO IFOOD ---
    function executarAutomacaoIfood() {
        if (!isIfoodHost) return;

        const d1 = document.querySelector('[aria-label*="Digit 1"]');
        const cod = new URLSearchParams(window.location.search).get('cod');

        if (d1 && cod) {
            window.history.replaceState({}, document.title, window.location.pathname);
            cod.split('').forEach((n, i) => {
                setTimeout(() => {
                    const c = document.querySelector(`[aria-label*="Digit ${i + 1}"]`);
                    if (c) {
                        c.focus();
                        c.click();
                        document.execCommand('insertText', false, n);
                        c.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    if (i === 7) {
                        setTimeout(() => {
                            const btnContinuar = Array.from(document.querySelectorAll('button')).find(b =>
                                b.innerText.toLowerCase().includes("continuar") ||
                                b.classList.contains("OrderNumber__footer-button")
                            ) || document.querySelector(".kLtoWA.hsczDC");

                            if (btnContinuar) {
                                btnContinuar.className = "BaseButton-sc-odyat6-0 EmCUz OrderNumber__footer-button";
                                btnContinuar.click();
                            }
                        }, 600);
                    }
                }, i * 90);
            });
        }

        const okBtn = Array.from(document.querySelectorAll(".kLtoWA.hsczDC, button")).find(b => b.innerText.toLowerCase().includes("entendi"));
        if (okBtn) {
            okBtn.click();
            setTimeout(() => { window.location.href = URL_MESAS_YOOGA; }, 800);
        }
    }

    // --- 4. FILTRAGEM, LIMPEZA DE CHILDS E MAPEAMENTO EM MEMÓRIA (PRINT) ---
    function simularPedidoOcultoNoFinal() {
        if (!isYoogaHost) return;

        const containerLista = document.querySelector('body > app-root > ion-app > ion-router-outlet > app-navigation > ion-tabs > div > ion-router-outlet > order-manager > order-manager-component > div > div.left > div.content');
        if (!containerLista) return;

        let placeholder = containerLista.querySelector('.yooga-hidden-pedido-final');
        if (!placeholder) {
            placeholder = document.createElement('delivery-order');
            placeholder.className = 'yooga-hidden-pedido-final';
            placeholder.setAttribute('aria-hidden', 'true');
            placeholder.setAttribute('data-yooga-hidden-final', 'true');
            placeholder.style.cssText = 'display:block !important; visibility:hidden !important; opacity:0 !important; pointer-events:none !important; min-height:220px !important; margin:0 !important;';
            containerLista.appendChild(placeholder);
        }
    }

    function executarProcessamentoPedidos() {
        if (!isYoogaHost) return;

        const selectFiltro = document.querySelector(SELETOR_FILTRO_NATIVO);
        const cardsPedidos = document.querySelectorAll('delivery-order');

        simularPedidoOcultoNoFinal();

        if (selectFiltro && cardsPedidos.length > 0) {

            if (!selectFiltro.dataset.limpoNativo) {
                for (let i = 9; i >= 3; i--) {
                    const opcaoNativa = selectFiltro.querySelector(`option:nth-child(${i})`);
                    if (opcaoNativa) opcaoNativa.remove();
                }
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

                listaTemporariaParaPrint.push({
                    elemento: card,
                    rota: rotaDoCard
                });
            });

            let rotaSalvaValida = localStorage.getItem('ultimaRotaYooga') || "TODOS";
            if (rotaSalvaValida !== "TODOS" && rotasEncontradas.size > 0 && !rotasEncontradas.has(rotaSalvaValida)) {
                localStorage.removeItem('ultimaRotaYooga');
                rotaAtivaFiltro = "TODOS";
                rotaSalvaValida = "TODOS";
            }

            if (rotaAtivaFiltro === "TODOS" || printPedidosDoDia.length === 0) {
                if (listaTemporariaParaPrint.length > 0) {
                    printPedidosDoDia = listaTemporariaParaPrint;
                }
            }

            const assinaturaRotasAtuais = Array.from(rotasEncontradas).sort().join(',');

            if (assinaturaRotasAtuais !== ultimasRotasDetectadas) {
                ultimasRotasDetectadas = signatureGerada(rotasEncontradas);

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
                        if (opt.text.trim() === textoParaProcurar.trim()) {
                            selectFiltro.selectedIndex = idx;
                        }
                    });
                } else {
                    if(selectFiltro.options[selectFiltro.selectedIndex]?.text.includes("Rota")) {
                         selectFiltro.selectedIndex = 0;
                    }
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
                selectFiltro.addEventListener('click', gerenciarTrocaDeFiltro);
                selectFiltro.addEventListener('input', gerenciarTrocaDeFiltro);
            }

            atualizarVisualizacaoCardsBaseadoNoPrint();
        }
    }

    let automacoesInicializadas = false;

    function inicializarAutomacoes() {
        if (automacoesInicializadas) return;
        automacoesInicializadas = true;

        if (isYoogaHost) {
            aplicarFixRolagem();
            agendarLoop(executarRemocaoVisual, 1500);
            agendarLoop(executarBotaoIfood, 2000);
            agendarLoop(executarProcessamentoPedidos, 4000);
        }

        if (isIfoodHost) {
            agendarLoop(executarAutomacaoIfood, 1000);
        }

        if (is99Host) {
            agendarLoop(executarAutomacao99, 500);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarAutomacoes, { once: true });
        window.addEventListener('load', inicializarAutomacoes, { once: true });
    } else {
        inicializarAutomacoes();
    }

    function signatureGerada(setRotas) {
        return Array.from(setRotas).sort().join(',');
    }

    function atualizarVisualizacaoCardsBaseadoNoPrint() {
        const rotaFiltroDefinitiva = localStorage.getItem('ultimaRotaYooga') || "TODOS";

        if (printPedidosDoDia.length === 0) return;

        printPedidosDoDia.forEach(pedido => {
            if (pedido.elemento) {
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

})();
