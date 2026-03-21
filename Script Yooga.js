// ==UserScript==
// @name         Confirmar Pedido Yooga - V66.1
// @version      66.1
// @description  Bloqueio por nome Mateus + Auto-update via GitHub.
// @author       Seu Nome
// @match        *://app.yooga.com.br/*
// @match        *://confirmacao-entrega-propria.ifood.com.br/*
// @updateURL    https://raw.githubusercontent.com/mateus0855/Scripityoogaandoid/refs/heads/main/Script%20Yooga.js
// @downloadURL  https://raw.githubusercontent.com/mateus0855/Scripityoogaandoid/refs/heads/main/Script%20Yooga.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const URL_MESAS_YOOGA = "https://app.yooga.com.br/mesas/delivery";
    const SENHA_MATEUS = "Theus@2806";

    // --- 1. LÓGICA DE SEGURANÇA (POR NOME) ---
    setInterval(() => {
        const selectEntregador = document.querySelector('select.ng-valid.ng-dirty.ng-touched') || 
                                 document.querySelector('select[formcontrolname="deliveryman"]') ||
                                 document.querySelector('select');
        
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
    }, 500);

    // --- 2. BOTÃO IFOOD NO DELIVERY ---
    setInterval(() => {
        if (window.location.href.includes("/delivery") && !document.getElementById("btn-confirmar-yooga")) {
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
    }, 1000);

    // --- 3. LÓGICA NO IFOOD ---
    if (window.location.href.includes("ifood.com.br")) {
        const monitorIfood = setInterval(() => {
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
        }, 1000);
    }
})();
