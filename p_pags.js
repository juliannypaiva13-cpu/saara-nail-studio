PAG.financeiro = el => {
  const h = hoje0(), hk = keyOf(h);
  const per = {mes:['Este mês', r => r.dia.slice(0,7) === hk.slice(0,7)], ant:['Mês passado', r => r.dia.slice(0,7) === keyOf(new Date(h.getFullYear(), h.getMonth()-1, 1)).slice(0,7)], prox:['Próximos 30 dias', r => r.dia >= hk && r.dia <= keyOf(addDias(h, 30))]};
  const rs = D.reservas.filter(per[app.finPer][1]), f = resumoFin(rs);
  const max = Math.max(1, ...Object.values(f.porServ).map(p => p.v));
  el.innerHTML = `
    <div class="segm">${Object.entries(per).map(([k,[n]]) => `<button data-per="${k}" aria-pressed="${app.finPer===k}">${n}</button>`).join('')}</div>
    ${avisoSim('Valores somados a partir dos agendamentos de exemplo. Não é faturamento real.')}
    <div class="det-head" style="padding-top:2px"><p class="muted small">Recebido e registrado</p><div class="valor-g num">${brl(f.recebido)}</div></div>
    <div class="info">
      <div class="l"><span>Pix confirmados</span><span class="num">${brl(f.pix)}</span></div>
      <div class="l"><span>Pagamentos no estúdio</span><span class="num">${brl(f.presencial)}</span></div>
      <div class="l"><span>Reembolsos registrados</span><span class="num">${f.reembolsos ? '− ' + brl(f.reembolsos) : brl(0)}</span></div>
    </div>
    <div class="info-tit">Ainda não recebido</div>
    <div class="info">
      <div class="l"><span>A receber no estúdio</span><span class="num">${brl(f.saldo)}</span></div>
      <div class="l"><span>Pix em análise</span><span class="num" style="color:var(--alerta)">${brl(f.analise)}</span></div>
      <div class="l"><span>Aguardando Pix da cliente</span><span class="num" style="color:var(--alerta)">${brl(f.aguardando)}</span></div>
    </div>
    <p class="txt-app">Valores combinados no estúdio só contam como recebidos depois de registrados no atendimento.</p>
    <div class="info-tit">Por procedimento</div>
    <div class="info">${D.servicos.map(s => { const p = f.porServ[s.id] || {n:0, v:0}; return `<div class="l" style="display:block"><div style="display:flex;justify-content:space-between;gap:10px"><span class="muted">${esc(s.nome)} <span class="num">(${p.n})</span></span><b class="num">${brl(p.v)}</b></div><div class="barra-fin"><i style="width:${p.v / max * 100}%"></i></div></div>`; }).join('')}</div>
    <button class="bt sec" id="fnCp">Copiar relatório para planilha</button>`;
  $$('[data-per]', el).forEach(b => b.onclick = () => { app.finPer = b.dataset.per; reApp(); });
  $('#fnCp', el).onclick = () => {
    const n2 = v => (v || 0).toFixed(2).replace('.',',');
    const linhas = [['Código','Data','Cliente','Procedimento','Preço','Forma','Pix confirmado','Pago no estúdio','Reembolso','Status']].concat(rs.filter(r => !['provisoria','expirada'].includes(r.status)).sort(ordR).map(r => [r.id, r.dia, nomeCli(r), serv(r.serv).nome, n2(r.preco), pagTxt(r), n2(r.pixOk ? r.valor : 0), n2(r.presencial), n2(r.reembolso), STATUS[r.status][1]]));
    copiar(linhas.map(l => l.join('\t')).join('\n'), 'Relatório copiado. Cole em uma planilha.');
    logar('Copiou o relatório financeiro (' + per[app.finPer][0].toLowerCase() + ')');
  };
};

PAG.notificacoes = el => {
  const ns = D.notifs.filter(n => !app.notifSo || !n.lida).sort((a,b) => b.t - a.t);
  const tipoTxt = {pagamento:'Pagamento', agendamento:'Agendamento', solicitacao:'Solicitação'};
  el.innerHTML = `<div class="segm"><button data-nf="0" aria-pressed="${!app.notifSo}">Todas</button><button data-nf="1" aria-pressed="${app.notifSo}">Não lidas</button></div>
    ${ns.length ? `<div class="rows">${ns.map(n => `<button class="row" data-nt="${n.id}"><span class="notif-dot ${n.lida ? 'lida' : ''}"></span><span class="m"><b style="${n.lida ? 'font-weight:500;' : ''}white-space:normal">${esc(n.txt)}${exTag(n)}</b><span>${tipoTxt[n.tipo] || ''} · ${dataHora(n.t)}</span></span><span class="d">${ic('chev', 18)}</span></button>`).join('')}</div>`
      : `<div class="rows">${vazioApp('notif', 'Nenhuma notificação', app.notifSo ? 'Você já viu tudo.' : '')}</div>`}
    <p class="nota-demo" style="margin-top:12px">No sistema real, as notificações também poderão chegar no celular de Saara e Julianny.</p>`;
  $$('[data-nf]', el).forEach(b => b.onclick = () => { app.notifSo = b.dataset.nf === '1'; reApp(); });
  $$('[data-nt]', el).forEach(b => b.onclick = () => {
    const n = D.notifs.find(x => x.id === b.dataset.nt); n.lida = true;
    if (n.tipo === 'solicitacao' && D.solic.find(s => s.id === n.ref)) return abrirSolic(n.ref);
    const r = D.reservas.find(x => x.id === n.ref); if (!r) return reApp();
    if (n.tipo === 'pagamento' && r.status === 'analise') abrirPagamento(r.id); else abrirAtendimento(r.id);
  });
  return D.notifs.some(n => !n.lida) ? {label:'Marcar todas como lidas', icone:'conferir', fn:() => { D.notifs.forEach(n => n.lida = true); toast('Todas marcadas como lidas.'); reApp(); }} : null;
};

PAG.expediente = el => {
  el.innerHTML = `<p class="txt-app">Toque em um dia para mudar o horário ou as pausas. Horários no fuso de Fortaleza (UTC−3).</p>
    <div class="rows">${[1,2,3,4,5,6,0].map(d => `<button class="row" data-dexp="${d}"><span class="ico">${ic('relogio', 20)}</span><span class="m"><b>${DIAS_NOME[d]}</b><span class="num" style="white-space:normal">${txtPeriodos(expediente(d))}${expediente(d).length === 2 ? ' · pausa ' + fmtH(expediente(d)[0][1]) + '–' + fmtH(expediente(d)[1][0]) : ''}</span></span><span class="d">${ic('chev', 18)}</span></button>`).join('')}</div>
    <div class="info-tit">Regras de agendamento</div>
    <div class="info">
      <div class="l"><span>Horários de início</span><span>a cada 15 min</span></div>
      <div class="l"><span>Intervalo entre atendimentos</span><span>15 min</span></div>
      <div class="l"><span>Antecedência pelo site</span><span>24 horas</span></div>
      <div class="l"><span>Pela equipe</span><span>inclusive no mesmo dia</span></div>
      <div class="l"><span>Reserva provisória no site</span><span>15 min</span></div>
      <div class="l"><span>Tolerância de atraso</span><span>15 min</span></div>
      <div class="l"><span>Agenda aberta até</span><span class="num">31/12/2027</span></div>
    </div>`;
  $$('[data-dexp]', el).forEach(b => b.onclick = () => folhaExpediente(+b.dataset.dexp));
};
function folhaExpediente(dow){
  const atual = expediente(dow), p1 = atual[0] || [840,1260], p2 = atual[1] || null;
  const op = sel => { let o = ''; for (let t = 360; t <= 1380; t += 15) o += `<option value="${t}" ${t === sel ? 'selected' : ''}>${fmtH(t)}</option>`; return o; };
  folha(DIAS_NOME[dow], `
    <div class="opc-lista"><label><input type="checkbox" id="exF" ${atual.length ? '' : 'checked'}> Estúdio fechado neste dia</label></div>
    <div id="exP">
      <div class="info-tit">Período 1</div>
      <div class="duas-col"><div class="campo-app"><label for="ex1a">Abre</label><select id="ex1a">${op(p1[0])}</select></div><div class="campo-app"><label for="ex1b">Fecha</label><select id="ex1b">${op(p1[1])}</select></div></div>
      <div class="opc-lista"><label><input type="checkbox" id="exPausa" ${p2 ? 'checked' : ''}> Tem pausa (almoço ou intervalo)</label></div>
      <div id="exP2" ${p2 ? '' : 'hidden'}>
        <div class="info-tit">Período 2</div>
        <div class="duas-col"><div class="campo-app"><label for="ex2a">Volta</label><select id="ex2a">${op(p2 ? p2[0] : 840)}</select></div><div class="campo-app"><label for="ex2b">Fecha</label><select id="ex2b">${op(p2 ? p2[1] : 1020)}</select></div></div>
      </div>
    </div>
    <p id="exE" class="small" style="color:var(--erro);margin-bottom:10px"></p>
    <div class="acoes-app"><button class="bt" id="exOk">Continuar</button><button class="bt sec" data-fechar-folha>Cancelar</button></div>`, pn => {
    const sync = () => { $('#exP', pn).hidden = $('#exF', pn).checked; $('#exP2', pn).hidden = !$('#exPausa', pn).checked; };
    $('#exF', pn).onchange = sync; $('#exPausa', pn).onchange = sync; sync();
    $('#exOk', pn).onclick = () => {
      const err = t => { $('#exE', pn).textContent = t; };
      let novo = [];
      if (!$('#exF', pn).checked){
        const a = +$('#ex1a', pn).value, b = +$('#ex1b', pn).value;
        if (b <= a) return err('No período 1, o fechamento precisa ser depois da abertura.');
        novo.push([a,b]);
        if ($('#exPausa', pn).checked){ const c = +$('#ex2a', pn).value, d2 = +$('#ex2b', pn).value; if (c <= b) return err('A volta da pausa precisa ser depois do fim do período 1.'); if (d2 <= c) return err('No período 2, o fechamento precisa ser depois da volta.'); novo.push([c,d2]); }
      }
      const hk = keyOf(hoje0());
      const fora = D.reservas.filter(r => r.dia >= hk && fromKey(r.dia).getDay() === dow && OCUPA.includes(r.status) && !novo.some(([a,b]) => r.s >= a && r.e <= b));
      if (fora.length) return err(fora.length + ' atendimento(s) já marcado(s) ficariam fora do novo horário (ex.: ' + dataCurta(fromKey(fora[0].dia)) + ' ' + fmtH(fora[0].s) + '). Reagende antes de mudar.');
      fecharFolha();
      confirmar({titulo:'Mudar expediente?', texto:`${DIAS_NOME[dow]}: ${txtPeriodos(novo)}. Vale para todas as semanas.`, ok:'Salvar', fn:() => { D.cfg.exp[dow] = novo; logar('Alterou o expediente de ' + DIAS_NOME[dow].toLowerCase() + ' para ' + txtPeriodos(novo)); toast('Expediente atualizado (simulação).'); reApp(); }});
    };
  });
}
