PAG.politicas = el => {
  const li = t => `<div class="l" style="display:block"><span style="color:var(--tinta)">${t}</span></div>`;
  const ad = '<span class="ps p-analise">a definir</span>';
  el.innerHTML = `<p class="txt-app">Resumo do que a cliente vê no site.</p>
    <div class="info-tit">Agendamento</div>
    <div class="info">${['Pelo site: antecedência mínima de 24 horas. Pela equipe: inclusive no mesmo dia.', 'Horário reservado por 15 minutos para o Pix e o comprovante.', 'Sinal de 30% ou valor integral; ou pagamento no estúdio quando combinado com a equipe.', 'Pagamento confirmado só por Saara ou Julianny, depois de conferir o banco.', 'Intervalo de 15 minutos entre atendimentos. Sábado: almoço das 12h às 14h.'].map(li).join('')}</div>
    <div class="info-tit">Cancelamento</div>
    <div class="info">${['Pedido pelo site (Meu agendamento) ou pelo WhatsApp.', 'Cada pedido é analisado por Saara ou Julianny, com registro da decisão e de eventual reembolso.', 'O sinal não é perdido automaticamente.', 'Agendamentos feitos pelo site podem ter direito de arrependimento em até 7 dias (art. 49 do CDC), quando aplicável.'].map(li).join('')}</div>
    <div class="info-tit">Reagendamento, atrasos e faltas</div>
    <div class="info">${['A cliente reagenda pelo site com 24 horas ou mais de antecedência. Com menos, o pedido passa por avaliação.', 'Tolerância de atraso: 15 minutos. Depois disso, a equipe avalia se ainda é possível atender ou propõe outro horário. Nada é cancelado automaticamente.', 'Falta é registrada como "Não compareceu". Valores pagos não são retidos automaticamente.'].map(li).join('')}</div>
    <div class="info-tit">Privacidade</div>
    <div class="info">${['Só nome, WhatsApp e comprovante são pedidos. Sem CPF ou senha.', 'Acesso aos dados apenas de Saara e Julianny.', 'A cliente pode pedir correção ou exclusão pelo WhatsApp.', 'Prazo de guarda dos comprovantes ' + ad].map(li).join('')}</div>
    <p class="txt-app">Este texto é um rascunho. Vale uma revisão com orientação jurídica antes de publicar.</p>
    <a class="bt sec" href="#politicas">Ver como aparece no site</a>`;
};
PAG.solicitacoes = el => {
  const pend = D.solic.filter(s => s.status === 'pendente').sort((a,b) => b.t - a.t), dec = D.solic.filter(s => s.status === 'decidida').sort((a,b) => (b.tDecisao || b.t) - (a.tDecisao || a.t));
  const l = app.solAba === 'decididas' ? dec : pend;
  el.innerHTML = `<div class="segm"><button data-sa="pendentes" aria-pressed="${app.solAba !== 'decididas'}">Pendentes <span class="num">${pend.length}</span></button><button data-sa="decididas" aria-pressed="${app.solAba === 'decididas'}">Decididas <span class="num">${dec.length}</span></button></div>
    <p class="txt-app">Pedidos de cancelamento e reagendamento feitos pelo site, recebidos pelo WhatsApp ou decididos pela equipe.</p>
    ${l.length ? `<div class="rows">${l.map(s => { const r = D.reservas.find(x => x.id === s.res); return `<button class="row" data-sl="${s.id}"><span class="av">${ini(nomeCli(r))}</span><span class="m"><b>${esc(nomeCli(r))}</b><span>${s.tipo === 'cancelamento' ? 'Cancelamento' : 'Reagendamento'} · ${esc(s.origem)} · ${dataCurta(s.t)}${s.exemplo ? ' · exemplo' : ''}</span></span><span class="d">${s.status === 'pendente' ? '<span class="ps p-analise">Pendente</span>' : ''}${ic('chev', 18)}</span></button>`; }).join('')}</div>`
      : `<div class="rows">${vazioApp('conferir', app.solAba === 'decididas' ? 'Nenhuma decisão ainda' : 'Nenhum pedido pendente')}</div>`}`;
  $$('[data-sa]', el).forEach(b => b.onclick = () => { app.solAba = b.dataset.sa; reApp(); });
  $$('[data-sl]', el).forEach(b => b.onclick = () => abrirSolic(b.dataset.sl));
};
