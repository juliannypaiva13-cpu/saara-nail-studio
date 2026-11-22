$('#formAcomp').addEventListener('submit', e => {
  e.preventDefault();
  const cod = $('#acCod').value.trim().toUpperCase(), tel = $('#acTel').value.replace(/\D/g,'');
  const r = D.reservas.find(x => x.id === cod && !x.exemplo && x.cli);
  if (!r || tel.length !== 4 || !cliente(r.cli).whats.replace(/\D/g,'').endsWith(tel)){
    $('#acRes').innerHTML = `<div class="vazio">Não encontramos um agendamento com esse código e esse telefone. Confira os dados ou fale com o estúdio pelo WhatsApp.</div>`; return;
  }
  mostrarAcomp(r);
});
function mostrarAcomp(r, modo, aviso){
  const box = $('#acRes'), sv = serv(r.serv), d = fromKey(r.dia);
  const passos = [['Horário escolhido', dataLonga(d) + ', ' + fmtH(r.s) + ' às ' + fmtH(r.e), 'feito'], ['Comprovante enviado', r.enviado ? dataHora(r.enviado) : '', 'feito']];
  passos.push(['Pagamento em análise', r.status === 'analise' ? 'A Saara ou a Julianny vão conferir o Pix.' : '', r.status === 'analise' ? 'agora' : 'feito']);
  if (['confirmado','concluido'].includes(r.status)) passos.push(['Agendamento confirmado', r.status === 'concluido' ? 'Atendimento concluído.' : 'Até lá!', 'feito']);
  else if (r.status === 'recusado') passos.push(['Pagamento recusado', (r.motivo ? 'Motivo: ' + r.motivo + '. ' : '') + 'Fale com o estúdio pelo WhatsApp.', 'agora']);
  else if (r.status === 'cancelado') passos.push(['Agendamento cancelado', r.motivo || '', 'agora']);
  else if (r.status === 'faltou') passos.push(['Ausência registrada', 'Fale com o estúdio pelo WhatsApp para combinar os próximos passos.', 'agora']);
  else passos.push(['Agendamento confirmado', '', '']);
  const pend = D.solic.find(s => s.res === r.id && s.status === 'pendente');
  const ativo = ['analise','confirmado'].includes(r.status);
  const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, r.s).getTime();
  const horas = (inicio - agora().getTime()) / 3600e3;
  let extra = '';
  if (aviso) extra += `<p class="aviso" style="background:#e3f3ea;color:var(--ok)"><b>${aviso}</b></p>`;
  if (pend) extra += `<p class="aviso"><b>Pedido de ${pend.tipo} enviado em ${dataHora(pend.t)}.</b> A Saara ou a Julianny vão analisar e responder pelo WhatsApp.</p>`;
  else if (ativo && horas > 0 && !modo) extra += `<div class="nav-etapa"><button class="btn sec sm" id="acReag">Solicitar reagendamento</button><button class="btn sec sm" id="acCanc">Solicitar cancelamento</button></div>`;
  let form = '';
  if (modo === 'cancelar') form = `<div class="cartao-site" style="margin-top:16px"><h3>Solicitar cancelamento</h3>
    <p class="muted small" style="margin-bottom:12px">O pedido é analisado pela Saara ou pela Julianny. Valores pagos não são retidos automaticamente. Você também pode pedir pelo WhatsApp.</p>
    <div class="campo"><label for="acMot">Motivo (opcional)</label><textarea id="acMot" rows="2"></textarea></div>
    <div class="nav-etapa"><button class="btn sec sm" id="acVolta">Voltar</button><button class="btn sm" id="acEnvC">Enviar pedido</button></div></div>`;
  if (modo === 'reagendar') form = horas >= 24 ? `<div class="cartao-site" style="margin-top:16px"><h3>Escolher novo horário</h3>
    <p class="muted small" style="margin-bottom:12px">Faltam mais de 24 horas, então você pode escolher um novo horário disponível.</p>
    <div class="campo"><label for="acDia">Novo dia</label><input type="date" id="acDia" min="${keyOf(hoje0())}" max="2027-12-31"></div><div class="slots" id="acSlots"></div>
    <div class="nav-etapa"><button class="btn sec sm" id="acVolta">Voltar</button><button class="btn sm" id="acEnvR" disabled>Confirmar novo horário</button></div></div>`
    : `<div class="cartao-site" style="margin-top:16px"><h3>Pedir reagendamento</h3>
    <p class="muted small" style="margin-bottom:12px">Faltam menos de 24 horas para o seu horário, então o pedido passa pela avaliação da Saara ou da Julianny.</p>
    <div class="campo"><label for="acPref">Qual dia e horário você prefere?</label><textarea id="acPref" rows="2"></textarea></div>
    <div class="nav-etapa"><button class="btn sec sm" id="acVolta">Voltar</button><button class="btn sm" id="acEnvP">Enviar pedido</button></div></div>`;
  box.innerHTML = `<div class="status">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><b class="num">${r.id}</b>${pill(r.status)}</div>
    <h3 style="margin-top:10px">${esc(sv.nome)}</h3>
    <p class="muted">${dataLonga(d)} · ${fmtH(r.s)} às ${fmtH(r.e)}</p>
    <p class="num" style="margin-top:6px">${r.status === 'analise' ? 'Pix informado: ' + brl(r.valor) + ' (em análise)' : r.pag === 'sinal' ? 'Sinal: ' + brl(r.valor) + ' · restante no dia: ' + brl(r.preco - r.valor) : 'Valor total: ' + brl(r.valor)}</p>
    <ol class="linha-tempo">${passos.map(([t,s,c]) => `<li class="${c}">${t}${s ? `<small>${esc(s)}</small>` : ''}</li>`).join('')}</ol>
    ${extra}</div>${form}`;
  const on = (s, f) => { const b = $(s, box); if (b) b.onclick = f; };
  on('#acReag', () => mostrarAcomp(r, 'reagendar'));
  on('#acCanc', () => mostrarAcomp(r, 'cancelar'));
  on('#acVolta', () => mostrarAcomp(r));
  on('#acEnvC', () => {
    const mot = $('#acMot').value.trim();
    const s = {id:'S-' + (100 + D.solic.length), tipo:'cancelamento', res:r.id, cli:r.cli, t:agora(), origem:'Site', motivo:mot, status:'pendente'};
    D.solic.push(s); histR(r, 'Cliente pediu cancelamento pelo site' + (mot ? ': ' + mot : ''), 'Cliente');
    notificar('solicitacao', 'Pedido de cancelamento: ' + cliente(r.cli).nome + ' · ' + r.id, s.id);
    mostrarAcomp(r, null, 'Pedido de cancelamento enviado.');
  });
  on('#acEnvP', () => {
    const pref = $('#acPref').value.trim();
    const s = {id:'S-' + (100 + D.solic.length), tipo:'reagendamento', res:r.id, cli:r.cli, t:agora(), origem:'Site', motivo:pref ? 'Preferência: ' + pref : '', status:'pendente'};
    D.solic.push(s); histR(r, 'Cliente pediu reagendamento com menos de 24 h' + (pref ? ' (prefere: ' + pref + ')' : ''), 'Cliente');
    notificar('solicitacao', 'Pedido de reagendamento: ' + cliente(r.cli).nome + ' · ' + r.id, s.id);
    mostrarAcomp(r, null, 'Pedido de reagendamento enviado.');
  });
  const di = $('#acDia', box);
  if (di){
    let dia = null, hora = null;
    const pintar = () => {
      const hs = dia ? horarios(dia, sv.dur, r.id) : [];
      $('#acSlots').innerHTML = !dia ? '' : hs.length ? gruposHorarios(hs, sv.dur, hora, 'data-acr') : `<div class="vazio">Sem horários livres nesse dia.</div>`;
      $$('[data-acr]', box).forEach(b => b.onclick = () => { hora = +b.dataset.acr; $('#acEnvR').disabled = false; pintar(); });
    };
    di.onchange = () => { dia = di.value ? fromKey(di.value) : null; hora = null; $('#acEnvR').disabled = true; pintar(); };
    on('#acEnvR', () => {
      if (!dia || !horarios(dia, sv.dur, r.id).includes(hora)){ toast('Esse horário ficou indisponível. Escolha outro.'); pintar(); return; }
      const antes = dataCurta(fromKey(r.dia)) + ' ' + fmtH(r.s);
      Object.assign(r, {dia:keyOf(dia), s:hora, e:hora + sv.dur, presenca:false});
      histR(r, 'Cliente reagendou pelo site de ' + antes + ' para ' + dataCurta(dia) + ' ' + fmtH(hora), 'Cliente');
      notificar('agendamento', 'Reagendamento pela cliente: ' + cliente(r.cli).nome + ' · ' + r.id, r.id);
      mostrarAcomp(r, null, 'Novo horário registrado.');
    });
  }
}

