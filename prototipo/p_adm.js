function seletorHorario(pn, dur, ignorar, aoEscolher, equipe){
  let dia = null, hora = null;
  const pintar = () => {
    const box = $('#shSlots', pn);
    if (!dia){ box.innerHTML = ''; return; }
    const hs = horarios(dia, dur, ignorar, equipe);
    box.innerHTML = hs.length ? gruposHorarios(hs, dur, hora, 'data-shh') : `<p class="txt-app">${expediente(dia.getDay()).length ? 'Sem horários livres nesse dia.' : 'Estúdio fechado nesse dia.'}</p>`;
    $$('[data-shh]', box).forEach(b => b.onclick = () => { hora = +b.dataset.shh; pintar(); aoEscolher(dia, hora); });
  };
  $('#shDia', pn).onchange = e => { dia = e.target.value ? fromKey(e.target.value) : null; hora = null; aoEscolher(null, null); pintar(); };
}
const REGRA_EQUIPE = 'A equipe pode agendar inclusive para hoje, respeitando expediente, almoço, intervalo de 15 min e bloqueios.';
function folhaNovoAgendamento(diaK){
  const hojeK = keyOf(hoje0());
  const clis = D.clientes.slice().sort((a,b) => a.nome.localeCompare(b.nome));
  folha('Novo agendamento', `
    <div class="campo-app"><label for="nC">Cliente</label><select id="nC"><option value="">Escolha a cliente</option><option value="nova">+ Nova cliente</option>${clis.map(c => `<option value="${c.id}">${esc(c.nome)}${c.exemplo ? ' (exemplo)' : ''}</option>`).join('')}</select></div>
    <div id="nNova" hidden><div class="campo-app"><label for="nNome">Nome</label><input id="nNome"></div><div class="campo-app"><label for="nTel">WhatsApp</label><input id="nTel" type="tel" placeholder="(99) 99999-9999"></div></div>
    <div class="campo-app"><label for="nS">Procedimento</label><select id="nS">${D.servicos.map(s => `<option value="${s.id}">${esc(s.nome)} · ${fmtH(s.dur)} · ${brl(s.preco)}</option>`).join('')}</select></div>
    <div class="campo-app"><label for="shDia">Dia</label><input type="date" id="shDia" min="${hojeK}" max="2027-12-31" value="${diaK && diaK >= hojeK ? diaK : hojeK}"><small>${REGRA_EQUIPE}</small></div>
    <div class="slots slots-app" id="shSlots"></div>
    <div class="info-tit">Pagamento</div>
    <div class="opc-lista">
      <label><input type="radio" name="npg" value="estudio" checked><span><b>Pagamento no estúdio</b><br><span class="small muted">Fica pendente até ser registrado no atendimento</span></span></label>
      <label><input type="radio" name="npg" value="pix"><span><b>Aguardar Pix da cliente</b><br><span class="small muted">Confirmado só depois de conferir no ${esc(D.cfg.banco)}</span></span></label>
    </div>
    <div class="opc-lista" id="npPix" hidden>
      <label><input type="radio" name="npv" value="sinal" checked><span>Sinal de 30% · <b class="num" id="npS"></b></span></label>
      <label><input type="radio" name="npv" value="total"><span>Valor integral · <b class="num" id="npT"></b></span></label>
    </div>
    <p id="nE" class="small" style="color:var(--erro);margin-bottom:10px"></p>
    <div class="acoes-app"><button class="bt" id="nOk" disabled>Agendar</button><button class="bt sec" data-fechar-folha>Cancelar</button></div>`, pn => {
    let escolha = null;
    $('#nC', pn).onchange = e => { $('#nNova', pn).hidden = e.target.value !== 'nova'; };
    const valores = () => { const s = serv($('#nS', pn).value); $('#npS', pn).textContent = brl(s.preco * .3); $('#npT', pn).textContent = brl(s.preco); };
    $$('input[name="npg"]', pn).forEach(i => i.onchange = () => { $('#npPix', pn).hidden = $('input[name="npg"]:checked', pn).value !== 'pix'; });
    const cb = (d, h) => { escolha = d ? {d, h} : null; $('#nOk', pn).disabled = !escolha; };
    const ligar = () => { valores(); seletorHorario(pn, serv($('#nS', pn).value).dur, null, cb, true); if ($('#shDia', pn).value) $('#shDia', pn).dispatchEvent(new Event('change')); };
    $('#nS', pn).onchange = ligar; ligar();
    $('#nOk', pn).onclick = () => {
      const err = t => { $('#nE', pn).textContent = t; };
      let cid = $('#nC', pn).value;
      if (!cid) return err('Escolha a cliente.');
      if (cid === 'nova' && ($('#nNome', pn).value.trim().length < 2 || $('#nTel', pn).value.replace(/\D/g,'').length < 10)) return err('Preencha nome e WhatsApp com DDD.');
      const sv = serv($('#nS', pn).value);
      if (!escolha || !horarios(escolha.d, sv.dur, null, true).includes(escolha.h)) return err('Escolha um horário disponível.');
      const porPix = $('input[name="npg"]:checked', pn).value === 'pix', tipo = porPix ? $('input[name="npv"]:checked', pn).value : 'estudio';
      const valor = tipo === 'sinal' ? sv.preco * .3 : tipo === 'total' ? sv.preco : 0;
      const nomeTxt = cid === 'nova' ? $('#nNome', pn).value.trim() : cliente(cid).nome;
      const pagDesc = porPix ? 'aguardar Pix de ' + brl(valor) + (tipo === 'sinal' ? ' (sinal de 30%)' : ' (valor integral)') : 'pagamento de ' + brl(sv.preco) + ' no estúdio';
      fecharFolha();
      confirmar({titulo:'Confirmar agendamento', texto:`${esc(nomeTxt)} · ${esc(sv.nome)}<br>${dataLonga(escolha.d)}, ${fmtH(escolha.h)} às ${fmtH(escolha.h + sv.dur)}<br>${pagDesc}.`, ok:'Agendar', fn:() => {
        if (cid === 'nova'){ const c = {id:'C-' + (300 + D.clientes.length), nome:nomeTxt, whats:$('#nTel', pn).value.trim(), obs:''}; D.clientes.push(c); cid = c.id; logar('Cadastrou a cliente ' + c.nome); }
        const r = {id:'R-' + (D.seq++), dia:keyOf(escolha.d), s:escolha.h, e:escolha.h + sv.dur, serv:sv.id, preco:sv.preco, cli:cid, pag:tipo, valor, pixOk:false, presencial:0, status:porPix ? 'aguardando' : 'confirmado', criado:agora(), origem:'equipe', obs:'', hist:[]};
        D.reservas.push(r); histR(r, 'Criou o agendamento pela equipe · ' + pagDesc);
        toast('Agendamento criado (simulação).'); app.agRef = escolha.d; abrirAtendimento(r.id);
      }});
    };
  });
}

/* ---------- Detalhe do atendimento ---------- */
function abrirAtendimento(id){ abrirPagina('Atendimento', el => paginaAtendimento(el, id)); }
function msgPix(r){
  return `Olá, ${nomeCli(r)}! Seu horário de ${serv(r.serv).nome} ficou para ${dataLonga(fromKey(r.dia)).toLowerCase()}, às ${fmtH(r.s)}. Para garantir, faça um Pix de ${brl(r.valor)} (${r.pag === 'sinal' ? 'sinal de 30%' : 'valor integral'}) para a chave ${D.cfg.pix} (${D.cfg.banco}) e envie o comprovante por aqui. O horário é confirmado depois que conferimos o pagamento. Saara Nail Studio`;
}
function paginaAtendimento(el, id){
  const r = D.reservas.find(x => x.id === id); if (!r){ el.innerHTML = vazioApp('agenda', 'Atendimento não encontrado'); return; }
  const c = cliente(r.cli), sv = serv(r.serv), d = fromKey(r.dia), hk = keyOf(hoje0());
  const futuroOuHoje = r.dia >= hk, ativo = ['confirmado','analise','aguardando'].includes(r.status);
  const pago = pagoTotal(r), falta = Math.max(0, r.preco - pago);
  const sol = D.solic.find(s => s.res === r.id && s.status === 'pendente');
  const prox = D.reservas.filter(x => x.dia === r.dia && x.id !== r.id && x.s > r.s && OCUPA.includes(x.status)).sort(ordR)[0];
  const pixSit = r.pixOk ? 'aprovado' : {analise:'em análise', aguardando:'aguardando Pix', recusado:'recusado'}[r.status] || 'não confirmado';
  el.innerHTML = `
    <div class="det-head"><span class="av">${ini(nomeCli(r))}</span><h2>${esc(nomeCli(r))}</h2>
      <div class="linha-st">${ps(r.status)}${r.presenca ? '<span class="chip-pres">Presença confirmada</span>' : ''}${r.atraso ? `<span class="chip-pres" style="${r.atraso > 15 ? 'background:#fff1dc;color:var(--alerta)' : ''}">Atraso de ${r.atraso} min</span>` : ''}${exTag(r)}</div></div>
    ${sol ? `<button class="sim" id="atSol" style="width:100%;border:0;text-align:left">${ic('alerta', 18)}<span>Pedido de ${sol.tipo} aguardando decisão. Toque para analisar.</span></button>` : ''}
    ${r.atraso > 15 && r.status === 'confirmado' ? avisoSim(`Atraso acima da tolerância de 15 minutos. Avalie se ainda dá para atender${prox ? ' sem prejudicar a próxima cliente, às ' + fmtH(prox.s) : ''}. Nada é cancelado automaticamente.`) : ''}
    <div class="info">
      <div class="l"><span>Procedimento</span><span>${esc(sv.nome)}</span></div>
      <div class="l"><span>Data</span><span>${dataLonga(d)}</span></div>
      <div class="l"><span>Horário</span><span class="num">${fmtH(r.s)} às ${fmtH(r.e)}</span></div>
      <div class="l"><span>Agendado por</span><span>${r.origem === 'equipe' ? 'Equipe' : 'Cliente, pelo site'}</span></div>
      ${r.motivo ? `<div class="l"><span>Motivo</span><span>${esc(r.motivo)}</span></div>` : ''}
      <div class="l"><span>Código</span><span class="num">${r.id}</span></div>
    </div>
    <div class="info-tit">Pagamento</div>
    <div class="info">
      <div class="l"><span>Valor do serviço</span><span class="num">${brl(r.preco)}</span></div>
      <div class="l"><span>Pix antecipado</span><span>${r.pag === 'estudio' ? 'Não (paga no estúdio)' : `<span class="num">${brl(r.valor)}</span> · ${pixSit}`}</span></div>
      <div class="l"><span>Pago no estúdio</span><span class="num">${brl(r.presencial || 0)}</span></div>
      ${['confirmado','concluido','faltou'].includes(r.status) ? `<div class="l"><span>Falta receber</span><span class="num" style="${falta ? 'color:var(--alerta)' : ''}">${brl(falta)}</span></div>` : ''}
      ${r.reembolso ? `<div class="l"><span>Reembolso registrado</span><span class="num">${brl(r.reembolso)}</span></div>` : ''}
      ${r.credito ? `<div class="l"><span>Crédito para novo horário</span><span class="num">${brl(r.credito)}</span></div>` : ''}
    </div>
    <div class="campo-app"><label for="atObs">Observação interna</label><textarea id="atObs" rows="2" placeholder="Só a equipe vê">${esc(r.obs || '')}</textarea></div>
    <div class="acoes-app">
      ${r.status === 'analise' ? `<button class="bt" id="atPag">${ic('conferir', 20)} Conferir pagamento</button>` : ''}
      ${r.status === 'aguardando' ? `<button class="bt" id="atPag">${ic('conferir', 20)} Conferir Pix recebido</button><button class="bt sec" id="atMsg">Copiar mensagem com os dados do Pix</button>` : ''}
      ${r.status === 'confirmado' && futuroOuHoje && !r.presenca ? `<button class="bt" id="atPres">Confirmar presença</button>` : ''}
      ${r.status === 'confirmado' && r.dia === hk ? `<button class="bt sec" id="atAtr">Registrar atraso</button>` : ''}
      ${['confirmado','concluido'].includes(r.status) && falta > 0 ? `<button class="bt sec" id="atPres2">Registrar pagamento no estúdio</button>` : ''}
      ${r.status === 'confirmado' && r.dia <= hk ? `<button class="bt" id="atConc">Concluir serviço</button><button class="bt perigo" id="atFalta">Não compareceu</button>` : ''}
      ${ativo && futuroOuHoje ? `<button class="bt sec" id="atReag">Reagendar</button>` : ''}
      ${c ? `<div class="acoes-app duas"><a class="bt sec" href="https://wa.me/55${c.whats.replace(/\D/g,'')}" target="_blank" rel="noopener">${ic('wa', 20)} WhatsApp</a><button class="bt sec" id="atCli">Ver cliente</button></div>` : ''}
      ${ativo && futuroOuHoje ? `<button class="bt perigo" id="atCanc">Cancelar atendimento</button>` : ''}
    </div>
    <div class="info-tit">Histórico da reserva</div>
    ${(r.hist || []).length ? `<div class="rows log-app">${r.hist.slice().reverse().map(h => `<div class="row"><span class="m"><time>${dataHora(h.t)}</time><b style="white-space:normal">${esc(h.quem)}</b><span style="white-space:normal">${esc(h.txt)}</span></span></div>`).join('')}</div>` : `<div class="rows">${vazioApp('hist', 'Sem registros')}</div>`}`;
  const on = (sel, fn) => { const b = $(sel, el); if (b) b.onclick = fn; };
  $('#atObs', el).onchange = e => { r.obs = e.target.value; histR(r, 'Editou a observação interna'); toast('Observação salva (simulação).'); };
  on('#atSol', () => abrirSolic(sol.id));
  on('#atPag', () => abrirPagamento(r.id));
  on('#atMsg', () => copiar(msgPix(r), 'Mensagem copiada. Cole no WhatsApp da cliente.'));
  on('#atCli', () => abrirCliente(r.cli));
  on('#atPres', () => confirmar({titulo:'Confirmar presença?', texto:`Registrar que ${esc(nomeCli(r))} confirmou que vem ${r.dia === hk ? 'hoje' : 'em ' + dataCurta(d)} às ${fmtH(r.s)}.`, ok:'Confirmar presença', fn:() => { r.presenca = true; histR(r, 'Confirmou a presença da cliente'); toast('Presença confirmada (simulação).'); reApp(); }}));
  on('#atAtr', () => folhaAtraso(r));
  on('#atPres2', () => folhaPresencial(r, falta));
  on('#atConc', () => confirmar({titulo:'Concluir serviço?', texto:`${esc(sv.nome)} de ${esc(nomeCli(r))}.${falta ? ' Ainda falta registrar ' + brl(falta) + ' de pagamento.' : ''}`, ok:'Concluir', fn:() => { r.status = 'concluido'; histR(r, 'Concluiu o atendimento'); toast('Serviço concluído (simulação).'); reApp(); }}));
  on('#atFalta', () => confirmar({titulo:'Registrar que não compareceu?', texto:`${esc(nomeCli(r))} não veio ao horário das ${fmtH(r.s)}.`, sim:'Nenhum valor pago é retido automaticamente. Trate devolução ou crédito conforme a política de cancelamento e os direitos da consumidora.', ok:'Registrar ausência', perigo:true, fn:() => { r.status = 'faltou'; histR(r, 'Registrou que a cliente não compareceu'); toast('Ausência registrada (simulação).'); reApp(); }}));
  on('#atReag', () => folhaReagendar(r));
  on('#atCanc', () => folhaCancelamento(r, null));
}
function folhaAtraso(r){
  folha('Registrar atraso', `<p class="txt-app">Tolerância de 15 minutos. Depois disso, vocês avaliam se ainda é possível atender. Nada é cancelado automaticamente.</p>
    <div class="campo-app"><label for="atM">Atraso</label><select id="atM">${[5,10,15,20,30,45,60].map(m => `<option value="${m}">${m} minutos</option>`).join('')}</select></div>
    <div class="campo-app"><label for="atN">Observação (opcional)</label><input id="atN" placeholder="Ex.: avisou pelo WhatsApp"></div>
    <div class="acoes-app"><button class="bt" id="atOk">Registrar</button><button class="bt sec" data-fechar-folha>Cancelar</button></div>`, pn => {
    $('#atOk', pn).onclick = () => { const m = +$('#atM', pn).value, n = $('#atN', pn).value.trim(); fecharFolha(); r.atraso = m; histR(r, 'Registrou atraso de ' + m + ' min' + (n ? ': ' + n : '')); toast(m > 15 ? 'Atraso acima da tolerância. Avalie se ainda é possível atender.' : 'Atraso registrado, dentro da tolerância.'); reApp(); };
  });
}
function folhaPresencial(r, falta){
  folha('Pagamento no estúdio', `<p class="txt-app">${esc(nomeCli(r))} · falta receber <b class="num">${brl(falta)}</b></p>
    <div class="campo-app"><label for="ppV">Valor recebido (R$)</label><input id="ppV" type="number" inputmode="decimal" min="0.01" max="${falta}" step="0.01" value="${falta.toFixed(2)}"></div>
    <div class="campo-app"><label for="ppF">Forma</label><select id="ppF"><option>Dinheiro</option><option>Pix no estúdio</option><option>Cartão de débito</option><option>Cartão de crédito</option></select></div>
    <p id="ppE" class="small" style="color:var(--erro);margin-bottom:10px"></p>
    <div class="acoes-app"><button class="bt" id="ppOk">Continuar</button><button class="bt sec" data-fechar-folha>Cancelar</button></div>`, pn => {
    $('#ppOk', pn).onclick = () => {
      const v = Math.round(parseFloat($('#ppV', pn).value) * 100) / 100, fm = $('#ppF', pn).value;
      if (!(v > 0) || v > falta + 0.001){ $('#ppE', pn).textContent = 'Informe um valor entre R$ 0,01 e ' + brl(falta) + '.'; return; }
      fecharFolha();
      confirmar({titulo:'Registrar pagamento?', texto:`${brl(v)} recebido no estúdio (${fm}).`, sim:'Registre só depois de receber de fato. Simulação: nada é salvo.', ok:'Registrar', fn:() => { r.presencial = (r.presencial || 0) + v; histR(r, 'Registrou pagamento no estúdio: ' + brl(v) + ' (' + fm + ')'); toast('Pagamento registrado (simulação).'); reApp(); }});
    };
  });
}
function folhaReagendar(r, sol){
  const sv = serv(r.serv); let escolha = null;
  folha('Reagendar', `<p class="txt-app">${esc(nomeCli(r))} · ${esc(sv.nome)}<br>Atual: ${dataLonga(fromKey(r.dia))}, ${fmtH(r.s)}</p>
    <div class="campo-app"><label for="shDia">Novo dia</label><input type="date" id="shDia" min="${keyOf(hoje0())}" max="2027-12-31"><small>${REGRA_EQUIPE}</small></div>
    <div class="slots slots-app" id="shSlots"></div>
    <div class="acoes-app" style="margin-top:16px"><button class="bt" id="rgOk" disabled>Continuar</button><button class="bt sec" data-fechar-folha>Cancelar</button></div>`, pn => {
    seletorHorario(pn, sv.dur, r.id, (d, h) => { escolha = d ? {d, h} : null; $('#rgOk', pn).disabled = !escolha; }, true);
    $('#rgOk', pn).onclick = () => {
      fecharFolha();
      confirmar({titulo:'Confirmar reagendamento', texto:`De ${dataCurta(fromKey(r.dia))} ${fmtH(r.s)}<br>para <b>${dataLonga(escolha.d)}, ${fmtH(escolha.h)}</b>.`, ok:'Reagendar', fn:() => {
        if (!horarios(escolha.d, sv.dur, r.id, true).includes(escolha.h)){ toast('Esse horário ficou indisponível. Escolha outro.'); return; }
        const antes = dataCurta(fromKey(r.dia)) + ' ' + fmtH(r.s), depois = dataCurta(escolha.d) + ' ' + fmtH(escolha.h);
        Object.assign(r, {dia:keyOf(escolha.d), s:escolha.h, e:escolha.h + sv.dur, presenca:false, atraso:0});
        histR(r, 'Reagendou de ' + antes + ' para ' + depois);
        if (sol) Object.assign(sol, {status:'decidida', decisao:'Reagendamento aprovado para ' + depois, responsavel:D.admin, tDecisao:agora()});
        toast('Reagendado (simulação). Avise a cliente pelo WhatsApp.'); reApp();
      }});
    };
  });
}
function folhaMotivo(titulo, opcoes, rotulo, fn, texto){
  folha(titulo, `${texto ? `<p class="txt-app">${texto}</p>` : ''}<div class="opc-lista" role="radiogroup">${opcoes.map((o,i) => `<label><input type="radio" name="mot" value="${esc(o)}" ${i===0 ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div>
    <div class="campo-app"><label for="motTxt">Detalhe (opcional)</label><input id="motTxt"></div>
    <div class="acoes-app"><button class="bt perigo cheio" id="motOk">${rotulo}</button><button class="bt sec" data-fechar-folha>Voltar</button></div>`, pn => {
    $('#motOk', pn).onclick = () => { const v = $('input[name="mot"]:checked', pn).value, t = $('#motTxt', pn).value.trim(); fecharFolha(); fn(v + (t ? ' (' + t + ')' : '')); };
  });
}
function dicaArrependimento(r){
  if (r.origem !== 'site' || !r.criado) return '';
  const dias = Math.floor((agora() - r.criado) / 864e5);
  return dias <= 7 ? avisoSim(`Agendamento feito pelo site há ${Math.max(0, dias)} dia(s). Pode se aplicar o direito de arrependimento (art. 49 do Código de Defesa do Consumidor), com devolução integral. Na dúvida, confirme com orientação jurídica.`) : '';
}
function folhaCancelamento(r, sol){
  const pago = pagoTotal(r), sv = serv(r.serv);
  folha('Cancelar atendimento', `<p class="txt-app">${esc(nomeCli(r))} · ${esc(sv.nome)}<br>${dataLonga(fromKey(r.dia))}, ${fmtH(r.s)}</p>
    ${dicaArrependimento(r)}
    ${sol ? '' : `<div class="campo-app"><label for="cnOrig">Quem pediu</label><select id="cnOrig"><option>Cliente pelo WhatsApp</option><option>Cliente pessoalmente</option><option>Decisão do estúdio</option></select></div>`}
    <div class="campo-app"><label for="cnMot">Motivo</label><input id="cnMot" value="${esc(sol ? sol.motivo || '' : '')}" placeholder="Opcional"></div>
    <div class="info"><div class="l"><span>Pagamentos realizados</span><span class="num">${brl(pago)}</span></div></div>
    ${pago > 0 ? `<div class="info-tit">Reembolso</div>
      <div class="opc-lista">
        <label><input type="radio" name="rb" value="integral" checked><span>Devolver tudo (${brl(pago)})</span></label>
        <label><input type="radio" name="rb" value="parcial"><span>Devolver parte</span></label>
        <label><input type="radio" name="rb" value="credito"><span>Manter como crédito para novo horário</span></label>
        <label><input type="radio" name="rb" value="nenhum"><span>Sem devolução</span></label>
      </div>
      <div class="campo-app" id="cnParc" hidden><label for="cnVal">Valor a devolver (R$)</label><input id="cnVal" type="number" inputmode="decimal" min="0.01" max="${pago}" step="0.01"></div>
      <div class="campo-app"><label for="cnJus">Justificativa da decisão</label><input id="cnJus" placeholder="Obrigatória para devolução parcial ou sem devolução"></div>` : `<p class="txt-app">Nenhum pagamento foi confirmado neste atendimento.</p>`}
    <p class="txt-app">Nada é retido automaticamente. A decisão fica registrada em nome de ${D.admin}.</p>
    <p id="cnE" class="small" style="color:var(--erro);margin-bottom:10px"></p>
    <div class="acoes-app"><button class="bt perigo cheio" id="cnOk">Continuar</button><button class="bt sec" data-fechar-folha>Voltar</button></div>`, pn => {
    $$('input[name="rb"]', pn).forEach(i => i.onchange = () => { $('#cnParc', pn).hidden = $('input[name="rb"]:checked', pn).value !== 'parcial'; });
    $('#cnOk', pn).onclick = () => {
      const err = t => { $('#cnE', pn).textContent = t; };
      const mot = $('#cnMot', pn).value.trim(), origem = sol ? sol.origem : $('#cnOrig', pn).value;
      let tipo = pago > 0 ? $('input[name="rb"]:checked', pn).value : 'sem', jus = pago > 0 ? $('#cnJus', pn).value.trim() : '', dev = 0, cred = 0, txt;
      if (tipo === 'integral'){ dev = pago; txt = 'devolução integral de ' + brl(pago); }
      else if (tipo === 'parcial'){ dev = Math.round(parseFloat($('#cnVal', pn).value) * 100) / 100; if (!(dev > 0) || dev >= pago) return err('Informe um valor de devolução menor que ' + brl(pago) + '.'); if (!jus) return err('Explique a devolução parcial.'); txt = 'devolução de ' + brl(dev) + ' de ' + brl(pago); }
      else if (tipo === 'credito'){ cred = pago; txt = brl(pago) + ' mantido como crédito'; }
      else if (tipo === 'nenhum'){ if (!jus) return err('Explique por que não haverá devolução.'); txt = 'sem devolução'; }
      else txt = 'sem pagamentos a devolver';
      if (jus) txt += ' (' + jus + ')';
      fecharFolha();
      confirmar({titulo:'Confirmar cancelamento?', texto:`O horário volta a ficar livre.<br>Decisão: ${esc(txt)}.`, sim: dev ? 'Simulação: a devolução precisa ser feita pelo app do banco. Aqui ela só fica registrada.' : null, ok:'Cancelar atendimento', perigo:true, fn:() => {
        Object.assign(r, {status:'cancelado', motivo:mot || origem, reembolso:dev, credito:cred});
        const reg = sol || {id:'S-' + (100 + D.solic.length), tipo:'cancelamento', res:r.id, cli:r.cli, t:agora(), origem, motivo:mot};
        Object.assign(reg, {status:'decidida', decisao:'Cancelamento aprovado', reembolso:txt, pagos:pago, responsavel:D.admin, tDecisao:agora()});
        if (!sol) D.solic.push(reg);
        histR(r, 'Cancelou o atendimento (' + origem.toLowerCase() + ') · ' + txt);
        toast('Atendimento cancelado e horário liberado (simulação).'); reApp();
      }});
    };
  });
}
function folhaComprovante(r){
  logar('Visualizou o comprovante de ' + r.id);
  const a = r.arquivo; let corpo;
  if (!a) corpo = `<div class="rows">${vazioApp('doc', 'Nenhum comprovante', 'A cliente pode mandar pelo WhatsApp. Ele nunca confirma o pagamento sozinho.')}</div>`;
  else if (a.url && a.tipo && a.tipo.startsWith('image/')) corpo = `<img src="${a.url}" alt="Comprovante enviado" style="width:100%;border-radius:14px;border:1px solid var(--creme-2)">`;
  else if (a.url) corpo = `<div class="rows">${vazioApp('doc', 'PDF anexado', 'No sistema real ele abre aqui, com acesso só de Saara e Julianny.')}</div>`;
  else corpo = `<div class="rows">${vazioApp('doc', 'Comprovante de exemplo', 'Não existe arquivo real nesta demonstração.')}</div>`;
  folha('Comprovante', `${a ? `<p class="txt-app">${esc(a.nome)} · ${r.id}</p>` : ''}${corpo}<div class="acoes-app" style="margin-top:14px"><button class="bt sec" data-fechar-folha>Fechar</button></div>`);
}

/* ================= Pagamentos ================= */
PAG.pagamentos = el => {
  const an = D.reservas.filter(r => r.status === 'analise').sort(ordR);
  const ag = D.reservas.filter(r => r.status === 'aguardando').sort(ordR);
  const cf = D.reservas.filter(r => r.pixOk && r.pag !== 'estudio').sort(ordR).reverse();
  const rc = D.reservas.filter(r => r.status === 'recusado').sort(ordR).reverse();
  const linha = r => `<button class="row" data-pg="${r.id}"><span class="av">${ini(nomeCli(r))}</span><span class="m"><b>${esc(nomeCli(r))}</b><span>${esc(serv(r.serv).nome)} · ${dataCurta(fromKey(r.dia))}${r.exemplo ? ' · exemplo' : ''}</span></span><span class="d"><span class="v">${brl(r.valor)}</span>${ic('chev', 18)}</span></button>`;
  let corpo = '';
  if (app.pgAba === 'analise'){
    if (an.length) corpo += `<div class="grupo-tit"><span>Comprovantes enviados</span><span>${an.length}</span></div><div class="rows">${an.map(linha).join('')}</div>`;
    if (ag.length) corpo += `<div class="grupo-tit"><span>Aguardando Pix da cliente</span><span>${ag.length}</span></div><div class="rows">${ag.map(linha).join('')}</div>`;
    if (!corpo) corpo = `<div class="rows">${vazioApp('conferir', 'Tudo em dia', 'Nenhum pagamento aguardando conferência.')}</div>`;
    else corpo = `<p class="txt-app">Confira cada Pix no app do ${esc(D.cfg.banco)} antes de confirmar. Comprovante nenhum confirma sozinho.</p>` + corpo;
  } else {
    const l = app.pgAba === 'confirmado' ? cf : rc;
    corpo = l.length ? `<div class="rows">${l.map(linha).join('')}</div>` : `<div class="rows">${vazioApp('pag', 'Nada por aqui', app.pgAba === 'recusado' ? 'Nenhum pagamento recusado.' : 'Nenhum pagamento confirmado ainda.')}</div>`;
  }
  el.innerHTML = `<div class="segm" role="group" aria-label="Situação">${[['analise','A conferir', an.length + ag.length],['confirmado','Confirmados', cf.length],['recusado','Recusados', rc.length]].map(([k,t,n]) => `<button data-aba="${k}" aria-pressed="${app.pgAba===k}">${t} <span class="num">${n}</span></button>`).join('')}</div>${corpo}`;
  $$('[data-aba]', el).forEach(b => b.onclick = () => { app.pgAba = b.dataset.aba; reApp(); });
  $$('[data-pg]', el).forEach(b => b.onclick = () => abrirPagamento(b.dataset.pg));
};
function abrirPagamento(id){ abrirPagina('Pagamento', el => paginaPagamento(el, id)); }
function paginaPagamento(el, id){
  const r = D.reservas.find(x => x.id === id), sv = serv(r.serv), conferir = ['analise','aguardando'].includes(r.status);
  el.innerHTML = `
    ${avisoSim('Simulação. Confirmar ou recusar aqui não representa confirmação bancária e não consulta o ' + esc(D.cfg.banco) + '.')}
    <div class="det-head" style="padding-top:4px"><div class="valor-g num">${brl(r.valor)}</div><p class="muted small" style="margin-top:6px">${r.pag === 'sinal' ? 'Sinal de 30%' : 'Valor integral antecipado'}</p><div class="linha-st">${ps(r.status)}${exTag(r)}</div></div>
    <div class="info">
      <div class="l"><span>Cliente</span><span>${esc(nomeCli(r))}</span></div>
      <div class="l"><span>Procedimento</span><span>${esc(sv.nome)}</span></div>
      <div class="l"><span>Valor esperado</span><span class="num">${brl(r.valor)}</span></div>
      <div class="l"><span>Data do atendimento</span><span>${dataCurta(fromKey(r.dia))}, ${fmtH(r.s)}</span></div>
      <div class="l"><span>Comprovante</span><span class="num">${r.status === 'aguardando' && !r.arquivo ? 'ainda não enviado' : r.enviado ? 'enviado ' + dataHora(r.enviado) : (r.exemplo ? 'exemplo' : '—')}</span></div>
      <div class="l"><span>Status</span><span>${r.pixOk ? 'Pix confirmado' : STATUS[r.status][1]}</span></div>
      ${r.aprovadoPor ? `<div class="l"><span>Confirmado por</span><span>${esc(r.aprovadoPor)}</span></div>` : ''}
      ${r.motivo && r.status === 'recusado' ? `<div class="l"><span>Motivo</span><span>${esc(r.motivo)}</span></div>` : ''}
    </div>
    <div class="acoes-app" style="margin-bottom:14px"><button class="bt sec" id="pgComp">${ic('doc', 20)} Ver comprovante</button>${r.status === 'aguardando' ? `<button class="bt sec" id="pgMsg">Copiar mensagem com os dados do Pix</button>` : ''}</div>
    ${conferir ? `
      <label class="conf-app"><input type="checkbox" id="pgChk"> <span>Conferi no extrato do ${esc(D.cfg.banco)} que <b class="num">${brl(r.valor)}</b> entrou.</span></label>
      <div class="acoes-app ${r.status === 'analise' ? 'duas' : ''}">${r.status === 'analise' ? '<button class="bt perigo" id="pgRec">Recusar</button>' : ''}<button class="bt" id="pgAp" disabled>${r.status === 'analise' ? 'Aprovar' : 'Confirmar Pix recebido'}</button></div>
      <p class="nota-demo" style="text-align:center">Botões de demonstração.</p>` : ''}
    <div class="acoes-app" style="margin-top:12px"><button class="bt sec" id="pgAt">Ver atendimento</button></div>`;
  $('#pgComp', el).onclick = () => folhaComprovante(r);
  $('#pgAt', el).onclick = () => abrirAtendimento(r.id);
  const m = $('#pgMsg', el); if (m) m.onclick = () => copiar(msgPix(r), 'Mensagem copiada. Cole no WhatsApp da cliente.');
  if (conferir){
    $('#pgChk', el).onchange = e => { $('#pgAp', el).disabled = !e.target.checked; };
    $('#pgAp', el).onclick = () => confirmar({titulo:'Confirmar pagamento?', texto:`${brl(r.valor)} de ${esc(nomeCli(r))} · ${esc(sv.nome)}. O atendimento passa a constar como confirmado.`, sim:'Simulação: nenhum dado bancário é consultado ou alterado.', ok:'Confirmar (simulação)', fn:() => {
      Object.assign(r, {status:'confirmado', pixOk:true, aprovadoPor:D.admin}); histR(r, 'Confirmou o Pix de ' + brl(r.valor) + ' após conferência');
      toast('Confirmado por ' + D.admin + ' (simulação). Avise a cliente pelo WhatsApp.'); reApp();
    }});
    const rec = $('#pgRec', el);
    if (rec) rec.onclick = () => folhaMotivo('Recusar pagamento', ['Pix não encontrado no extrato','Valor diferente do esperado','Comprovante ilegível','Outro'], 'Recusar (simulação)', mo => {
      Object.assign(r, {status:'recusado', motivo:mo}); histR(r, 'Recusou o pagamento: ' + mo); toast('Pagamento recusado e horário liberado (simulação).'); reApp();
    }, 'O horário da cliente é liberado. Simulação: nada é alterado no banco.');
  }
}

/* ================= Solicitações ================= */
function abrirSolic(id){ abrirPagina('Solicitação', el => paginaSolic(el, id)); }
function paginaSolic(el, id){
  const s = D.solic.find(x => x.id === id), r = D.reservas.find(x => x.id === s.res), sv = serv(r.serv);
  el.innerHTML = `<div class="det-head"><span class="av">${ini(nomeCli(r))}</span><h2>${esc(nomeCli(r))}</h2><div class="linha-st"><span class="ps ${s.status === 'pendente' ? 'p-analise' : 'p-done'}">${s.status === 'pendente' ? 'Aguardando decisão' : 'Decidida'}</span>${exTag(s)}</div></div>
    ${s.status === 'pendente' && s.tipo === 'cancelamento' ? dicaArrependimento(r) : ''}
    <div class="info">
      <div class="l"><span>Pedido</span><span>${s.tipo === 'cancelamento' ? 'Cancelamento' : 'Reagendamento'}</span></div>
      <div class="l"><span>Agendamento</span><span>${esc(sv.nome)} · ${dataCurta(fromKey(r.dia))} ${fmtH(r.s)}</span></div>
      <div class="l"><span>Data do pedido</span><span class="num">${dataHora(s.t)}</span></div>
      <div class="l"><span>Origem</span><span>${esc(s.origem)}</span></div>
      <div class="l"><span>${s.tipo === 'cancelamento' ? 'Motivo' : 'Detalhes'}</span><span>${esc(s.motivo || 'Não informado')}</span></div>
      <div class="l"><span>Pagamentos realizados</span><span class="num">${brl(s.pagos != null ? s.pagos : pagoTotal(r))}</span></div>
      <div class="l"><span>Situação do atendimento</span><span>${STATUS[r.status][1]}</span></div>
    </div>
    ${s.status === 'decidida' ? `<div class="info-tit">Decisão</div><div class="info">
      <div class="l"><span>Decisão</span><span>${esc(s.decisao)}</span></div>
      ${s.reembolso ? `<div class="l"><span>Reembolso</span><span>${esc(s.reembolso)}</span></div>` : ''}
      ${s.justificativa ? `<div class="l"><span>Justificativa</span><span>${esc(s.justificativa)}</span></div>` : ''}
      <div class="l"><span>Responsável</span><span>${esc(s.responsavel)}</span></div>
      <div class="l"><span>Data da decisão</span><span class="num">${dataHora(s.tDecisao)}</span></div></div>`
    : `<div class="acoes-app">
      <button class="bt" id="slSim">${s.tipo === 'cancelamento' ? 'Aprovar cancelamento' : 'Escolher novo horário'}</button>
      <button class="bt perigo" id="slNao">Não aprovar</button>
      <button class="bt sec" id="slAt">Ver atendimento</button></div>
      <p class="txt-app" style="margin-top:12px">Nenhuma decisão é tomada automaticamente. Valores pagos não são retidos sem análise.</p>`}`;
  const on = (q, f) => { const b = $(q, el); if (b) b.onclick = f; };
  on('#slAt', () => abrirAtendimento(r.id));
  on('#slSim', () => s.tipo === 'cancelamento' ? folhaCancelamento(r, s) : folhaReagendar(r, s));
  on('#slNao', () => folha('Não aprovar pedido', `<p class="txt-app">Explique para registrar. Avise a cliente pelo WhatsApp e, se possível, ofereça alternativas.</p>
    <div class="campo-app"><label for="snJ">Justificativa</label><textarea id="snJ" rows="3"></textarea></div><p id="snE" class="small" style="color:var(--erro);margin-bottom:10px"></p>
    <div class="acoes-app"><button class="bt perigo cheio" id="snOk">Registrar decisão</button><button class="bt sec" data-fechar-folha>Voltar</button></div>`, pn => {
    $('#snOk', pn).onclick = () => { const j = $('#snJ', pn).value.trim(); if (!j){ $('#snE', pn).textContent = 'Escreva a justificativa.'; return; } fecharFolha();
      Object.assign(s, {status:'decidida', decisao:(s.tipo === 'cancelamento' ? 'Cancelamento' : 'Reagendamento') + ' não aprovado', justificativa:j, pagos:pagoTotal(r), responsavel:D.admin, tDecisao:agora()});
      histR(r, 'Não aprovou o pedido de ' + s.tipo + ': ' + j); toast('Decisão registrada (simulação).'); reApp(); };
  }));
}

