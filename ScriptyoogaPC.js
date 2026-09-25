// ==UserScript==
// @name         Yooga - Monitor V105
// @match        *://app.yooga.com.br/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    let memoriaPedidosGeral = {};
    let bancoDeDadosRotas = {};
    let pedidosFinalizadosInterno = new Set();
    let pedidosAdicionadosNestaSessao = new Set();
    let menuEntregadorAberto = false;
    let scrollMenuEntregador = 0;
    let idsEmEntregaRemovidos = new Set();
    let rotasVistasNaUltimaVez = new Set();
    let pedidosProntos = new Set();
    let statusPedidosAPI = {};
    let dadosPedidosAPI = {};
    let pagamentosPedidosAPI = {};
    let rotasInvertidas = {};
    let ultimaRotaFoiInvertida = false;
    let localizacaoDispositivo = { latitude: null, longitude: null };
    const LOCALIZACAO_LOJA = { latitude: -5.04603646, longitude: -42.73172915 };
    const CHAVE_TELEFONES_ENTREGADORES = 'yooga_telefones_entregadores';
    const CHAVE_PAGAMENTOS_PEDIDOS = 'yooga_pagamentos_pedidos';
    const CHAVE_ENVIO_AUTOMATICO_ENTREGADORES = 'yooga_envio_automatico_entregadores';

    try {
        pagamentosPedidosAPI = JSON.parse(localStorage.getItem(CHAVE_PAGAMENTOS_PEDIDOS) || '{}');
    } catch (e) {
        pagamentosPedidosAPI = {};
    }

    function obterTelefonesEntregadores() {
        try {
            return JSON.parse(localStorage.getItem(CHAVE_TELEFONES_ENTREGADORES) || '{}');
        } catch (e) {
            return {};
        }
    }

    function obterEnviosAutomaticosEntregadores() {
        try {
            return JSON.parse(localStorage.getItem(CHAVE_ENVIO_AUTOMATICO_ENTREGADORES) || '{}');
        } catch (e) {
            return {};
        }
    }

    function entregadorTemEnvioAutomatico(nome) {
        return obterEnviosAutomaticosEntregadores()[nome] === true;
    }

    function alternarEnvioAutomaticoEntregador(nome, ativo) {
        const envios = obterEnviosAutomaticosEntregadores();
        envios[nome] = Boolean(ativo);
        localStorage.setItem(CHAVE_ENVIO_AUTOMATICO_ENTREGADORES, JSON.stringify(envios));
        escanearTudo();
    }

    function normalizarTelefone(telefone) {
        return String(telefone || '').replace(/\D/g, '');
    }

    function atualizarLocalizacaoDispositivo(callback = null) {
        if (!navigator.geolocation) {
            alert('Este navegador não disponibiliza a localização do dispositivo.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            posicao => {
                localizacaoDispositivo = {
                    latitude: posicao.coords.latitude,
                    longitude: posicao.coords.longitude
                };
                if (callback) callback();
            },
            () => alert('Permita o acesso à localização do dispositivo para enviar a rota.'),
            { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
        );
    }

    function extrairCodigoLocalizadorPedido(telefoneRaw) {
        const texto = String(telefoneRaw || '');
        if (!texto || !texto.toUpperCase().includes('ID:')) return '';
        const match = texto.match(/ID:\s*(\d{8})/i);
        if (!match) return '';
        return match[1];
    }

    function extrairDadosPedidoAPI(pedido, numero) {
        let enderecoDetalhado = {};
        try {
            enderecoDetalhado = typeof pedido.addressObject === 'string'
                ? JSON.parse(pedido.addressObject)
                : (pedido.addressObject || {});
        } catch (e) {}

        const cliente = pedido.orderCustomer || pedido.orderUser || {};
        const pagamentos = Array.isArray(pedido.orderPayments)
            ? pedido.orderPayments
            : (pedido.orderPayments && typeof pedido.orderPayments === 'object' ? [pedido.orderPayments] : []);
        const pagamento = pagamentos[0] || {};
        const enderecoBase = pedido.address || enderecoDetalhado.endereco || enderecoDetalhado.formatted_address || '';
        const enderecoComplementar = pedido.address2 || '';
        const telefoneRaw = cliente.phone || pedido.phone || pedido.telefone || pedido.phoneNumber || '';
        const codigoLocalizador = extrairCodigoLocalizadorPedido(telefoneRaw);
        const endereco = [enderecoBase, enderecoComplementar].filter(Boolean).join(', ');
        return {
            id: pedido.id,
            numero: String(numero || pedido.id || ''),
            status: pedido.status || '',
            nome: cliente.name || '',
            telefone: telefoneRaw,
            codigoLocalizador,
            endereco,
            complemento: enderecoDetalhado.complemento || enderecoDetalhado.complement || pedido.complemento || '',
            referencia: enderecoDetalhado.referencia || enderecoDetalhado.reference || pedido.referencia || pedido.reference || '',
            formaPagamento: pagamento.methodName || pagamento.method_name || '',
            tipoPagamento: pagamento.type || '',
            valorPagamento: pagamento.value ?? pedido.total ?? null,
            trocoPara: pagamento.changeFor ?? null,
            latitude: pedido.latitude ?? enderecoDetalhado.latitude ?? enderecoDetalhado.coordinates?.latitude ?? null,
            longitude: pedido.longitude ?? enderecoDetalhado.longitude ?? enderecoDetalhado.coordinates?.longitude ?? null
        };
    }

    function guardarStatusPedidoAPI(pedido) {
        if (!pedido || typeof pedido !== 'object') return;

        const numero = pedido.orderSequentialCount?.sequentialCount ?? pedido.sequentialCount;
        const id = pedido.id;
        const status = typeof pedido.status === 'string' ? pedido.status : '';
        const possuiNumero = numero !== undefined && numero !== null && String(numero).trim() !== '';
        const possuiId = id !== undefined && id !== null && String(id).trim() !== '';
        const chavePedido = possuiNumero ? String(numero) : (possuiId ? `id:${id}` : null);

        if (status && chavePedido) {
            const dados = { status, id };
            const dadosPedido = extrairDadosPedidoAPI(pedido, possuiNumero ? numero : id);
            const ehPedidoPrincipal = possuiId && (
                Array.isArray(pedido.orderPayments) ||
                pedido.orderUser ||
                pedido.address !== undefined ||
                pedido.latitude !== undefined
            );
            if (possuiNumero) statusPedidosAPI[String(numero)] = dados;
            if (possuiId) statusPedidosAPI[`id:${id}`] = dados;
            dadosPedidosAPI[chavePedido] = { ...dadosPedidosAPI[chavePedido], ...dadosPedido };
            if (possuiNumero) dadosPedidosAPI[String(numero)] = dadosPedidosAPI[chavePedido];
            if (possuiId) dadosPedidosAPI[`id:${id}`] = dadosPedidosAPI[chavePedido];
            console.info('[Yooga Monitor] Dados completos extraídos da API', dadosPedido);
            if (ehPedidoPrincipal) {
                registrarMudaStatus(possuiNumero ? String(numero) : String(id), status, pedido.createdAt);
            }
            if (dadosPedido.formaPagamento || dadosPedido.tipoPagamento) {
                const pagamento = {
                    id: dadosPedido.id,
                    numero: dadosPedido.numero,
                    formaPagamento: dadosPedido.formaPagamento,
                    tipoPagamento: dadosPedido.tipoPagamento,
                    valorPagamento: dadosPedido.valorPagamento,
                    trocoPara: dadosPedido.trocoPara
                };
                if (possuiNumero) pagamentosPedidosAPI[String(numero)] = pagamento;
                if (possuiId) pagamentosPedidosAPI[`id:${id}`] = pagamento;
                localStorage.setItem(CHAVE_PAGAMENTOS_PEDIDOS, JSON.stringify(pagamentosPedidosAPI));
                console.info('[Yooga Monitor] Pagamento extraído da API', {
                    numero: dadosPedido.numero,
                    id: dadosPedido.id,
                    formaPagamento: pagamento.formaPagamento,
                    tipoPagamento: pagamento.tipoPagamento,
                    valorPagamento: pagamento.valorPagamento,
                    trocoPara: pagamento.trocoPara
                });
            }
            if (/^(PREPARING|DELIVERED|FINISHED)$/i.test(status)) {
                if (Number.isFinite(dadosPedido.latitude) && Number.isFinite(dadosPedido.longitude)) {
                    console.info('[Yooga Monitor] Localização extraída da API', {
                        numero: dadosPedido.numero,
                        id: dadosPedido.id,
                        latitude: dadosPedido.latitude,
                        longitude: dadosPedido.longitude
                    });
                }
            }
        }

        Object.values(pedido).forEach(valor => {
            if (valor && typeof valor === 'object') {
                if (Array.isArray(valor)) valor.forEach(guardarStatusPedidoAPI);
                else guardarStatusPedidoAPI(valor);
            }
        });
    }

    function processarRespostaAPI(dados) {
        if (Array.isArray(dados)) dados.forEach(guardarStatusPedidoAPI);
        else guardarStatusPedidoAPI(dados);
    }

    function instalarMonitorAPI() {
        const fetchOriginal = window.fetch;
        if (fetchOriginal) {
            window.fetch = function(...args) {
                return fetchOriginal.apply(this, args).then(resposta => {
                    resposta.clone().json().then(processarRespostaAPI).catch(() => {});
                    return resposta;
                });
            };
        }

        const openOriginal = XMLHttpRequest.prototype.open;
        const sendOriginal = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(...args) {
            this.__yoogaMonitorUrl = args[1];
            return openOriginal.apply(this, args);
        };
        XMLHttpRequest.prototype.send = function(...args) {
            this.addEventListener('load', () => {
                try {
                    if (this.responseText) processarRespostaAPI(JSON.parse(this.responseText));
                } catch (e) {}
            });
            return sendOriginal.apply(this, args);
        };
    }

    instalarMonitorAPI();

    function obterStatusAPI(numeroPedido) {
        return statusPedidosAPI[String(numeroPedido)]?.status || '';
    }

    function registrarFinalizacaoAPI(numeroAPI, status, criadoEm) {
        const dados = obterDadosMetricas();
        if (dados.pedidos[numeroAPI]) {
            registrarMudaStatus(numeroAPI, status, criadoEm);
            return;
        }

        const pedidosEmEntrega = Object.entries(dados.pedidos).filter(([, pedido]) =>
            !pedido.fimEntrega &&
            (pedido.statusAtual || '').toLowerCase().match(/entrega|despachado/)
        );

        if (pedidosEmEntrega.length === 1) {
            registrarMudaStatus(pedidosEmEntrega[0][0], status, criadoEm);
        }
    }

    function statusAPIFinalizado(status) {
        const normalizado = (status || '').toLowerCase();
        return normalizado.includes('finished') || normalizado.includes('delivered') || normalizado.includes('finaliz') || normalizado.includes('conclu');
    }

    function normalizarStatusParaMetricas(status) {
        const normalizado = String(status || '').toUpperCase();
        if (normalizado === 'PREPARING') return 'preparando';
        if (['DELIVERING', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'IN_DELIVERY', 'ON_THE_WAY', 'SHIPPED'].includes(normalizado)) return 'em entrega';
        if (normalizado === 'DELIVERED') return 'em entrega';
        if (normalizado === 'COLLECTED') return 'em entrega';
        if (normalizado === 'FINISHED') return 'finished';
        if (normalizado === 'CANCELLED') return 'cancelled';
        return status;
    }

    function obterTimestamp(data) {
        if (!data) return null;
        const timestamp = typeof data === 'number' ? data : Date.parse(data);
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    // --- MÓDULO DE MÉTRICAS (RESET ÀS 03:00 DA MANHÃ) ---
    const CHAVE_METRICAS = 'yooga_metricas_diarias';

    function obterHorarioCorteMaisRecente() {
        const agora = new Date();
        const corte = new Date(agora);
        corte.setHours(3, 0, 0, 0);

        if (agora < corte) {
            corte.setDate(corte.getDate() - 1);
        }
        return corte.getTime();
    }

    function obterDadosMetricas() {
        const ultimoCorte = obterHorarioCorteMaisRecente();
        let dados = JSON.parse(localStorage.getItem(CHAVE_METRICAS) || '{"dataCorte":0, "pedidos":{}, "historicoPreparo":[], "historicoEntrega":[], "historicoTotal":[]}');

        if (dados.dataCorte < ultimoCorte) {
            dados = {
                dataCorte: ultimoCorte,
                pedidos: {},
                historicoPreparo: [],
                historicoEntrega: [],
                historicoTotal: []
            };
        } else {
            dados.historicoPreparo = dados.historicoPreparo.filter(item => item.timestamp >= ultimoCorte);
            dados.historicoEntrega = dados.historicoEntrega.filter(item => item.timestamp >= ultimoCorte);
            dados.historicoTotal = (dados.historicoTotal || []).filter(item => item.timestamp >= ultimoCorte);
        }

        localStorage.setItem(CHAVE_METRICAS, JSON.stringify(dados));
        return dados;
    }

    function registrarMudaStatus(numPedido, novoStatus, criadoEm = null) {
        if (!numPedido || !novoStatus) return;

        const dados = obterDadosMetricas();
        const agora = Date.now();
        const statusNormalizado = String(normalizarStatusParaMetricas(novoStatus)).toLowerCase();
        const criadoEmTimestamp = obterTimestamp(criadoEm);

        if (!dados.pedidos[numPedido]) {
            dados.pedidos[numPedido] = {
                criadoEm: criadoEmTimestamp || agora,
                inicioPedido: criadoEmTimestamp || agora,
                statusAtual: '',
                inicioPreparo: null,
                fimPreparo: null,
                inicioEntrega: null,
                fimEntrega: null,
                totalPedido: null
            };
        }

        const pedido = dados.pedidos[numPedido];
        if (criadoEmTimestamp && (!pedido.criadoEm || pedido.criadoEm === pedido.inicioPedido)) {
            pedido.criadoEm = criadoEmTimestamp;
            pedido.inicioPedido = criadoEmTimestamp;
        }
        const statusAnterior = pedido.statusAtual.toLowerCase();

        // Só atualiza se realmente houve alteração de status
        if (statusAnterior !== statusNormalizado) {

            // 1. Entrada em Preparando
            if (statusNormalizado.includes('preparando')) {
                if (!pedido.inicioPreparo) {
                    pedido.inicioPreparo = agora;
                }
            }

            // 2. Transição de Preparando -> Em Entrega / Despachado
            if (statusNormalizado.includes('entrega') || statusNormalizado.includes('despachado')) {
                if (pedido.inicioPreparo && !pedido.fimPreparo) {
                    const diffMs = Math.max(0, agora - pedido.inicioPreparo);
                    pedido.fimPreparo = agora;
                    dados.historicoPreparo.push({ numPedido, minutos: diffMs / 60000, timestamp: agora });
                }
                if (!pedido.inicioEntrega) {
                    pedido.inicioEntrega = agora;
                }
            }

            // 3. Transição de Em Entrega -> Concluído / Finalizado
            if (statusNormalizado.includes('conclu') || statusNormalizado.includes('finaliz') || statusNormalizado.includes('finished') || statusNormalizado.includes('cancel')) {
                if (pedido.inicioEntrega && !pedido.fimEntrega) {
                    const diffMs = Math.max(0, agora - pedido.inicioEntrega);
                    pedido.fimEntrega = agora;
                    dados.historicoEntrega.push({ numPedido, minutos: diffMs / 60000, timestamp: agora });
                }
                if (!pedido.totalPedido) {
                    const inicioTotal = pedido.inicioPedido || pedido.criadoEm;
                    const diffTotalMs = Math.max(0, agora - inicioTotal);
                    pedido.totalPedido = agora;
                    dados.historicoTotal.push({ numPedido, minutos: diffTotalMs / 60000, timestamp: agora });
                }
            }

            pedido.statusAtual = normalizarStatusParaMetricas(novoStatus);
            localStorage.setItem(CHAVE_METRICAS, JSON.stringify(dados));
        }
    }

    function calcularMediasDiarias() {
        const dados = obterDadosMetricas();

        const mediaPreparo = dados.historicoPreparo.length
            ? Math.round(dados.historicoPreparo.reduce((acc, curr) => acc + curr.minutos, 0) / dados.historicoPreparo.length)
            : null;

        const mediaEntrega = dados.historicoEntrega.length
            ? Math.round(dados.historicoEntrega.reduce((acc, curr) => acc + curr.minutos, 0) / dados.historicoEntrega.length)
            : null;

        const mediaTotal = mediaPreparo !== null && mediaEntrega !== null
            ? mediaPreparo + mediaEntrega
            : null;

        return {
            mediaPreparo,
            mediaEntrega,
            mediaTotal,
            qtdPreparo: dados.historicoPreparo.length,
            qtdEntrega: dados.historicoEntrega.length,
            qtdTotal: dados.historicoTotal?.length || 0
        };
    }

    function gerarHTMLDashboardMedias() {
        const { mediaPreparo, mediaEntrega, mediaTotal, qtdPreparo, qtdEntrega, qtdTotal } = calcularMediasDiarias();

        const prepTexto = mediaPreparo !== null ? `${mediaPreparo} min (${qtdPreparo})` : '--';
        const entTexto = mediaEntrega !== null ? `${mediaEntrega} min (${qtdEntrega})` : '--';
        const totalTexto = mediaTotal !== null ? `${mediaTotal} min (${qtdTotal})` : '--';

        return `
            <div style="display: flex; gap: 8px; margin: 0 0 12px 0; background: white; padding: 10px; border-radius: 12px; border: 1px solid #e0e0e0; box-shadow: 0 2px 5px rgba(0,0,0,0.03);">
                <div style="flex: 1; text-align: center; border-right: 1px solid #eee;">
                    <div style="color: #777; font-size: 10px; font-weight: bold; text-transform: uppercase;">Média Preparo</div>
                    <div style="color: #ff9800; font-weight: 900; font-size: 14px; margin-top: 3px;">🍳 ${prepTexto}</div>
                </div>
                <div style="flex: 1; text-align: center;">
                    <div style="color: #777; font-size: 10px; font-weight: bold; text-transform: uppercase;">Média Entrega</div>
                    <div style="color: #4caf50; font-weight: 900; font-size: 14px; margin-top: 3px;">🛵 ${entTexto}</div>
                </div>
                <div style="flex: 1; text-align: center; border-left: 1px solid #eee;">
                    <div style="color: #777; font-size: 10px; font-weight: bold; text-transform: uppercase;">Média Total</div>
                    <div style="color: #1565c0; font-weight: 900; font-size: 14px; margin-top: 3px;">⏱️ ${totalTexto}</div>
                </div>
            </div>
        `;
    }

    function obterCorPorTempo(minutos) {
        if (minutos === null || isNaN(minutos)) return "#888";
        if (minutos <= 30) return "#4caf50";
        if (minutos <= 45) return "#fbc02d";
        return "#f44336";
    }

    function calcularDiferencaMinutos(textoHora) {
        if (!textoHora) return { texto: "", min: null };
        const horaLimpa = textoHora.replace(/[^0-9:]/g, '').trim();
        if (!horaLimpa.includes(':')) return { texto: "", min: null };

        try {
            const partes = horaLimpa.split(':');
            const horas = parseInt(partes[0], 10);
            const minutos = parseInt(partes[1], 10);
            if (isNaN(horas) || isNaN(minutos)) return { texto: "", min: null };

            const agora = new Date();
            const dataPedido = new Date();
            dataPedido.setHours(horas, minutos, 0, 0);

            if (dataPedido > agora) dataPedido.setDate(dataPedido.getDate() - 1);

            const diffMs = agora - dataPedido;
            const diffMin = Math.floor(diffMs / 60000);

            let label = "";
            if (diffMin < 0) label = "agora";
            else if (diffMin >= 60) {
                const h = Math.floor(diffMin / 60);
                const m = diffMin % 60;
                label = `há ${h}h ${m}m`;
            } else {
                label = `há ${diffMin} min`;
            }

            return { texto: label, min: diffMin };
        } catch (e) { return { texto: "", min: null }; }
    }

    function obterOrdemEntrega(elemento, indice) {
        const valores = [
            elemento.getAttribute('data-order'),
            elemento.getAttribute('data-sequence'),
            elemento.getAttribute('aria-posinset'),
            elemento.dataset?.order,
            elemento.dataset?.sequence
        ];
        const ordemInformada = valores.map(Number).find(Number.isFinite);
        if (ordemInformada !== undefined) return ordemInformada;

        const ordemCSS = Number.parseInt(window.getComputedStyle(elemento).order, 10);
        return Number.isFinite(ordemCSS) && ordemCSS !== 0 ? ordemCSS : indice;
    }

    function injetarBotoesProntoNosCards() {
        const cards = document.querySelectorAll('delivery-order');
        if (!cards.length) return;

        cards.forEach(card => {
            const num = card.querySelector('.left-side p')?.innerText?.replace('#', '').trim();
            const rightSide = card.querySelector('.right-side');

            if (rightSide && num) {
                let btnPronto = rightSide.querySelector('.btn-pronto-yooga');
                if (!btnPronto) {
                    btnPronto = document.createElement('button');
                    btnPronto.className = 'btn-pronto-yooga';
                    btnPronto.style.cssText = `
                        background-color: #2196f3;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        padding: 5px 13px;
                        font-size: 15px;
                        font-weight: bold;
                        cursor: pointer;
                        margin-right: 6px;
                        transition: background-color 0.2s;
                    `;
                    btnPronto.innerText = "Pronto";
                    btnPronto.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        window.togglePedidoPronto(num);
                    };
                    rightSide.insertBefore(btnPronto, rightSide.firstChild);
                }

                const taPronto = pedidosProntos.has(num);
                const corDesejada = taPronto ? '#4caf50' : '#2196f3';
                const textoDesejado = taPronto ? 'Pronto ✓' : 'Pronto';

                if (btnPronto.innerText !== textoDesejado) {
                    btnPronto.style.backgroundColor = corDesejada;
                    btnPronto.innerText = textoDesejado;
                }
            }
        });
    }

    window.togglePedidoPronto = function(idPedido) {
        if (pedidosProntos.has(idPedido)) {
            pedidosProntos.delete(idPedido);
        } else {
            pedidosProntos.add(idPedido);
        }
        injetarBotoesProntoNosCards();
        escanearTudo();
    };

    function valorJS(valor) {
        return JSON.stringify(String(valor || '')).replace(/</g, '\\u003c');
    }

    function normalizarTextoBusca(valor) {
        return String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function obterRegistroPedidoExato(numero, mapa, nomeCliente = '') {
        const alvo = String(numero ?? '').trim();
        const nomeAlvo = normalizarTextoBusca(nomeCliente);
        if (!alvo && !nomeAlvo) return null;

        const mapaValores = Object.values(mapa || {});
        const registrosUnicos = mapaValores.filter((registro, indice, lista) =>
            registro && lista.findIndex(outro => outro === registro) === indice
        );

        const correspondeNumero = registro => {
            const numeroAtual = String(registro.numero ?? '').trim();
            return String(registro.id ?? '') === alvo || numeroAtual === alvo;
        };

        if (alvo && nomeAlvo) {
            return registrosUnicos.find(registro =>
                correspondeNumero(registro) && normalizarTextoBusca(registro.nome || '') === nomeAlvo
            ) || null;
        }

        const registroPorNumero = registrosUnicos.find(correspondeNumero);
        if (registroPorNumero) return registroPorNumero;

        if (!nomeAlvo) return null;

        const candidatosPorNome = registrosUnicos.filter(registro => {
            const nomeAtual = normalizarTextoBusca(registro.nome || '');
            return nomeAtual && nomeAtual === nomeAlvo;
        });

        return candidatosPorNome.length === 1 ? candidatosPorNome[0] : null;
    }

    function obterDadosPedidoMensagem(numero, nomeCliente = '') {
        const numeroAlvo = String(numero ?? '').trim();
        const nomeAlvo = String(nomeCliente || '').trim();
        const dadosMemoria = memoriaPedidosGeral[String(numeroAlvo)] || memoriaPedidosGeral[Number(numeroAlvo)] || {};
        const nomeBase = nomeAlvo || dadosMemoria.nome || '';
        const dadosAPI = obterRegistroPedidoExato(numeroAlvo, dadosPedidosAPI, nomeBase);
        const dadosPagamento = obterRegistroPedidoExato(numeroAlvo, pagamentosPedidosAPI) || {};
        return {
            numero: String(numeroAlvo),
            nome: dadosAPI?.nome || dadosMemoria.nome || nomeBase || '',
            endereco: dadosAPI?.endereco || dadosMemoria.endereco || '',
            complemento: dadosAPI?.complemento || '',
            referencia: dadosAPI?.referencia || '',
            formaPagamento: dadosAPI?.formaPagamento || dadosPagamento.formaPagamento || '',
            tipoPagamento: dadosAPI?.tipoPagamento || dadosPagamento.tipoPagamento || '',
            valorPagamento: dadosAPI?.valorPagamento ?? dadosPagamento.valorPagamento,
            trocoPara: dadosAPI?.trocoPara ?? dadosPagamento.trocoPara,
            latitude: dadosAPI?.latitude,
            longitude: dadosAPI?.longitude,
            codigoLocalizador: dadosAPI?.codigoLocalizador || ''
        };
    }

    function formatarValorBRL(valor) {
        const numero = Number(valor);
        return Number.isFinite(numero)
            ? numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            : 'R$ 0,00';
    }

    function gerarInformacaoPagamento(pedido) {
        const forma = pedido.formaPagamento || 'Não informado';
        const tipo = String(pedido.tipoPagamento || '').toUpperCase();
        const formaNormalizada = forma.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const linhas = [`Forma de pagamento: ${forma}`];

        if (tipo === 'ONLINE') {
            linhas.push('🟢 Pedido Pago Online');
        } else if (formaNormalizada.includes('cartao')) {
            linhas.push('🔴 Pedido não pago, Levar Maquininha');
        } else {

            const valor = Number(pedido.valorPagamento);
            const trocoPara = Number(pedido.trocoPara);
            if (Number.isFinite(trocoPara) && Number.isFinite(valor) && trocoPara > valor) {
                linhas.push(`🔴 Pedido não pago, Levar troco de ${formatarValorBRL(trocoPara - valor)}`);
            }
        }

        return linhas.join('\n');
    }

    function pedidoNaoDeveSerEnviado(numero) {
        return false;
    }

    function gerarLinkRota(pedidos, rotaInvertida = false) {
        const pedidosComCoordenadas = pedidos.filter(pedido =>
            Number.isFinite(pedido.latitude) && Number.isFinite(pedido.longitude)
        );
        if (!pedidosComCoordenadas.length) return '';

        const pontosPedidos = pedidosComCoordenadas.map(pedido => `${pedido.latitude},${pedido.longitude}`);
        const pontoLoja = `${LOCALIZACAO_LOJA.latitude},${LOCALIZACAO_LOJA.longitude}`;
        const pontos = rotaInvertida
            ? [...pontosPedidos, pontoLoja]
            : [pontoLoja, ...pontosPedidos];

        return `https://www.google.com/maps/dir/${pontos.join('/')}`;
    }

    function extrairPedidoDaListaRota(li) {
        const dadosCliente = li.querySelector('.right-content-card-data-pedido');
        const numero = dadosCliente?.querySelector('h5')?.innerText?.replace('#', '').trim()
            || li.querySelector('h5')?.innerText?.replace('#', '').trim();
        const nome = dadosCliente?.querySelector(
            '.row-bottom-card-content .row-button-left-side-card h4'
        )?.innerText?.trim()
            || dadosCliente?.querySelector('h4')?.innerText?.trim()
            || li.querySelector('h4')?.innerText?.trim()
            || '';
        return { numero, nome };
    }

    function obterPedidosDaRotaParaEnvio(letra) {
        const modal = document.querySelector('.header-content-rotas.create-rota');
        const pedidosDoModal = modal
            ? Array.from(modal.querySelectorAll('.body-pedidos-content.rotas ul li'))
                .map(extrairPedidoDaListaRota)
                .filter(pedido => pedido.numero)
            : [];

        if (pedidosDoModal.length) return pedidosDoModal;

        console.warn('[Yooga Monitor] Modal da rota sem pedidos; usando banco de dados da letra', letra);
        return (bancoDeDadosRotas[letra] || []).map(numero => ({
            numero,
            nome: memoriaPedidosGeral[String(numero)]?.nome || memoriaPedidosGeral[Number(numero)]?.nome || ''
        }));
    }

    function obterDadosPedidosRota(letra) {
        const pedidosDaRota = obterPedidosDaRotaParaEnvio(letra);
        const pedidosIgnorados = pedidosDaRota.filter(pedido => pedidoNaoDeveSerEnviado(pedido.numero));
        if (pedidosIgnorados.length) {
            console.warn('[Yooga Monitor] Pedidos ignorados por status', pedidosIgnorados);
        }
        const pedidosPermitidos = pedidosDaRota
            .filter(pedido => !pedidoNaoDeveSerEnviado(pedido.numero))
            .map(pedido => obterDadosPedidoMensagem(pedido.numero, pedido.nome));
        if (!pedidosPermitidos.length && pedidosDaRota.length) {
            console.warn('[Yooga Monitor] Filtro removeu todos os pedidos; usando a lista visível da rota', pedidosDaRota);
            return pedidosDaRota.map(pedido => obterDadosPedidoMensagem(pedido.numero, pedido.nome));
        }
        return pedidosPermitidos;
    }

    function gerarMensagemRota(letra, pedidosCapturados = null) {
        const pedidos = pedidosCapturados || obterDadosPedidosRota(letra);
        console.info('[Yooga Monitor] Pedidos usados no envio', pedidos.map(pedido => ({ numero: pedido.numero, nome: pedido.nome })));
        const mensagemPedidos = pedidos.map(pedido => {
            const possuiCoordenadas = pedido.latitude !== null && pedido.longitude !== null &&
                pedido.latitude !== undefined && pedido.longitude !== undefined;
            const localizacao = possuiCoordenadas
                ? [
                    'LOCALIZAÇÃO INDIVIDUAL',
                    `https://www.google.com/maps/search/?api=1&query=${pedido.latitude},${pedido.longitude}`
                ].join('\n')
                : 'Localização do pedido não encontrada na API';
            const formaPagamento = String(pedido.formaPagamento || '').toUpperCase();
            const codigoLocalizador = pedido.codigoLocalizador || '';
            const urlLocalizador = codigoLocalizador && /IFOOD/i.test(formaPagamento)
                ? `https://confirmacao-entrega-propria.ifood.com.br/numero-pedido?cod=${codigoLocalizador}`
                : '';
            const localizadorLinha = urlLocalizador
                ? [
                    'COMFIRMAÇÃO IFOOD',
                    `${urlLocalizador}`,
                    `Localizador: ${codigoLocalizador}`
                ].join('\n')
                : '';

            return [
                `Pedido #${pedido.numero}`,
                `Nome: *${pedido.nome || 'Não informado'}*`,
                `Endereço: ${pedido.endereco || 'Não informado'}`,
                `Complemento: ${pedido.complemento || ''}`,
                `Referência: ${pedido.referencia || ''}`,
                gerarInformacaoPagamento(pedido),
                localizacao,
                localizadorLinha
            ].filter(Boolean).join('\n');
        });
        const linkRota = gerarLinkRota(pedidos, rotasInvertidas[letra] === true);
        const rotaLinha = linkRota ? `*****LINK DA ROTA*****\n${linkRota}` : '';
        return [
            mensagemPedidos.join('\n\n____________________\n\n'),
            rotaLinha
        ].filter(Boolean).join('\n\n');
    }

    function escaparHTML(valor) {
        return String(valor || '').replace(/[&<>'"]/g, caractere => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        })[caractere]);
    }

    window.editarTelefoneEntregador = function(nome, aoSalvar = null) {
        const telefones = obterTelefonesEntregadores();
        const telefoneAtual = telefones[nome] || '';
        document.getElementById('modal-telefone-entregador')?.remove();

        const modal = document.createElement('div');
        modal.id = 'modal-telefone-entregador';
        Object.assign(modal.style, {
            position: 'fixed', left: 0, top: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: '4000000'
        });
        modal.innerHTML = `<div style="background:#fff; width:320px; padding:20px; border-radius:12px; box-shadow:0 12px 35px rgba(0,0,0,.25);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <strong>Telefone do entregador</strong>
                <button id="fechar-telefone-entregador" style="border:0; background:transparent; font-size:20px; cursor:pointer;">&times;</button>
            </div>
            <div style="font-size:13px; color:#555; margin:12px 0 6px;">${escaparHTML(nome)}</div>
            <input id="input-telefone-entregador" type="tel" value="${escaparHTML(telefoneAtual)}" placeholder="(86) 99999-9999" style="width:100%; box-sizing:border-box; padding:10px; border:1px solid #ccc; border-radius:8px; font-size:15px;">
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:15px;">
                <button id="cancelar-telefone-entregador" style="padding:9px 12px; border:1px solid #ccc; background:#fff; border-radius:8px; cursor:pointer;">Cancelar</button>
                <button id="salvar-telefone-entregador" style="padding:9px 12px; border:0; background:#25d366; color:#fff; border-radius:8px; cursor:pointer; font-weight:bold;">Salvar</button>
            </div>
            <div id="erro-telefone-entregador" style="color:#d32f2f; font-size:12px; margin-top:8px; display:none;">Informe um número válido.</div>
        </div>`;
        document.body.appendChild(modal);

        const fechar = () => modal.remove();
        modal.querySelector('#fechar-telefone-entregador').onclick = fechar;
        modal.querySelector('#cancelar-telefone-entregador').onclick = fechar;
        modal.querySelector('#input-telefone-entregador').focus();
        modal.querySelector('#salvar-telefone-entregador').onclick = () => {
            const telefoneNormalizado = normalizarTelefone(modal.querySelector('#input-telefone-entregador').value);
            if (telefoneNormalizado.length < 10) {
                modal.querySelector('#erro-telefone-entregador').style.display = 'block';
                return;
            }
            telefones[nome] = telefoneNormalizado;
            localStorage.setItem(CHAVE_TELEFONES_ENTREGADORES, JSON.stringify(telefones));
            fechar();
            escanearTudo();
            if (aoSalvar) aoSalvar();
        };
    };

    function enviarMensagemNode(letra, nome) {
        const telefone = normalizarTelefone(obterTelefonesEntregadores()[nome]);
        const pedidos = obterDadosPedidosRota(letra);
        const mensagem = gerarMensagemRota(letra, pedidos);
        if (!telefone) return Promise.reject(new Error('Telefone do entregador não cadastrado.'));
        if (!mensagem) return Promise.reject(new Error('Não há pedidos capturados nessa rota.'));

        const corpo = JSON.stringify({ telefone, mensagem, pedidos });
        const url = 'http://localhost:3030/api/mensagem';
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: corpo
        }).then(async resposta => {
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro || `Gateway HTTP ${resposta.status}`);
            return dados;
        });
    }

    window.enviarMensagemEntregador = function(letra, nome) {
        if (!nome || nome === 'Selecionar...') {
            alert('Selecione um entregador antes de enviar a mensagem.');
            return;
        }

        const telefones = obterTelefonesEntregadores();
        let telefone = normalizarTelefone(telefones[nome]);
        if (!telefone) {
            window.editarTelefoneEntregador(nome, () => window.enviarMensagemEntregador(letra, nome));
            return;
        }
        if (!telefone) return;

        if (telefone.length === 10 || telefone.length === 11) telefone = `55${telefone}`;
        enviarMensagemNode(letra, nome)
            .then(() => alert('Mensagem enviada pelo programa Node.js.'))
            .catch(erro => alert(`Não foi possível enviar pelo Node.js: ${erro.message}`));
    };

    window.fazerCliqueYooga = function(tipo, indexEntregador = null) {
        let elemento = null;
        switch(tipo) {
            case 'ABRIR_LISTA_ENTREGADOR':
                menuEntregadorAberto = !menuEntregadorAberto;
                escanearTudo();
                return;
            case 'SELECIONAR_ENTREGADOR':
                const lista = document.querySelectorAll('yooga-filter-select ul li');
                if (indexEntregador !== null && lista[indexEntregador]) elemento = lista[indexEntregador];
                menuEntregadorAberto = false;
                break;
            case 'VOLTAR':
                if (pedidosAdicionadosNestaSessao.size > 0) {
                    pedidosAdicionadosNestaSessao.forEach(id => window.removerPedidoStatus(id, true));
                    pedidosAdicionadosNestaSessao.clear();
                }
                const modalV = document.querySelector('.header-content-rotas.create-rota');
                if (modalV) {
                    const letraV = (modalV.querySelector('.top-title h4')?.innerText || "").replace(/Rota\s+/i, '').trim().toUpperCase();
                    if (letraV && bancoDeDadosRotas[letraV]) {
                        bancoDeDadosRotas[letraV].forEach(id => pedidosFinalizadosInterno.delete(id));
                        delete bancoDeDadosRotas[letraV];
                    }
                }
                elemento = document.querySelector('ion-icon[name="chevron-back-outline"]');
                idsEmEntregaRemovidos.clear();
                setTimeout(escanearTudo, 800);
                break;
            case 'IMPRIMIR': elemento = document.querySelector('button[yooga-tooltip="Imprimir"]'); break;
            case 'LINK': elemento = document.querySelector('button[yooga-tooltip="Copiar link"]'); break;
            case 'FINALIZAR':
                pedidosAdicionadosNestaSessao.clear();
                const modalF = document.querySelector('.header-content-rotas.create-rota');
                if (modalF) {
                    const letraF = (modalF.querySelector('.top-title h4')?.innerText || "").replace(/Rota\s+/i, '').trim().toUpperCase();
                    if (letraF && bancoDeDadosRotas[letraF]) {
                        bancoDeDadosRotas[letraF].forEach(id => pedidosFinalizadosInterno.add(id));
                    }
                }
                elemento = document.querySelector('button.finalizar');
                break;
            case 'DESPACHAR': elemento = document.querySelector('.salvar-e-despachar'); break;
            case 'SALVAR':
                pedidosAdicionadosNestaSessao.clear();
                elemento = document.querySelector('button.salvar.outline:not([yooga-tooltip])') ||
                           document.querySelector('button.salvar.only-salvar') ||
                           document.querySelector('button.salvar:not([yooga-tooltip])');
                break;
            case 'FECHAR_NATIVO':
                elemento = document.querySelector('ion-icon[name="close-outline"]');
                break;
        }

        const executarClique = () => {
            if (!elemento) return;
            ['mousedown', 'mouseup', 'click'].forEach(name => {
                elemento.dispatchEvent(new MouseEvent(name, { bubbles: true, cancelable: true, view: window }));
            });
            if (tipo === 'SALVAR' && idsEmEntregaRemovidos.size > 0) {
                setTimeout(() => { location.reload(); }, 1200);
                return;
            }
            setTimeout(escanearTudo, 400);
        };

        const modalDespacho = document.querySelector('.header-content-rotas.create-rota');
        const nomeDespacho = modalDespacho?.querySelector('.value-filter')?.innerText?.trim() || '';
        if (tipo === 'DESPACHAR' && entregadorTemEnvioAutomatico(nomeDespacho)) {
            const letraDespacho = (modalDespacho?.querySelector('.top-title h4')?.innerText || '')
                .replace(/Rota\s+/i, '').trim().toUpperCase();
            enviarMensagemNode(letraDespacho, nomeDespacho)
                .then(executarClique)
                .catch(erro => alert(`Não foi possível enviar pelo Node.js: ${erro.message}`));
            return;
        }

        executarClique();
    };

    function capturarLocalizacaoDoPino(elemento, numeroPedido) {
        const elementos = [elemento, elemento?.parentElement, elemento?.parentElement?.parentElement].filter(Boolean);
        let latitude = null;
        let longitude = null;

        for (const item of elementos) {
            const atributos = [
                ['data-latitude', 'data-longitude'],
                ['data-lat', 'data-lng'],
                ['latitude', 'longitude'],
                ['lat', 'lng']
            ];
            for (const [chaveLat, chaveLng] of atributos) {
                const lat = item.getAttribute?.(chaveLat) || item.dataset?.[chaveLat.replace('data-', '')];
                const lng = item.getAttribute?.(chaveLng) || item.dataset?.[chaveLng.replace('data-', '')];
                if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
                    latitude = Number(lat);
                    longitude = Number(lng);
                }
            }

            const posicao = item.getAttribute?.('data-position') || item.getAttribute?.('data-coordinates');
            const partes = posicao?.match(/(-?\d+(?:\.\d+)?)[, ]+(-?\d+(?:\.\d+)?)/);
            if (partes) {
                latitude = Number(partes[1]);
                longitude = Number(partes[2]);
            }
        }

        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            const dadosAtuais = dadosPedidosAPI[String(numeroPedido)] || { numero: String(numeroPedido) };
            dadosPedidosAPI[String(numeroPedido)] = { ...dadosAtuais, latitude, longitude };
        }
    }

    function clicarNoPinoMapa(numeroPedido) {
        pedidosAdicionadosNestaSessao.add(numeroPedido);
        pedidosFinalizadosInterno.delete(numeroPedido);
        const regex = new RegExp(`(^|\\D)${numeroPedido}(\\D|$)`);
        const todos = document.querySelectorAll('[aria-label], [title], .leaflet-marker-icon, h5, .marker-label, .number-order, .order-number');
        let el = Array.from(todos).find(e => regex.test((e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || "").trim()));
        if (el) {
            capturarLocalizacaoDoPino(el, numeroPedido);
            ['mousedown', 'mouseup', 'click'].forEach(ev => el.dispatchEvent(new MouseEvent(ev, {bubbles:true})));
            setTimeout(() => {
                capturarLocalizacaoDoPino(el, numeroPedido);
                escanearTudo();
            }, 400);
        }
    }

    window.removerPedidoStatus = function(numeroPedido, isLimpezaRapida = false) {
        const dadosPedido = memoriaPedidosGeral[numeroPedido];
        if (dadosPedido && (dadosPedido.statusLabel?.toLowerCase().includes('entrega') || dadosPedido.statusLabel?.toLowerCase().includes('despachado'))) {
            idsEmEntregaRemovidos.add(numeroPedido);
        }
        pedidosFinalizadosInterno.delete(numeroPedido);
        pedidosAdicionadosNestaSessao.delete(numeroPedido);

        const itensLista = document.querySelectorAll('div.body-pedidos-content.rotas div ul li');
        let botaoEncontrado = null;
        itensLista.forEach(li => {
            const h5 = li.querySelector('h5');
            if (h5 && h5.innerText.includes(numeroPedido)) {
                botaoEncontrado = li.querySelector('div.left-content-card-delete-button button');
            }
        });

        if (botaoEncontrado) {
            ['mousedown', 'mouseup', 'click'].forEach(ev => botaoEncontrado.dispatchEvent(new MouseEvent(ev, {bubbles:true})));
            Object.keys(bancoDeDadosRotas).forEach(l => {
                bancoDeDadosRotas[l] = (bancoDeDadosRotas[l] || []).filter(id => id !== numeroPedido);
            });
            if (!isLimpezaRapida) setTimeout(escanearTudo, 500);
        } else if (!isLimpezaRapida) {
            clicarNoPinoMapa(numeroPedido);
        }
    };

    function escanearTudo() {
        injetarBotoesProntoNosCards();

        let idsAtivosNoYooga = new Set();
        let rotasAtuaisNaTela = new Set();

        document.querySelectorAll('delivery-order').forEach(card => {
            const num = card.querySelector('.left-side p')?.innerText?.replace('#', '').trim();
            const nome = card.querySelector('.bottom-group p, h4')?.innerText?.trim();
            const rotaRaw = card.querySelector('.badge-neutral span')?.innerText?.trim() || "";

            const horaEl = card.querySelector('.bottom-group .medium small span:nth-child(1)');
            const resTempo = calcularDiferencaMinutos(horaEl ? horaEl.innerText.trim() : "");

            const statusCard = card.querySelector('.badge-neutral span, ion-badge')?.innerText?.trim() || "";
            const statusAPI = obterStatusAPI(num);
            const statusDetectado = statusAPIFinalizado(statusAPI) ? statusAPI : statusCard;

            if (num && nome) {
                idsAtivosNoYooga.add(num);
                if (!memoriaPedidosGeral[num]) memoriaPedidosGeral[num] = { num, nome };
                memoriaPedidosGeral[num].tempoReal = resTempo.texto;
                memoriaPedidosGeral[num].minutosNum = resTempo.min;
                if (statusDetectado) memoriaPedidosGeral[num].statusLabel = statusDetectado;

                registrarMudaStatus(num, statusDetectado);

                if (rotaRaw.includes('Rota')) {
                    const letra = rotaRaw.replace(/Rota\s+/i, '').trim().toUpperCase();
                    rotasAtuaisNaTela.add(letra);
                    if (!bancoDeDadosRotas[letra]) bancoDeDadosRotas[letra] = [];
                    if (!bancoDeDadosRotas[letra].includes(num)) {
                        Object.keys(bancoDeDadosRotas).forEach(l => { if(l !== letra) bancoDeDadosRotas[l] = (bancoDeDadosRotas[l] || []).filter(id => id !== num); });
                        bancoDeDadosRotas[letra].push(num);
                    }
                }
            }
        });

        const listaDiv = document.getElementById('lista-viva');
        const painel = document.getElementById('painel-viva');
        if (!listaDiv || !painel) return;

        const scrollGeral = listaDiv.scrollTop;
        const divScrollEntregadores = document.getElementById('scroll-entregadores');
        if (divScrollEntregadores) scrollMenuEntregador = divScrollEntregadores.scrollTop;

        rotasVistasNaUltimaVez.forEach(letraAntiga => {
            if (!rotasAtuaisNaTela.has(letraAntiga)) {
                if (bancoDeDadosRotas[letraAntiga]) {
                    bancoDeDadosRotas[letraAntiga].forEach(id => { pedidosFinalizadosInterno.add(id); });
                    delete bancoDeDadosRotas[letraAntiga];
                }
            }
        });
        rotasVistasNaUltimaVez = rotasAtuaisNaTela;

        const modalAtivo = document.querySelector('.header-content-rotas.create-rota');
        let letraNoModal = null, entregadorAtual = "Selecionar...";

        if (modalAtivo) {
            letraNoModal = (modalAtivo.querySelector('.top-title h4')?.innerText || "").replace(/Rota\s+/i, '').trim().toUpperCase();
            entregadorAtual = modalAtivo.querySelector('.value-filter')?.innerText?.trim() || "Selecionar...";
            if (letraNoModal) {
                rotasAtuaisNaTela.add(letraNoModal);
                const itensDaRota = Array.from(document.querySelectorAll('.body-pedidos-content.rotas ul li'))
                    .map((li, indice) => ({ li, indice, ordem: obterOrdemEntrega(li, indice) }))
                    .sort((a, b) => a.ordem - b.ordem || a.indice - b.indice);
                const idsNaListaDesteModal = [];
                itensDaRota.forEach(({ li }) => {
                    const pedidoDaLista = extrairPedidoDaListaRota(li);
                    const num = pedidoDaLista.numero;
                    const nomeCompleto = pedidoDaLista.nome;
                    const statusLi = li.querySelector('.tags-right-content ion-badge')?.innerText?.trim() || "";

                    if (num) {
                        idsAtivosNoYooga.add(num);
                        idsNaListaDesteModal.push(num);
                        idsEmEntregaRemovidos.delete(num);
                        if(!memoriaPedidosGeral[num]) memoriaPedidosGeral[num] = { num: num };
                        if (nomeCompleto) memoriaPedidosGeral[num].nome = nomeCompleto;
                        memoriaPedidosGeral[num].statusLabel = statusLi;
                        memoriaPedidosGeral[num].endereco = li.querySelector('.row-button-left-side-card p')?.innerText?.trim() || "";

                        registrarMudaStatus(num, statusLi);
                    }
                });
                bancoDeDadosRotas[letraNoModal] = idsNaListaDesteModal;
                if (!(letraNoModal in rotasInvertidas)) {
                    rotasInvertidas[letraNoModal] = ultimaRotaFoiInvertida;
                }
                console.info('[Yooga Monitor] Pedidos da rota usados no link', idsNaListaDesteModal.map(numero => ({
                    numero,
                    nome: memoriaPedidosGeral[numero]?.nome || ''
                })));
            }
        }

        let html = "";
        html += gerarHTMLDashboardMedias();

        let idsEmAlgumaRota = new Set();
        Object.values(bancoDeDadosRotas).forEach(lista => lista.forEach(id => { if (idsAtivosNoYooga.has(id)) idsEmAlgumaRota.add(id); }));

        if (modalAtivo && letraNoModal) {
            const corHeader = window.getComputedStyle(document.querySelector('.rota-circle') || modalAtivo).backgroundColor;
            html += `<div style="border: 2px solid ${corHeader}; border-radius: 12px; margin: 0 0 15px 0; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.1); position: relative;">
                <div style="background: ${corHeader}; color: white; padding: 15px; text-align:center; border-radius: 10px 10px 0 0;">
                    <span onclick="fazerCliqueYooga('VOLTAR');" style="cursor:pointer; position:absolute; left:15px; top:15px; font-size:24px;">⬅</span>
                    <div style="font-size:16px; font-weight:bold;">ROTA ${letraNoModal}</div>
                    <div style="display:inline-flex; align-items:center; gap:6px; margin-top:12px; max-width:90%;">
                        <div onclick="window.fazerCliqueYooga('ABRIR_LISTA_ENTREGADOR')" style="background: white; padding: 10px 18px; border-radius: 30px; font-size: 14px; cursor: pointer; color: #333; font-weight:bold; border: 2px solid #ddd; max-width:260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">👤 <strong>${entregadorAtual}</strong> ▾</div>
                        <label title="Enviar automaticamente ao despachar" style="display:inline-flex; align-items:center; gap:4px; color:#fff; font-size:18px; cursor:pointer;">
                            <input class="toggle-envio-automatico-entregador" data-entregador="${escaparHTML(entregadorAtual)}" type="checkbox" ${entregadorTemEnvioAutomatico(entregadorAtual) ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer;">
                            ⚡
                        </label>
                        <button class="btn-editar-telefone-entregador" data-entregador="${escaparHTML(entregadorAtual)}" title="Editar telefone do entregador" style="background:#fff; border:2px solid #ddd; border-radius:50%; width:34px; height:34px; cursor:pointer; font-size:17px;">✎</button>
                    </div>
                </div>`;

            if (menuEntregadorAberto) {
                html += `<div id="scroll-entregadores" style="position: absolute; top: 95px; left: 50%; transform: translateX(-50%); width: 85%; background: white; z-index: 10000; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); border: 1px solid #ddd; max-height: 200px; overflow-y: auto;">`;
                document.querySelectorAll('yooga-filter-select ul li').forEach((li, idx) => {
                    html += `<div onclick="window.fazerCliqueYooga('SELECIONAR_ENTREGADOR', ${idx})" style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; cursor: pointer; font-size: 13px; color: #333; text-align: left; background: white;">👤 ${li.innerText.trim()}</div>`;
                });
                html += `</div>`;
            }

            html += `<div id="scroll-pedidos-rota" style="padding: 8px; max-height: 350px; overflow-y: auto;">`;
            (bancoDeDadosRotas[letraNoModal] || []).forEach(n => {
                const p = memoriaPedidosGeral[n] || { num: n, nome: "Carregando..." };
                const corStatus = p.statusLabel?.toLowerCase().includes('preparando') ? '#ff9800' : '#2196f3';
                const corTempo = obterCorPorTempo(p.minutosNum);

                html += `<div class="item-p" data-num="${n}" style="padding: 12px; border-bottom: 1px solid #f0f0f0; cursor:pointer; position: relative;">
                    <span onclick="event.stopPropagation(); removerPedidoStatus('${n}')" style="position: absolute; top: 14px; left: 6px; color: #f44336; font-weight: bold; background:#ffebee; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:12px;">✕</span>
                    <div style="margin-left: 30px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size: 14px;"><strong>#${n}</strong> ${p.nome}</span>
                            <span style="font-size: 11px; color:white; background:${corStatus}; padding:3px 8px; border-radius:5px; font-weight:bold;">${p.statusLabel || ''}</span>
                        </div>
                        <div style="font-size: 12px; color: #555; margin-top: 4px;">📍 ${p.endereco || ''}</div>
                        <div style="font-size: 11px; color: ${corTempo}; margin-top: 3px; font-weight:bold;">🕒 ${p.tempoReal || 'Calculando...'}</div>
                    </div>
                </div>`;
            });
            html += `</div><div style="display: flex; gap: 8px; padding: 12px; background: #fafafa; border-top: 1px solid #eee; justify-content: flex-end;">`;
            if (!entregadorTemEnvioAutomatico(entregadorAtual)) html += `<button class="btn-enviar-mensagem-entregador" data-rota="${escaparHTML(letraNoModal)}" data-entregador="${escaparHTML(entregadorAtual)}" title="Enviar rota ao entregador pelo Node.js" style="background:#25d366; color:#fff; border:none; padding:10px; border-radius:10px; font-size:18px; cursor:pointer;">💬</button>`;
            if (document.querySelector('button[yooga-tooltip="Imprimir"]')) html += `<button onclick="fazerCliqueYooga('IMPRIMIR')" style="background:#fff; border:1px solid #ccc; padding:10px; border-radius:10px; font-size:18px;">🖨️</button>`;
            if (document.querySelector('button[yooga-tooltip="Copiar link"]')) html += `<button onclick="fazerCliqueYooga('LINK')" style="background:#fff; border:1px solid #ccc; padding:10px; border-radius:10px; font-size:18px;">🔗</button>`;
            if (document.querySelector('.finalizar')) html += `<button onclick="fazerCliqueYooga('FINALIZAR')" style="background:#f44336; color:white; border:none; padding:12px 15px; border-radius:10px; font-size:12px; font-weight:900;">FINALIZAR</button>`;
            if (document.querySelector('button.salvar')) {
                const labelSalvar = idsEmEntregaRemovidos.size > 0 ? "SALVAR E ATUALIZAR" : "SALVAR";
                html += `<button onclick="fazerCliqueYooga('SALVAR')" style="background:#2196f3; color:white; border:none; padding:12px 15px; border-radius:10px; font-size:12px; font-weight:900;">${labelSalvar}</button>`;
            }
            if (document.querySelector('.salvar-e-despachar')) html += `<button onclick="fazerCliqueYooga('DESPACHAR')" style="background:#4caf50; color:white; border:none; padding:12px 15px; border-radius:10px; font-size:12px; font-weight:900;">SALVAR E DESPACHAR</button>`;
            html += `</div></div>`;
        }

        html += `<div style="font-size: 13px; font-weight: 900; color: #000; margin: 15px 0 10px 0; padding-left:5px; border-top: 1px solid #eee; padding-top: 10px;">Rotas Ativas 🏍️</div>`;
        document.querySelectorAll('.list-rotas > ul > li').forEach(li => {
            const elL = li.querySelector('.top-left-content-box > p');
            if (elL) {
                const letra = elL.querySelector('span')?.innerText.trim().toUpperCase();
                rotasAtuaisNaTela.add(letra);
                const statusRota = li.querySelector('.top-right-content-box ion-badge')?.innerText.trim() || "";
                const entregador = li.querySelector('.left-bottom-content-box h6')?.innerText.trim() || "Sem entregador";
                const tempoRota = li.querySelector('.left-bottom-content-box p')?.innerText.trim() || "";
                const quantidade = (li.querySelector('.right-bottom-content-box')?.innerText || "0").replace(/\D/g, "");

                if (letra !== letraNoModal) {
                   const corStatusRota = statusRota.toLowerCase().includes('preparando') ? '#ff9800' : '#2196f3';
                   html += `<div onclick="window.abrirRotaNoYooga('${letra}')" style="margin-bottom: 12px; border-radius: 12px; border: 1px solid #ddd; background: white; padding: 15px; border-left: 12px solid ${window.getComputedStyle(elL).backgroundColor}; cursor: pointer;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div><strong style="font-size: 16px;">Rota ${letra}</strong><span style="font-size: 11px; color:white; background:${corStatusRota}; padding:3px 8px; border-radius:12px; font-weight:bold; margin-left:5px;">${statusRota}</span><div style="font-size: 13px; color: #000; margin-top:5px;">👤 <strong>${entregador}</strong> | 🕒 ${tempoRota}</div></div>
                            <span style="font-size: 14px; background: #f0f0f0; padding: 4px 10px; border-radius: 12px; font-weight:bold;">${quantidade}</span>
                        </div>
                    </div>`;
                }
            }
        });

        let avulsos = Object.values(memoriaPedidosGeral).filter(p =>
            idsAtivosNoYooga.has(p.num) &&
            !idsEmAlgumaRota.has(p.num) &&
            !pedidosFinalizadosInterno.has(p.num) &&
            pedidosProntos.has(p.num)
        );

        if (avulsos.length > 0) {
            html += `<div style="font-size: 13px; font-weight: 900; color: #ff5722; margin: 10px 0; padding-left:5px;">📦 DISPONÍVEIS (${avulsos.length})</div>`;
            avulsos.forEach(p => {
                const corTempoAvulso = obterCorPorTempo(p.minutosNum);
                html += `<div class="item-p" data-num="${p.num}" style="padding: 12px; background: white; border: 1px solid #eee; border-radius: 10px; margin-bottom: 8px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.05); display:flex; justify-content:space-between; align-items:center;">
                    <span><strong>#${p.num}</strong> ${p.nome}</span>
                    <span style="font-size: 11px; color: ${corTempoAvulso}; font-weight:bold;">${p.tempoReal}</span>
                </div>`;
            });
        }

        listaDiv.innerHTML = html;

        listaDiv.querySelectorAll('.btn-editar-telefone-entregador').forEach(botao => {
            botao.onclick = (evento) => {
                evento.stopPropagation();
                window.editarTelefoneEntregador(botao.dataset.entregador);
            };
        });
        listaDiv.querySelectorAll('.toggle-envio-automatico-entregador').forEach(controle => {
            controle.onchange = evento => {
                evento.stopPropagation();
                alternarEnvioAutomaticoEntregador(controle.dataset.entregador, controle.checked);
            };
        });
        listaDiv.querySelectorAll('.btn-enviar-mensagem-entregador').forEach(botao => {
            botao.onclick = (evento) => {
                evento.stopPropagation();
                window.enviarMensagemEntregador(botao.dataset.rota, botao.dataset.entregador);
            };
        });

        listaDiv.scrollTop = scrollGeral;
        const novoDivScrollEntregadores = document.getElementById('scroll-entregadores');
        if (novoDivScrollEntregadores) novoDivScrollEntregadores.scrollTop = scrollMenuEntregador;

        listaDiv.querySelectorAll('.item-p').forEach(el => el.onclick = (e) => {
            if(!e.target.innerText.includes('✕')) { e.stopPropagation(); clicarNoPinoMapa(el.dataset.num); }
        });
    }

    window.abrirRotaNoYooga = (letra) => {
        document.querySelectorAll('.list-rotas > ul > li').forEach(li => {
            if (li.querySelector('.top-left-content-box p')?.innerText.toUpperCase().includes(`ROTA ${letra}`)) {
                ['mousedown', 'mouseup', 'click'].forEach(t => li.dispatchEvent(new MouseEvent(t, { bubbles: true })));
            }
        });
        setTimeout(escanearTudo, 300);
    };

    function criarInterface() {
        if (document.getElementById('painel-viva')) return;
        const painel = document.createElement('div'); painel.id = 'painel-viva';
        Object.assign(painel.style, { position: 'fixed', top: '0px', width: '480px', height: '85vh', background: 'rgb(248, 248, 248)', borderRadius: '15px', zIndex: '2000000', boxShadow: 'rgba(0, 0, 0, 0.2) 0px 15px 40px', fontFamily: 'sans-serif', border: '1px solid rgb(221, 221, 221)', display: 'none', flexDirection: 'column', left: '94px' });

        painel.innerHTML = `
            <div id="painel-viva-h" style="padding:15px; background:#fff; cursor:move; border-radius:15px 15px 0 0; display:flex; justify-content:space-between; border-bottom:1px solid #eee; align-items:center; flex-shrink: 0;">
                <span style="color:#ff5722; font-weight:900; font-size:16px;">🍦 MONITOR V103</span>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <span id="btn-atualizar-viva" title="Atualizar Página" style="font-size:22px; color:#2196f3; cursor:pointer; font-weight:bold;">↻</span>
                    <span id="btn-minimizar-viva" style="font-size:28px; color:#ccc; cursor:pointer;">&mdash;</span>
                    <span id="btn-fechar-viva" style="font-size:24px; color:#ccc; cursor:pointer;">&times;</span>
                </div>
            </div>
            <div id="lista-viva" style="padding:15px; overflow-y:auto; flex-grow: 1;"></div>
        `;
        document.body.appendChild(painel);

        let isDragging = false, offset = [0,0];
        const h = document.getElementById('painel-viva-h');
        h.onmousedown = (e) => { isDragging = true; offset = [painel.offsetLeft - e.clientX, painel.offsetTop - e.clientY]; };
        document.onmousemove = (e) => { if (isDragging) { painel.style.left = (e.clientX + offset[0]) + 'px'; painel.style.top = (e.clientY + offset[1]) + 'px'; } };
        document.onmouseup = () => { isDragging = false; };

        const btnR = document.createElement('div'); btnR.id = 'btn-reabrir';
        Object.assign(btnR.style, { position:'fixed', bottom:'80px', right:'20px', padding:'12px 25px', background:'#ff5722', color:'white', borderRadius:'30px', cursor:'pointer', fontWeight:'bold', zIndex:'2000001', display:'none', boxShadow:'0 4px 15px rgba(255,87,34,0.4)' });
        btnR.innerHTML = `📋 Ver Pedidos`; document.body.appendChild(btnR);

        const btnCriarRota = document.createElement('button'); btnCriarRota.id = 'btn-criar-rota';
        Object.assign(btnCriarRota.style, { marginLeft: '12px', padding: '8px 10px', background:'#4caf50', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'700' });
        btnCriarRota.innerText = 'Criar Rota';
        h.querySelector('div').insertBefore(btnCriarRota, document.getElementById('btn-atualizar-viva'));
        btnCriarRota.onclick = () => { window.abrirModalCriarRota(); };

        document.getElementById('btn-atualizar-viva').onclick = () => { location.reload(); };
        document.getElementById('btn-minimizar-viva').onclick = () => { painel.style.display='none'; btnR.style.display='flex'; };

        document.getElementById('btn-fechar-viva').onclick = () => {
            painel.style.display='none';
            btnR.style.display='none';
            window.fazerCliqueYooga('FECHAR_NATIVO');
        };

        btnR.onclick = () => { painel.style.display='flex'; btnR.style.display='none'; escanearTudo(); };

        document.addEventListener('click', (e) => {
            if (e.target.closest('.topbar-button') || e.target.closest('.list-rotas ul li') || e.target.closest('.leaflet-marker-icon')) {
                setTimeout(() => {
                    painel.style.display = 'flex';
                    btnR.style.display = 'none';
                    escanearTudo();
                }, 400);
            }
        });

        setInterval(() => {
            injetarBotoesProntoNosCards();
            escanearTudo();
        }, 2000);
    }

    window.abrirModalCriarRota = function() {
        if (document.getElementById('modal-criar-rota')) return;
        const overlay = document.createElement('div'); overlay.id = 'modal-criar-rota';
        Object.assign(overlay.style, { position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: '3000000' });
        overlay.innerHTML = `<div style="background:#fff; padding:18px; border-radius:12px; width:320px; box-shadow:0 12px 30px rgba(0,0,0,0.25);">
            <div style='display:flex; justify-content:space-between; align-items:center;'><h3 style='margin:0; font-size:16px;'>Quantos pedidos nessa rota ?</h3><button id='btn-cancel-rota' style='background:transparent;border:none;font-size:18px;cursor:pointer;'>✕</button></div>
            <div style='margin-top:12px; display:flex; gap:8px; align-items:center;'><input id='input-qtd-rota' type='number' min='1' placeholder='Número de pedidos' style='flex:1;padding:8px;border:1px solid #ddd;border-radius:8px;font-size:14px;'/></div>
            <div style='display:flex; justify-content:flex-end; gap:8px; margin-top:14px;'><button id='btn-confirm-rota' style='background:#2196f3;color:#fff;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:700;'>Criar</button></div>
        </div>`;
        document.body.appendChild(overlay);
        document.getElementById('btn-cancel-rota').onclick = window.fecharModalCriarRota;
        document.getElementById('btn-confirm-rota').onclick = () => {
            const v = parseInt(document.getElementById('input-qtd-rota').value, 10) || 0;
            window.fecharModalCriarRota();
            if (v > 0) window.criarRotaAutomatica(v);
        };
        const inputQtd = document.getElementById('input-qtd-rota');
        if (inputQtd) {
            inputQtd.focus();
            inputQtd.addEventListener('keydown', (e) => { if (e.key === 'Enter') { document.getElementById('btn-confirm-rota').click(); } });
        }
    };

    window.fecharModalCriarRota = function() { const m = document.getElementById('modal-criar-rota'); if (m) m.remove(); };

    function obterCoordenadasPedido(numero) {
        const dados = dadosPedidosAPI[String(numero)] || {};
        const latitude = Number(dados.latitude);
        const longitude = Number(dados.longitude);
        return Number.isFinite(latitude) && Number.isFinite(longitude)
            ? { latitude, longitude }
            : null;
    }

    function calcularDistanciaEntrePontos(primeiro, segundo) {
        const raioTerraKm = 6371;
        const latitude1 = primeiro.latitude * Math.PI / 180;
        const latitude2 = segundo.latitude * Math.PI / 180;
        const diferencaLatitude = (segundo.latitude - primeiro.latitude) * Math.PI / 180;
        const diferencaLongitude = (segundo.longitude - primeiro.longitude) * Math.PI / 180;
        const a = Math.sin(diferencaLatitude / 2) ** 2 +
            Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(diferencaLongitude / 2) ** 2;
        return 2 * raioTerraKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function ordenarPedidosPorProximidade(pedidos) {
        ultimaRotaFoiInvertida = false;
        const pedidosComLocalizacao = pedidos.filter(pedido => pedido.localizacao);
        const pedidosSemLocalizacao = pedidos.filter(pedido => !pedido.localizacao);
        if (pedidosComLocalizacao.length < 2) return pedidos;

        const montarRota = pedidoInicial => {
            const rota = pedidoInicial ? [pedidoInicial] : [];
            let pontoAtual = pedidoInicial?.localizacao || LOCALIZACAO_LOJA;
            let restantes = pedidosComLocalizacao.filter(pedido => pedido !== pedidoInicial);

            while (restantes.length) {
                let indiceMaisProximo = 0;
                let menorDistancia = calcularDistanciaEntrePontos(pontoAtual, restantes[0].localizacao);

                restantes.forEach((pedido, indice) => {
                    const distancia = calcularDistanciaEntrePontos(pontoAtual, pedido.localizacao);
                    if (distancia < menorDistancia) {
                        menorDistancia = distancia;
                        indiceMaisProximo = indice;
                    }
                });

                const proximoPedido = restantes.splice(indiceMaisProximo, 1)[0];
                rota.push(proximoPedido);
                pontoAtual = proximoPedido.localizacao;
            }

            return rota;
        };

        let rotaOrdenada = montarRota(null);

        const ultimoPedido = rotaOrdenada[rotaOrdenada.length - 1];
        const atrasoUltimo = Number(memoriaPedidosGeral[ultimoPedido.num]?.minutosNum);
        const atrasosDosDemais = rotaOrdenada
            .slice(0, -1)
            .map(pedido => Number(memoriaPedidosGeral[pedido.num]?.minutosNum))
            .filter(Number.isFinite);

        if (Number.isFinite(atrasoUltimo) && atrasosDosDemais.length &&
            atrasosDosDemais.every(atraso => atrasoUltimo > atraso)) {
            rotaOrdenada = montarRota(ultimoPedido);
            ultimaRotaFoiInvertida = true;
        }

        return [...rotaOrdenada, ...pedidosSemLocalizacao];
    }

    window.criarRotaAutomatica = async function(qtd) {
        const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
        let selecionados = 0;

        const idsEmRotas = () => { const s = new Set(); Object.values(bancoDeDadosRotas).forEach(arr => (arr||[]).forEach(id => s.add(id))); return s; };

        const pedidosEls = Array.from(document.querySelectorAll('delivery-order'))
            .map(el => {
                const num = (el.querySelector('.left-side p')?.innerText || '').replace('#', '').trim();
                return { el, num, localizacao: obterCoordenadasPedido(num) };
            })
            .filter(x => x.num && !idsEmRotas().has(x.num) && !pedidosFinalizadosInterno.has(x.num));

        pedidosEls.splice(0, pedidosEls.length, ...ordenarPedidosPorProximidade(pedidosEls));

        for (const p of pedidosEls) {
            if (selecionados >= qtd) break;
            const num = p.num;
            clicarNoPinoMapa(num);
            await sleep(700);
            if (idsEmRotas().has(num)) {
                selecionados++;
            } else {
                pedidosAdicionadosNestaSessao.delete(num);
            }
        }
        alert(`Selecionados ${selecionados} pedidos para a rota.`);
    };

    setTimeout(() => {
        criarInterface();
        injetarBotoesProntoNosCards();
    }, 1500);
})();
