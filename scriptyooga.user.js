// ==UserScript==
// @name         Confirmar Pedido Yooga - V88.8 (Correção bug mola ihpone)
// @version      88.8
// @description  Baseado na V87.0. Remove o grupo de botões de ações do delivery e mantém o sistema inteligente de print e persistência de rotas.
// @author       Mateus
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

    // Recupera a última rota salva no navegador. Se não existir, o padrão é "TODOS".
    let rotaAtivaFiltro = localStorage.getItem('ultimaRotaYooga') || "TODOS";
    let ultimasRotasDetectadas = "";

    // O nosso "print" na memória: guarda a referência dos elementos físicos e suas rotas
    let printPedidosDoDia = [];

    // Seletores enviados por você
    const SELETOR_FILTRO_NATIVO = "body > app-root > ion-app > ion-router-outlet > app-navigation > ion-tabs > div > ion-router-outlet > order-manager > order-manager-component > div > div.left > div.content > div:nth-child(2) > div.bottom > div.inputs > div.filter > select";
    const SELETOR_BOTOES_REMOVER = "body > app-root > ion-app > ion-router-outlet > app-navigation > ion-tabs > div > ion-router-outlet > order-manager > order-manager-component > div > div.left > div.content > div:nth-child(2) > delivery-actions-bar > div > div.button-parent > div.button-group";
    const SELETOR_INTEGRATION_PILLS = "body > app-root > ion-app > ion-router-outlet > app-navigation > ion-tabs > div > ion-router-outlet > order-manager > order-manager-component > div > div.left > div.content > div:nth-child(2) > div.bottom > integration-pills";
    const SELETOR_BOTAO_ACEITAR = "body > app-root > ion-app > ion-router-outlet > app-navigation > ion-tabs > div > ion-router-outlet > order-manager > order-manager-component > div > div.left > div.accept";
    const SELETOR_TAB_DELIVERY = "#tab-button-delivery > div > img";
    const SELETOR_PEDIDO_MOCK = "#shepherd-delivery-mocked-order > div > div:nth-child(1) > mnt-badge > div > span";

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
        fn();
        setTimeout(() => agendarLoop(fn, delay), delay);
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

    // --- 1. LÓGICA DE SEGURANÇA DO ENTREGADOR ---
    function executarSegurancaEntregador() {
        if (!isYoogaHost) return;

        const selectEntregador = document.querySelector('select[formcontrolname="deliveryman"]') ||
                                 document.querySelector('select.ng-valid.ng-dirty.ng-touched');

        const btnFiltrar = document.querySelector('.yooga-button-style.fill-primary') ||
                           document.querySelector('button.fill-primary');

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
            }
            else if (nomeSelecionado.trim() !== "Mateus") {
                btnFiltrar.dataset.desbloqueado = "false";
                btnFiltrar.style.backgroundColor = "";
                btnFiltrar.style.pointerEvents = "auto";
                btnFiltrar.style.opacity = "1";
            }
        }
    }

    // --- 2. BOTÃO IFOOD NO DELIVERY ---
    function executarBotaoIfood() {
        if (!isYoogaHost || !window.location.href.includes("/delivery")) return;

        if (!document.getElementById("btn-confirmar-yooga")) {
            let tel = document.querySelector(".cliente-telefone") || document.querySelector(".customer-phone") || document.querySelector(".text-bold.m-0");
            const num = tel ? tel.innerText.replace(/\D/g, '') : "";
            if (num.startsWith("0800")) {
                const ref = document.querySelector("p.entregar-em");
                if (ref) {
                    const btn = document.createElement("div");
                    btn.id = "btn-confirmar-yooga";
                    btn.innerText = "CONFIRMAR IFOOD";
                    btn.style = "background-color: #add8e6; color: #000; padding: 10px 18px; border-radius: 8px; text-align: center; cursor: pointer; font-weight: bold; font-size: 14px; display: inline-block; border: 1px solid #90cbdc; margin-bottom: 10px; width: 100%; box-sizing: border-box;";
                    btn.onclick = () => { window.location.href = "https://confirmacao-entrega-propria.ifood.com.br/numero-pedido?cod=" + num.slice(-8); };
                    ref.insertAdjacentElement('beforebegin', btn);
                }
            }
        }
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
                    if (c) { c.focus(); c.click(); document.execCommand('insertText', false, n); c.dispatchEvent(new Event('input', { bubbles: true })); }
                    if (i === 7) setTimeout(() => { const b = document.querySelector(".kLtoWA.hsczDC"); if (b) b.click(); }, 600);
                }, i * 90);
            });
        }
        const okBtn = Array.from(document.querySelectorAll(".kLtoWA.hsczDC, button")).find(b => b.innerText.toLowerCase().includes("entendi"));
        if (okBtn) { okBtn.click(); setTimeout(() => { window.location.href = URL_MESAS_YOOGA; }, 800); }
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

            // LIMPEZA: Remove do 3º ao 9º item nativo do seletor
            if (!selectFiltro.dataset.limpoNativo) {
                for (let i = 9; i >= 3; i--) {
                    const opcaoNativa = selectFiltro.querySelector(`option:nth-child(${i})`);
                    if (opcaoNativa) opcaoNativa.remove();
                }
                selectFiltro.dataset.limpoNativo = "true";
            }

            // MAPEAMENTO COMPLETO
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

            // Validação de existência da rota salva
            let rotaSalvaValida = localStorage.getItem('ultimaRotaYooga') || "TODOS";
            if (rotaSalvaValida !== "TODOS" && rotasEncontradas.size > 0 && !rotasEncontradas.has(rotaSalvaValida)) {
                localStorage.removeItem('ultimaRotaYooga');
                rotaAtivaFiltro = "TODOS";
                rotaSalvaValida = "TODOS";
            }

            // BLINDAGEM DO PRINT: Atualiza a foto se estiver em "TODOS" ou se o print anterior sumiu da memória física
            if (rotaAtivaFiltro === "TODOS" || printPedidosDoDia.length === 0) {
                if (listaTemporariaParaPrint.length > 0) {
                    printPedidosDoDia = listaTemporariaParaPrint;
                }
            }

            const assinaturaRotasAtuais = Array.from(rotasEncontradas).sort().join(',');

            // Se mudou a lista real de rotas do banco do Yooga, recria as opções sem perder a referência
            if (assinaturaRotasAtuais !== ultimasRotasDetectadas) {
                ultimasRotasDetectadas = signatureGerada(rotasEncontradas);

                selectFiltro.querySelectorAll('option.rota-injetada').forEach(opt => opt.remove());

                // Insere as rotas estáveis encontradas mantendo sempre o value="OPEN"
                rotasEncontradas.forEach(letra => {
                    const novaOpcao = document.createElement('option');
                    novaOpcao.value = "OPEN";
                    novaOpcao.textContent = `Rota ${letra}`;
                    novaOpcao.className = 'rota-injetada';
                    selectFiltro.appendChild(novaOpcao);
                });

                // RECORREÇÃO DO FOCO VISUAL: Re-aplica o texto correto com base na validação acima
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

            // OUVINTE QUE INTERCEPTA A MUDANÇA E GRAVA NO ARMAZENAMENTO DO CELULAR
            if (!selectFiltro.dataset.escutandoRotas) {
                selectFiltro.dataset.escutandoRotas = "true";

                const gerenciarTrocaDeFiltro = (e) => {
                    const textoSelecionado = e.target.options[e.target.selectedIndex]?.text || "";

                    if (textoSelecionado.includes("Rota ")) {
                        rotaAtivaFiltro = textoSelecionado.replace("Rota ", "").trim();
                        localStorage.setItem('ultimaRotaYooga', rotaAtivaFiltro); // Salva na memória do aparelho
                    } else {
                        rotaAtivaFiltro = "TODOS";
                        localStorage.removeItem('ultimaRotaYooga'); // Limpa se voltar para a aba geral
                    }
                    atualizarVisualizacaoCardsBaseadoNoPrint();
                };

                selectFiltro.addEventListener('change', gerenciarTrocaDeFiltro);
                selectFiltro.addEventListener('click', gerenciarTrocaDeFiltro);
                selectFiltro.addEventListener('input', gerenciarTrocaDeFiltro);
            }

            // Força a filtragem visual baseada no print persistido a cada ciclo de render do loop
            atualizarVisualizacaoCardsBaseadoNoPrint();
        }
    }

    function removerPedidoMockOferta() {
        const spansOferta = document.querySelectorAll(SELETOR_PEDIDO_MOCK);
        if (!spansOferta.length) return;

        spansOferta.forEach(spanOferta => {
            if (spanOferta.innerText.trim().includes("Oferta")) {
                const pedido = spanOferta.closest('delivery-order');
                if (pedido) {
                    pedido.remove();
                }
            }
        });
    }

    function aguardarSeletorDeliveryEIniciar() {
        const tentarIniciar = () => {
            const botaoDelivery = document.querySelector(SELETOR_TAB_DELIVERY);
            if (botaoDelivery) {
                inicializarAutomacoes();
                return true;
            }
            return false;
        };

        if (tentarIniciar()) return;

        const observer = new MutationObserver(() => {
            if (tentarIniciar()) {
                observer.disconnect();
            }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });

        const interval = setInterval(() => {
            if (tentarIniciar()) {
                clearInterval(interval);
                observer.disconnect();
            }
        }, 500);
    }

    function inicializarAutomacoes() {
        if (isYoogaHost) {
            removerPedidoMockOferta();
            aplicarFixRolagem();
            agendarLoop(executarRemocaoVisual, 1500);
            agendarLoop(executarSegurancaEntregador, 2500);
            agendarLoop(executarBotaoIfood, 2000);
            agendarLoop(executarProcessamentoPedidos, 4000);
        }

        if (isIfoodHost) {
            agendarLoop(executarAutomacaoIfood, 1000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (isIfoodHost) {
                inicializarAutomacoes();
            } else {
                aguardarSeletorDeliveryEIniciar();
            }
        }, { once: true });
    } else {
        if (isIfoodHost) {
            inicializarAutomacoes();
        } else {
            aguardarSeletorDeliveryEIniciar();
        }
    }

    // Função auxiliar estável para assinatura
    function signatureGerada(setRotas) {
        return Array.from(setRotas).sort().join(',');
    }

    // Ocultação baseada estritamente nas referências guardadas no Print da memória
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
