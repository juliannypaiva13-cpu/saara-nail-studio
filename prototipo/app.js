/* ================= APP ADMINISTRATIVO ================= */
const P = {
  inicio:'<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  agenda:'<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  pag:'<rect x="2.5" y="6" width="19" height="13" rx="3"/><path d="M2.5 10.5h19M6.5 15h4"/>',
  cli:'<circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 20c.8-3.5 3.3-5.4 6.2-5.4s5.4 1.9 6.2 5.4"/><path d="M15.5 5a3.5 3.5 0 0 1 0 7M18 14.9c1.6.8 2.7 2.4 3.2 5.1"/>',
  mais:'<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', voltar:'<path d="M15 5l-7 7 7 7"/>', chev:'<path d="M9.5 6l6 6-6 6"/>',
  busca:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', bloq:'<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  conferir:'<path d="M4.5 12.5l4.5 4.5L19.5 6.5"/>', servicos:'<path d="M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7z"/><circle cx="8" cy="9" r="1.4"/>',
  port:'<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 15.5-4.8-4.8L8 19"/>',
  fin:'<path d="M3.5 20h17M6.5 16v-4M11 16V8M15.5 16v-6M20 16V5"/>', notif:'<path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9M10 20.5h4"/>',
  relogio:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', pix:'<path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/><path d="m9 12 3 3 3-3-3-3z"/>',
  pol:'<path d="M6 3.5h8.5l3.5 3.5v13.5H6z"/><path d="M14 3.5V7.5h4M9 12h6M9 16h4"/>', seg:'<path d="M12 3.5l7.5 3v5.7c0 4.5-3.2 7.6-7.5 8.8-4.3-1.2-7.5-4.3-7.5-8.8V6.5z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  hist:'<path d="M3.8 12a8.2 8.2 0 1 0 2.4-5.8L3.8 8.5"/><path d="M3.8 4v4.5h4.5M12 8v4l3 2"/>', sair:'<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6.5 12H16"/>',
  site:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.8 3.3 2.8 13.7 0 17M12 3.5c-2.8 3.3-2.8 13.7 0 17"/>',
  wa:'<path d="M4.5 19.5 5.6 16A7.5 7.5 0 1 1 8.4 18.6z"/><path d="M9.3 9.2c.3 2.3 1.9 4 4.4 4.9l1.1-1.2"/>', alerta:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5M12 16v.5"/>',
  cel:'<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>', pc:'<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
  editar:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>', doc:'<path d="M6 3.5h8.5L18 7v13.5H6z"/><path d="M14 3.5V7.5h4"/>', foto:'<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="12" cy="12" r="3.5"/>'
};
const ic = (n, s) => `<svg viewBox="0 0 24 24" width="${s||22}" height="${s||22}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
const ini = n => (n || '?').trim().charAt(0).toUpperCase();
const CURTO = {provisoria:'Provisória', analise:'Em análise', confirmado:'Confirmado', recusado:'Recusado', expirada:'Expirada', cancelado:'Cancelado', concluido:'Concluído'};
const ps = s => `<span class="ps ${STATUS[s][0]}">${CURTO[s]}</span>`;
const nomeCli = r => { const c = cliente(r.cli); return c ? c.nome : 'Reserva provisória'; };
const pagTxt = r => r.pag === 'estudio' ? 'No estúdio' : r.pag === 'sinal' ? 'Sinal de 30%' : 'Valor total';
const vazioApp = (icone, titulo, txt) => `<div class="vazio-app"><i>${ic(icone, 24)}</i><b>${titulo}</b>${txt || ''}</div>`;
const minAgora = () => { const n = agora(); return n.getHours()*60 + n.getMinutes(); };

const TABS = [['inicio','Início'],['agenda','Agenda'],['pagamentos','Pagamentos'],['clientes','Clientes'],['mais','Mais']];
const SUB = {servicos:'Serviços e preços', portfolio:'Portfólio', financeiro:'Financeiro', notificacoes:'Notificações', expediente:'Expediente', pix:'Pix', politicas:'Políticas do estúdio', seguranca:'Segurança', historico:'Histórico de ações'};
const app = {sub:'inicio', pilha:[], agModo:'dia', agRef:hoje0(), pgAba:'analise', busca:'', finPer:'mes', histF:'todas', notifSo:false};

function renderApp(sub){
  document.body.classList.add('modo-app');
  if (sub) app.sub = sub;
  const root = $('#painel');
  if (!D.admin){ telaEntrada(root); return; }
  const s = app.sub, tab = TABS.some(t => t[0] === s) ? s : (SUB[s] ? 'mais' : 'inicio');
  const topo = app.pilha[app.pilha.length - 1];
  let titulo, voltar = false, fn;
  if (topo){ titulo = topo.titulo; voltar = true; fn = topo.fn; }
  else if (SUB[s]){ titulo = SUB[s]; voltar = true; fn = PAG[s]; }
  else { titulo = {inicio:'', agenda:'Agenda', pagamentos:'Pagamentos', clientes:'Clientes', mais:'Mais'}[tab]; fn = PAG[tab]; }
  const pend = D.reservas.filter(r => r.status === 'analise').length;
  root.innerHTML = `<div class="app">
    <header class="app-top ${voltar ? 'com-voltar' : ''}">
      ${voltar ? `<button class="ic-btn" id="aVoltar" aria-label="Voltar">${ic('voltar', 24)}</button>` : ''}
      ${titulo ? `<h1>${esc(titulo)}</h1>` : `<span class="marca-app">Saara Nail Studio</span>`}
      <span id="aAcao"></span>
      <button class="demo-chip" id="aDemo">Demo</button>
      <button class="av eu" id="aPerfil" aria-label="Perfil: ${D.admin}">${ini(D.admin)}</button>
    </header>
    <main class="app-corpo" id="aCorpo"></main>
    <nav class="tabbar" aria-label="Navegação do app">${TABS.map(([id,n]) => `<a href="${id === 'inicio' ? '#painel' : '#painel-' + id}" data-tab="${id}" aria-current="${id === tab ? 'page' : 'false'}">${ic(id, 24)}<span>${n}</span>${id === 'pagamentos' && pend ? `<span class="bdg">${pend}</span>` : ''}</a>`).join('')}</nav>
  </div>`;
  const acao = fn($('#aCorpo'));
  if (acao) { $('#aAcao').innerHTML = `<button class="ic-btn" aria-label="${acao.label}">${ic(acao.icone || 'plus', 24)}</button>`; $('#aAcao button').onclick = acao.fn; }
  if (voltar) $('#aVoltar').onclick = () => { if (app.pilha.length){ app.pilha.pop(); renderApp(); window.scrollTo(0,0); } else location.hash = 'painel-mais'; };
  $('#aDemo').onclick = () => abrir('#modalDemo');
  $('#aPerfil').onclick = folhaPerfil;
  $$('[data-tab]').forEach(a => a.addEventListener('click', e => { if (a.getAttribute('aria-current') === 'page' || ('#' + location.hash.replace('#','')) === a.getAttribute('href')){ e.preventDefault(); app.pilha = []; app.sub = a.dataset.tab; renderApp(); window.scrollTo(0,0); } }));
}
const reApp = () => renderApp();
function abrirPagina(titulo, fn){ app.pilha.push({titulo, fn}); renderApp(); window.scrollTo(0,0); }

/* ---------- Folhas (bottom sheets) e confirmações ---------- */
function folha(titulo, html, montar){
  let sh = $('#sheet');
  if (!sh){ sh = document.createElement('div'); sh.id = 'sheet'; sh.className = 'sheet'; sh.setAttribute('role','dialog'); sh.setAttribute('aria-modal','true'); document.body.appendChild(sh);
    sh.addEventListener('click', e => { if (e.target === sh || e.target.closest('[data-fechar-folha]')) fecharFolha(); }); }
  sh.innerHTML = `<div class="pn"><div class="alca"></div>${titulo ? `<h3>${esc(titulo)}</h3>` : ''}${html}</div>`;
  sh.classList.add('aberto');
  if (montar) montar($('.pn', sh));
}
function fecharFolha(){ const sh = $('#sheet'); if (sh) sh.classList.remove('aberto'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharFolha(); });
function confirmar({titulo, texto, ok, perigo, sim, fn}){
  folha(titulo, `<p class="txt-app">${texto}</p>${sim ? avisoSim(sim) : ''}<div class="acoes-app"><button class="bt ${perigo ? 'perigo cheio' : ''}" id="cfOk">${ok || 'Confirmar'}</button><button class="bt sec" data-fechar-folha>Voltar</button></div>`, pn => {
    $('#cfOk', pn).onclick = () => { fecharFolha(); fn(); };
  });
}
const avisoSim = t => `<div class="sim">${ic('alerta', 18)}<span>${t}</span></div>`;

function folhaPerfil(){
  const outra = Object.keys(ADMINS).find(n => n !== D.admin);
  folha('', `<div class="det-head" style="padding-top:0"><span class="av" style="background:var(--vp);color:var(--creme-txt)">${ini(D.admin)}</span><h2>${D.admin}</h2><p class="muted small">Administradora · mesmas permissões que ${outra}</p></div>
    ${avisoSim('Modo demonstração: a troca de perfil serve só para ver a interface. Nenhuma identidade foi verificada.')}
    <div class="acoes-app"><button class="bt sec" id="pfTroca">Ver como ${outra}</button><button class="bt perigo" id="pfSair">Sair da conta</button></div>`, pn => {
    $('#pfTroca', pn).onclick = () => { fecharFolha(); logar('Saiu do app (demonstração)'); D.admin = outra; logar('Abriu o app (demonstração, sem verificação)'); app.pilha = []; location.hash = 'painel'; renderApp('inicio'); toast('Agora você está vendo o app como ' + outra + '.'); };
    $('#pfSair', pn).onclick = () => { fecharFolha(); sairConta(); };
  });
}
function sairConta(){
  confirmar({titulo:'Sair da conta?', texto:'Você volta para a tela de entrada do app.', ok:'Sair', fn:() => { logar('Saiu do app (demonstração)'); D.admin = null; app.pilha = []; renderApp('inicio'); window.scrollTo(0,0); }});
}

/* ---------- Entrada ---------- */
function telaEntrada(root){
  root.innerHTML = `<div class="entrada">
    <img class="logo" src="img/logo.jpg" alt="Saara Nail Studio">
    <span class="tag-ent">Modo demonstração</span>
    <h2>Quem vai usar o app?</h2>
    <p>Escolher um perfil só mostra a interface. Nenhuma identidade é verificada aqui.</p>
    <div style="margin-top:14px">${Object.values(ADMINS).map(a => `<button class="pers" data-adm="${a.nome}"><span class="av">${a.ini}</span><span><b>${a.nome}</b><small>Ver o app como ${a.nome}</small></span>${ic('chev', 20)}</button>`).join('')}</div>
    <p class="rodape">Saara e Julianny têm os mesmos recursos e permissões.<br>Na versão real, cada uma entra com a própria passkey, verificada pelo servidor, com Face ID quando o aparelho permitir.<br><br><a href="#inicio">Voltar ao site da cliente</a></p>
  </div>`;
  $$('[data-adm]', root).forEach(b => b.onclick = () => { D.admin = b.dataset.adm; logar('Abriu o app (demonstração, sem verificação)'); app.pilha = []; renderApp(); window.scrollTo(0,0); });
}

/* ---------- Linhas reutilizáveis ---------- */
function linhaAt(r, comData){
  const sv = serv(r.serv);
  return `<button class="row" data-at="${r.id}"><span class="t">${fmtH(r.s)}${comData ? `<small>${dataCurta(fromKey(r.dia))}</small>` : ''}</span><span class="m"><b>${esc(nomeCli(r))}${exTag(r)}</b><span>${esc(sv.nome)}${r.presenca ? ' · presença confirmada' : ''}</span></span><span class="d">${ps(r.status)}${ic('chev', 18)}</span></button>`;
}
function ligarAt(el){ $$('[data-at]', el).forEach(b => b.onclick = () => abrirAtendimento(b.dataset.at)); }

/* ================= Início ================= */
const PAG = {};
PAG.inicio = el => {
  const hk = keyOf(hoje0()), h = agora().getHours(), m = minAgora();
  const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const deHoje = D.reservas.filter(r => r.dia === hk && ['confirmado','analise','concluido'].includes(r.status)).sort(ordR);
  const prox = D.reservas.filter(r => ['confirmado','analise'].includes(r.status) && (r.dia > hk || (r.dia === hk && r.s >= m))).sort(ordR)[0];
  const pend = D.reservas.filter(r => r.status === 'analise').length;
  const conf = D.reservas.filter(r => r.status === 'confirmado' && r.dia >= hk).length;
  const f = resumoFin(D.reservas.filter(r => r.dia.slice(0,7) === hk.slice(0,7)));
  el.innerHTML = `
    <p class="saud">${saud}, ${D.admin}!</p>
    <p class="sub-data">${dataLonga(hoje0())}</p>
    ${prox ? `<button class="prox" data-at="${prox.id}"><small>Próxima cliente · ${prox.dia === hk ? 'hoje' : dataCurta(fromKey(prox.dia))}</small><b>${esc(nomeCli(prox))}</b><span>${fmtH(prox.s)} às ${fmtH(prox.e)} · ${esc(serv(prox.serv).nome)}</span>${exTag(prox)}</button>`
      : `<div class="prox vazia">Nenhuma cliente agendada nos próximos dias.</div>`}
    <div class="stats">
      <a class="stat" href="#painel-agenda"><b>${deHoje.length}</b><span>atendimentos hoje</span></a>
      <a class="stat" href="#painel-pagamentos"><b style="${pend ? 'color:var(--alerta)' : ''}">${pend}</b><span>pagamentos em análise</span></a>
      <a class="stat" href="#painel-agenda"><b>${conf}</b><span>reservas confirmadas</span></a>
      <a class="stat" href="#painel-financeiro"><b class="menor">${brl(f.pix)}</b><span>recebimentos confirmados no mês</span></a>
    </div>
    <p class="nota-demo">Números calculados com dados de demonstração.</p>
    <div class="rapidas">
      <button class="rapida" id="qNovo"><i>${ic('plus', 24)}</i>Novo agendamento</button>
      <button class="rapida" id="qBloq"><i>${ic('bloq', 24)}</i>Bloquear horário</button>
      <button class="rapida" id="qConf"><i>${ic('conferir', 24)}</i>Conferir pagamento</button>
    </div>
    <div class="sec-tit"><h2>Hoje</h2><a href="#painel-agenda">Ver agenda</a></div>
    ${deHoje.length ? `<div class="rows">${deHoje.map(r => linhaAt(r)).join('')}</div>` : `<div class="rows">${vazioApp('agenda', 'Dia livre', 'Nenhum atendimento marcado para hoje.')}</div>`}`;
  ligarAt(el);
  $('#qNovo').onclick = () => folhaNovoAgendamento();
  $('#qBloq').onclick = () => folhaBloqueio(keyOf(addDias(hoje0(), 1)));
  $('#qConf').onclick = () => { const r = D.reservas.filter(x => x.status === 'analise').sort(ordR)[0]; if (r) abrirPagamento(r.id); else { app.pgAba = 'analise'; location.hash = 'painel-pagamentos'; } };
};

/* ================= Agenda ================= */
const doDiaApp = k => D.reservas.filter(r => r.dia === k && ['confirmado','analise','concluido','provisoria'].includes(r.status) && (r.status !== 'provisoria' || r.expira > Date.now())).sort(ordR);
PAG.agenda = el => {
  const modo = app.agModo, ref = app.agRef, hk = keyOf(hoje0());
  let html = `<div class="segm" role="group" aria-label="Visualização">${[['dia','Dia'],['semana','Semana'],['mes','Mês']].map(([v,n]) => `<button data-modo="${v}" aria-pressed="${modo===v}">${n}</button>`).join('')}</div>`;
  if (modo === 'dia' || modo === 'semana'){
    const ini0 = addDias(ref, -ref.getDay());
    const fimS = addDias(ini0, 6);
    html += `<div class="nav-per"><button class="ic-btn" data-nav="-7" aria-label="Semana anterior">${ic('voltar')}</button><b>${ini0.getDate()} a ${fimS.toLocaleDateString('pt-BR', {day:'numeric', month:'short'}).replace('.','')}</b><button class="ic-btn" data-nav="7" aria-label="Próxima semana">${ic('chev')}</button></div>`;
    if (modo === 'dia'){
      html += `<div class="faixa-dias">${Array.from({length:7}, (_, i) => { const d = addDias(ini0, i), k = keyOf(d), n = doDiaApp(k).length;
        return `<button class="dd ${k === keyOf(ref) ? 'sel' : ''} ${k === hk ? 'hoje' : ''} ${expediente(d.getDay()).length ? '' : 'fech'}" data-dd="${k}" aria-label="${dataLonga(d)}">${d.toLocaleDateString('pt-BR', {weekday:'short'}).replace('.','').slice(0,3)}<b>${d.getDate()}</b><i class="${n ? 'on' : ''}"></i></button>`; }).join('')}</div>`;
      const k = keyOf(ref), ints = expediente(ref.getDay());
      html += `<div class="dia-tit">${dataLonga(ref)}<span>${ints.length ? ints.map(([a,b]) => fmtH(a) + '–' + fmtH(b)).join(' · ') + (ref.getDay() === 6 && !D.cfg.sabRetorno ? ' · tarde a definir' : '') : 'Fechado'}</span></div>`;
      if (!ints.length) html += `<div class="rows">${vazioApp('agenda', 'Estúdio fechado', 'Domingo não há atendimentos.')}</div>`;
      else {
        const evs = doDiaApp(k).map(r => ({tipo:'r', s:r.s, e:r.e, r})).concat(D.bloqueios.filter(b => b.dia === k).map(b => ({tipo:'b', s:b.s, e:b.e, b}))).sort((a,b) => a.s - b.s);
        let linhas = '';
        for (const [a,b] of ints){
          let cur = a;
          for (const ev of evs.filter(x => x.s >= a && x.s < b)){
            if (ev.s - cur >= 30) linhas += `<div class="row livre"><span class="t">${fmtH(cur)}</span><span class="m">Livre até ${fmtH(ev.s)}</span><span></span></div>`;
            if (ev.tipo === 'r') linhas += linhaAt(ev.r);
            else linhas += `<button class="row bloq" data-bl="${ev.b.id}"><span class="t">${fmtH(ev.s)}</span><span class="m"><b>Horário bloqueado${exTag(ev.b)}</b><span>até ${fmtH(ev.e)} · ${esc(ev.b.motivo)}</span></span><span class="d">${ic('bloq', 18)}</span></button>`;
            cur = Math.max(cur, ev.e + (ev.tipo === 'r' ? INTERVALO : 0));
          }
          if (b - cur >= 30) linhas += `<div class="row livre"><span class="t">${fmtH(cur)}</span><span class="m">Livre até ${fmtH(b)}</span><span></span></div>`;
        }
        html += `<div class="rows">${linhas}</div>`;
      }
    } else {
      for (let i = 0; i < 7; i++){
        const d = addDias(ini0, i), k = keyOf(d), rs = doDiaApp(k), bl = D.bloqueios.filter(b => b.dia === k), fech = !expediente(d.getDay()).length;
        html += `<div class="grupo-tit"><span>${d.toLocaleDateString('pt-BR', {weekday:'long', day:'numeric'})}${k === hk ? ' · hoje' : ''}</span><span>${fech ? 'fechado' : rs.length + ' atend.'}</span></div>`;
        if (!fech) html += (rs.length || bl.length) ? `<div class="rows">${rs.map(r => linhaAt(r)).join('')}${bl.map(b => `<button class="row bloq" data-bl="${b.id}"><span class="t">${fmtH(b.s)}</span><span class="m"><b>Bloqueado${exTag(b)}</b><span>até ${fmtH(b.e)}</span></span><span class="d">${ic('bloq', 18)}</span></button>`).join('')}</div>` : `<div class="rows"><div class="row livre"><span class="t"></span><span class="m">Sem atendimentos</span><span></span></div></div>`;
      }
    }
  } else {
    const y = ref.getFullYear(), mo = ref.getMonth(), prim = new Date(y, mo, 1).getDay(), dias = new Date(y, mo+1, 0).getDate();
    html += `<div class="nav-per"><button class="ic-btn" data-navm="-1" aria-label="Mês anterior">${ic('voltar')}</button><b>${cap(ref.toLocaleDateString('pt-BR', {month:'long', year:'numeric'}))}</b><button class="ic-btn" data-navm="1" aria-label="Próximo mês">${ic('chev')}</button></div>`;
    html += `<div class="mes-app">${['D','S','T','Q','Q','S','S'].map(d => `<div class="dw">${d}</div>`).join('')}${'<div></div>'.repeat(prim)}`;
    for (let d = 1; d <= dias; d++){
      const dt = new Date(y, mo, d), k = keyOf(dt), rs = doDiaApp(k), fech = !expediente(dt.getDay()).length;
      html += `<button class="${fech ? 'fech' : ''} ${k === hk ? 'hoje' : ''}" data-irdia="${k}" aria-label="${dataLonga(dt)}: ${rs.length} atendimentos"><span>${d}</span><span class="pts">${rs.slice(0,3).map(r => `<i class="${r.status === 'analise' ? 'an' : ''}"></i>`).join('')}</span></button>`;
    }
    html += `</div><div class="leg"><span><i></i>atendimento</span><span><i class="an"></i>pagamento em análise</span></div>`;
  }
  el.innerHTML = html;
  $$('[data-modo]', el).forEach(b => b.onclick = () => { app.agModo = b.dataset.modo; reApp(); });
  $$('[data-nav]', el).forEach(b => b.onclick = () => { app.agRef = addDias(app.agRef, +b.dataset.nav); reApp(); });
  $$('[data-navm]', el).forEach(b => b.onclick = () => { app.agRef = new Date(ref.getFullYear(), ref.getMonth() + (+b.dataset.navm), 1); reApp(); });
  $$('[data-dd]', el).forEach(b => b.onclick = () => { app.agRef = fromKey(b.dataset.dd); reApp(); });
  $$('[data-irdia]', el).forEach(b => b.onclick = () => { app.agRef = fromKey(b.dataset.irdia); app.agModo = 'dia'; reApp(); });
  $$('[data-bl]', el).forEach(b => b.onclick = () => {
    const x = D.bloqueios.find(y => y.id === b.dataset.bl);
    confirmar({titulo:'Desbloquear horário?', texto:`${dataLonga(fromKey(x.dia))}, ${fmtH(x.s)} às ${fmtH(x.e)} volta a ficar disponível para as clientes.`, ok:'Desbloquear', fn:() => { D.bloqueios = D.bloqueios.filter(y => y !== x); logar('Removeu o bloqueio de ' + dataCurta(fromKey(x.dia)) + ' ' + fmtH(x.s) + '–' + fmtH(x.e)); toast('Horário desbloqueado (simulação).'); reApp(); }});
  });
  ligarAt(el);
  return {label:'Adicionar', fn:() => folha('Adicionar', `<div class="acoes-app"><button class="bt" id="adNovo">${ic('plus', 20)} Novo agendamento</button><button class="bt sec" id="adBloq">${ic('bloq', 20)} Bloquear horário</button></div>`, pn => {
    $('#adNovo', pn).onclick = () => folhaNovoAgendamento(keyOf(app.agRef));
    $('#adBloq', pn).onclick = () => folhaBloqueio(keyOf(app.agRef));
  })};
};

function opcoesHoraApp(sel){ let o = ''; for (let t = 360; t <= 1320; t += 15) o += `<option value="${t}" ${t===sel ? 'selected' : ''}>${fmtH(t)}</option>`; return o; }
function folhaBloqueio(diaK){
  if (diaK < keyOf(hoje0())) diaK = keyOf(hoje0());
  folha('Bloquear horário', `<p class="txt-app">O período bloqueado deixa de aparecer para as clientes.</p>
    <div class="campo-app"><label for="bD">Dia</label><input type="date" id="bD" value="${diaK}" min="${keyOf(hoje0())}" max="2027-12-31"></div>
    <div class="duas-col"><div class="campo-app"><label for="bI">Início</label><select id="bI">${opcoesHoraApp(840)}</select></div><div class="campo-app"><label for="bF">Fim</label><select id="bF">${opcoesHoraApp(900)}</select></div></div>
    <div class="opc-lista"><label><input type="checkbox" id="bT"> Bloquear o dia inteiro</label></div>
    <div class="campo-app"><label for="bM">Motivo (só o app mostra)</label><input id="bM" placeholder="Ex.: curso, consulta, folga"></div>
    <p id="bE" class="small" style="color:var(--erro);margin-bottom:10px"></p>
    <div class="acoes-app"><button class="bt" id="bOk">Bloquear</button><button class="bt sec" data-fechar-folha>Cancelar</button></div>`, pn => {
    $('#bOk', pn).onclick = () => {
      const k = $('#bD', pn).value, err = t => { $('#bE', pn).textContent = t; };
      if (!k) return err('Escolha o dia.');
      const d = fromKey(k), ints = expediente(d.getDay());
      let s = +$('#bI', pn).value, e = +$('#bF', pn).value;
      if ($('#bT', pn).checked){ if (!ints.length) return err('O estúdio já está fechado nesse dia.'); s = ints[0][0]; e = ints[ints.length-1][1]; }
      if (e <= s) return err('O fim precisa ser depois do início.');
      const conf = D.reservas.filter(r => r.dia === k && ativa(r) && r.s < e && r.e > s);
      if (conf.length) return err('Já existe atendimento nesse período (' + conf.map(r => nomeCli(r)).join(', ') + '). Reagende ou cancele antes.');
      fecharFolha();
      confirmar({titulo:'Confirmar bloqueio', texto:`${dataLonga(d)}, das ${fmtH(s)} às ${fmtH(e)}.`, ok:'Bloquear', fn:() => {
        D.bloqueios.push({id:'B-' + Date.now(), dia:k, s, e, motivo:$('#bM', pn).value.trim() || 'Sem motivo informado'});
        logar('Bloqueou ' + dataCurta(d) + ' das ' + fmtH(s) + ' às ' + fmtH(e));
        toast('Horário bloqueado (simulação).'); app.agRef = d; app.agModo = 'dia';
        if (app.sub === 'agenda' && !app.pilha.length) reApp(); else { app.pilha = []; location.hash = 'painel-agenda'; }
      }});
    };
  });
}

function seletorHorario(pn, dur, ignorar, aoEscolher){
  let dia = null, hora = null;
  const pintar = () => {
    const box = $('#shSlots', pn);
    if (!dia){ box.innerHTML = ''; return; }
    const hs = horarios(dia, dur, ignorar);
    box.innerHTML = hs.length ? gruposHorarios(hs, dur, hora, 'data-shh') : `<p class="txt-app">${expediente(dia.getDay()).length ? 'Sem horários livres nesse dia.' : 'Estúdio fechado nesse dia.'}</p>`;
    $$('[data-shh]', box).forEach(b => b.onclick = () => { hora = +b.dataset.shh; pintar(); aoEscolher(dia, hora); });
  };
  $('#shDia', pn).onchange = e => { dia = e.target.value ? fromKey(e.target.value) : null; hora = null; aoEscolher(null, null); pintar(); };
  return {repintar:() => { hora = null; aoEscolher(null, null); pintar(); }};
}
function folhaNovoAgendamento(diaK){
  const amanha = keyOf(addDias(hoje0(), 1));
  const clis = D.clientes.slice().sort((a,b) => a.nome.localeCompare(b.nome));
  folha('Novo agendamento', `
    <div class="campo-app"><label for="nC">Cliente</label><select id="nC"><option value="">Escolha a cliente</option><option value="nova">+ Nova cliente</option>${clis.map(c => `<option value="${c.id}">${esc(c.nome)}${c.exemplo ? ' (exemplo)' : ''}</option>`).join('')}</select></div>
    <div id="nNova" hidden><div class="campo-app"><label for="nNome">Nome</label><input id="nNome"></div><div class="campo-app"><label for="nTel">WhatsApp</label><input id="nTel" type="tel" placeholder="(99) 99999-9999"></div></div>
    <div class="campo-app"><label for="nS">Procedimento</label><select id="nS">${D.servicos.map(s => `<option value="${s.id}">${esc(s.nome)} · ${fmtH(s.dur)} · ${brl(s.preco)}</option>`).join('')}</select></div>
    <div class="campo-app"><label for="shDia">Dia</label><input type="date" id="shDia" min="${amanha}" max="2027-12-31" value="${diaK && diaK >= amanha ? diaK : ''}"><small>Mesmas regras do site: expediente, intervalo de 15 min e 24 h de antecedência.</small></div>
    <div class="slots slots-app" id="shSlots"></div>
    <p class="txt-app" style="margin-top:12px">Agendamentos feitos pelo app ficam com pagamento combinado no estúdio.</p>
    <p id="nE" class="small" style="color:var(--erro);margin-bottom:10px"></p>
    <div class="acoes-app"><button class="bt" id="nOk" disabled>Agendar</button><button class="bt sec" data-fechar-folha>Cancelar</button></div>`, pn => {
    let escolha = null;
    $('#nC', pn).onchange = e => { $('#nNova', pn).hidden = e.target.value !== 'nova'; };
    const sel = seletorHorario(pn, serv($('#nS', pn).value).dur, null, (d, h) => { escolha = d ? {d, h} : null; $('#nOk', pn).disabled = !escolha; });
    $('#nS', pn).onchange = () => { pn.__dur = serv($('#nS', pn).value).dur; sel2(); };
    let sel2 = () => {};
    const refazer = () => { const s2 = seletorHorario(pn, serv($('#nS', pn).value).dur, null, (d, h) => { escolha = d ? {d, h} : null; $('#nOk', pn).disabled = !escolha; }); if ($('#shDia', pn).value) $('#shDia', pn).dispatchEvent(new Event('change')); return s2; };
    sel2 = refazer;
    if ($('#shDia', pn).value) $('#shDia', pn).dispatchEvent(new Event('change'));
    void sel;
    $('#nOk', pn).onclick = () => {
      const err = t => { $('#nE', pn).textContent = t; };
      let cid = $('#nC', pn).value;
      if (!cid) return err('Escolha a cliente.');
      if (cid === 'nova' && ($('#nNome', pn).value.trim().length < 2 || $('#nTel', pn).value.replace(/\D/g,'').length < 10)) return err('Preencha nome e WhatsApp com DDD.');
      const sv = serv($('#nS', pn).value);
      if (!escolha || !horarios(escolha.d, sv.dur).includes(escolha.h)) return err('Escolha um horário disponível.');
      const nomeTxt = cid === 'nova' ? $('#nNome', pn).value.trim() : cliente(cid).nome;
      fecharFolha();
      confirmar({titulo:'Confirmar agendamento', texto:`${esc(nomeTxt)} · ${esc(sv.nome)}<br>${dataLonga(escolha.d)}, ${fmtH(escolha.h)} às ${fmtH(escolha.h + sv.dur)}.`, ok:'Agendar', fn:() => {
        if (cid === 'nova'){ const c = {id:'C-' + (300 + D.clientes.length), nome:nomeTxt, whats:$('#nTel', pn).value.trim(), obs:''}; D.clientes.push(c); cid = c.id; logar('Cadastrou a cliente ' + c.nome); }
        const r = {id:'R-' + (D.seq++), dia:keyOf(escolha.d), s:escolha.h, e:escolha.h + sv.dur, serv:sv.id, preco:sv.preco, cli:cid, pag:'estudio', valor:0, status:'confirmado', criado:agora(), obs:'', pelaEquipe:true};
        D.reservas.push(r); logar('Criou o agendamento ' + r.id + ' para ' + nomeTxt);
        toast('Agendamento criado (simulação).'); app.agRef = escolha.d; abrirAtendimento(r.id);
      }});
    };
  });
}

/* ---------- Detalhe do atendimento ---------- */
function abrirAtendimento(id){ abrirPagina('Atendimento', el => paginaAtendimento(el, id)); }
function paginaAtendimento(el, id){
  const r = D.reservas.find(x => x.id === id); if (!r){ el.innerHTML = vazioApp('agenda', 'Atendimento não encontrado'); return; }
  const c = cliente(r.cli), sv = serv(r.serv), d = fromKey(r.dia), hk = keyOf(hoje0());
  const futuroOuHoje = r.dia >= hk, ativoAg = ['confirmado','analise'].includes(r.status);
  el.innerHTML = `
    <div class="det-head"><span class="av">${ini(nomeCli(r))}</span><h2>${esc(nomeCli(r))}</h2>
      <div class="linha-st">${ps(r.status)}${r.presenca ? '<span class="chip-pres">Presença confirmada</span>' : ''}${exTag(r)}</div></div>
    <div class="info">
      <div class="l"><span>Procedimento</span><span>${esc(sv.nome)}</span></div>
      <div class="l"><span>Data</span><span>${dataLonga(d)}</span></div>
      <div class="l"><span>Horário</span><span class="num">${fmtH(r.s)} às ${fmtH(r.e)}</span></div>
      <div class="l"><span>Valor do serviço</span><span class="num">${brl(r.preco)}</span></div>
      <div class="l"><span>Pagamento</span><span>${pagTxt(r)}${r.valor ? ' · <span class="num">' + brl(r.valor) + '</span>' : ''}</span></div>
      ${r.pag !== 'total' && ['confirmado','concluido'].includes(r.status) ? `<div class="l"><span>A receber no dia</span><span class="num">${brl(r.preco - (r.valor || 0))}</span></div>` : ''}
      ${r.motivo ? `<div class="l"><span>Motivo</span><span>${esc(r.motivo)}</span></div>` : ''}
      <div class="l"><span>Código</span><span class="num">${r.id}</span></div>
    </div>
    <div class="campo-app"><label for="atObs">Observação interna</label><textarea id="atObs" rows="2" placeholder="Só a equipe vê">${esc(r.obs || '')}</textarea></div>
    <div class="acoes-app">
      ${r.status === 'analise' ? `<button class="bt" id="atPag">${ic('conferir', 20)} Conferir pagamento</button>` : ''}
      ${r.status === 'confirmado' && futuroOuHoje && !r.presenca ? `<button class="bt" id="atPres">Confirmar presença</button>` : ''}
      ${r.status === 'confirmado' && r.dia <= hk ? `<button class="bt ${r.presenca || r.dia < hk ? '' : 'sec'}" id="atConc">Concluir serviço</button>` : ''}
      ${ativoAg && futuroOuHoje ? `<button class="bt sec" id="atReag">Reagendar</button>` : ''}
      ${c ? `<div class="acoes-app duas"><a class="bt sec" href="https://wa.me/55${c.whats.replace(/\D/g,'')}" target="_blank" rel="noopener">${ic('wa', 20)} WhatsApp</a><button class="bt sec" id="atCli">Ver cliente</button></div>` : ''}
      ${ativoAg && futuroOuHoje ? `<button class="bt perigo" id="atCanc">Cancelar atendimento</button>` : ''}
    </div>`;
  const on = (sel, fn) => { const b = $(sel, el); if (b) b.onclick = fn; };
  $('#atObs', el).onchange = e => { r.obs = e.target.value; logar('Editou a observação de ' + r.id); toast('Observação salva (simulação).'); };
  on('#atPag', () => abrirPagamento(r.id));
  on('#atCli', () => abrirCliente(r.cli));
  on('#atPres', () => confirmar({titulo:'Confirmar presença?', texto:`Registrar que ${esc(nomeCli(r))} confirmou que vem ${r.dia === hk ? 'hoje' : 'em ' + dataCurta(d)} às ${fmtH(r.s)}.`, ok:'Confirmar presença', fn:() => { r.presenca = true; logar('Confirmou a presença de ' + nomeCli(r) + ' (' + r.id + ')'); toast('Presença confirmada (simulação).'); reApp(); }}));
  on('#atConc', () => confirmar({titulo:'Concluir serviço?', texto:`${esc(sv.nome)} de ${esc(nomeCli(r))}.${r.pag !== 'total' ? ' Lembre de receber ' + brl(r.preco - (r.valor || 0)) + ' no estúdio.' : ''}`, ok:'Concluir', fn:() => { r.status = 'concluido'; logar('Concluiu o atendimento ' + r.id); toast('Serviço concluído (simulação).'); reApp(); }}));
  on('#atReag', () => folhaReagendar(r));
  on('#atCanc', () => folhaMotivo('Cancelar atendimento', ['Pedido da cliente','Imprevisto do estúdio','Cliente não confirmou','Outro'], 'Cancelar atendimento', m => {
    r.status = 'cancelado'; r.motivo = m; logar('Cancelou ' + r.id + ': ' + m); toast('Atendimento cancelado e horário liberado (simulação).'); reApp();
  }, 'O horário volta a ficar disponível. Avise a cliente pelo WhatsApp.'));
}
function folhaReagendar(r){
  const sv = serv(r.serv), amanha = keyOf(addDias(hoje0(), 1)); let escolha = null;
  folha('Reagendar', `<p class="txt-app">${esc(nomeCli(r))} · ${esc(sv.nome)}<br>Atual: ${dataLonga(fromKey(r.dia))}, ${fmtH(r.s)}</p>
    <div class="campo-app"><label for="shDia">Novo dia</label><input type="date" id="shDia" min="${amanha}" max="2027-12-31"></div>
    <div class="slots slots-app" id="shSlots"></div>
    <div class="acoes-app" style="margin-top:16px"><button class="bt" id="rgOk" disabled>Continuar</button><button class="bt sec" data-fechar-folha>Cancelar</button></div>`, pn => {
    seletorHorario(pn, sv.dur, r.id, (d, h) => { escolha = d ? {d, h} : null; $('#rgOk', pn).disabled = !escolha; });
    $('#rgOk', pn).onclick = () => {
      fecharFolha();
      confirmar({titulo:'Confirmar reagendamento', texto:`De ${dataCurta(fromKey(r.dia))} ${fmtH(r.s)}<br>para <b>${dataLonga(escolha.d)}, ${fmtH(escolha.h)}</b>.`, ok:'Reagendar', fn:() => {
        if (!horarios(escolha.d, sv.dur, r.id).includes(escolha.h)){ toast('Esse horário ficou indisponível. Escolha outro.'); return; }
        const antes = dataCurta(fromKey(r.dia)) + ' ' + fmtH(r.s);
        Object.assign(r, {dia:keyOf(escolha.d), s:escolha.h, e:escolha.h + sv.dur, presenca:false});
        logar('Reagendou ' + r.id + ' de ' + antes + ' para ' + dataCurta(escolha.d) + ' ' + fmtH(escolha.h));
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
function folhaComprovante(r){
  logar('Visualizou o comprovante de ' + r.id);
  const a = r.arquivo; let corpo;
  if (a.url && a.tipo && a.tipo.startsWith('image/')) corpo = `<img src="${a.url}" alt="Comprovante enviado" style="width:100%;border-radius:14px;border:1px solid var(--creme-2)">`;
  else if (a.url) corpo = `<div class="rows">${vazioApp('doc', 'PDF anexado', 'No sistema real ele abre aqui, com acesso só de Saara e Julianny.')}</div>`;
  else corpo = `<div class="rows">${vazioApp('doc', 'Comprovante de exemplo', 'Não existe arquivo real nesta demonstração.')}</div>`;
  folha('Comprovante', `<p class="txt-app">${esc(a.nome)} · ${r.id}</p>${corpo}<div class="acoes-app" style="margin-top:14px"><button class="bt sec" data-fechar-folha>Fechar</button></div>`);
}

/* ================= Pagamentos ================= */
const comPix = r => r.arquivo && r.pag !== 'estudio';
PAG.pagamentos = el => {
  const grupos = {analise:r => r.status === 'analise', confirmado:r => ['confirmado','concluido'].includes(r.status), recusado:r => r.status === 'recusado'};
  const n = k => D.reservas.filter(r => comPix(r) && grupos[k](r)).length;
  const lista = D.reservas.filter(r => comPix(r) && grupos[app.pgAba](r)).sort(ordR);
  if (app.pgAba !== 'analise') lista.reverse();
  el.innerHTML = `<div class="segm" role="group" aria-label="Situação">${[['analise','Em análise'],['confirmado','Confirmados'],['recusado','Recusados']].map(([k,t]) => `<button data-aba="${k}" aria-pressed="${app.pgAba===k}">${t} <span class="num">${n(k)}</span></button>`).join('')}</div>
    ${app.pgAba === 'analise' && lista.length ? `<p class="txt-app">Confira cada Pix no app do ${esc(D.cfg.banco)} antes de aprovar.</p>` : ''}
    ${lista.length ? `<div class="rows">${lista.map(r => `<button class="row" data-pg="${r.id}"><span class="av">${ini(nomeCli(r))}</span><span class="m"><b>${esc(nomeCli(r))}${exTag(r)}</b><span>${esc(serv(r.serv).nome)} · ${dataCurta(fromKey(r.dia))}</span></span><span class="d"><span class="v">${brl(r.valor)}</span>${ic('chev', 18)}</span></button>`).join('')}</div>`
      : `<div class="rows">${app.pgAba === 'analise' ? vazioApp('conferir', 'Tudo em dia', 'Nenhum pagamento aguardando análise.') : vazioApp('pag', 'Nada por aqui', app.pgAba === 'recusado' ? 'Nenhum pagamento recusado.' : 'Nenhum pagamento confirmado ainda.')}</div>`}`;
  $$('[data-aba]', el).forEach(b => b.onclick = () => { app.pgAba = b.dataset.aba; reApp(); });
  $$('[data-pg]', el).forEach(b => b.onclick = () => abrirPagamento(b.dataset.pg));
};
function abrirPagamento(id){ abrirPagina('Pagamento', el => paginaPagamento(el, id)); }
function paginaPagamento(el, id){
  const r = D.reservas.find(x => x.id === id), sv = serv(r.serv);
  el.innerHTML = `
    ${avisoSim('Simulação. Aprovar ou recusar aqui não representa confirmação bancária e não consulta o ' + esc(D.cfg.banco) + '.')}
    <div class="det-head" style="padding-top:4px"><div class="valor-g num">${brl(r.valor)}</div><p class="muted small" style="margin-top:6px">${r.pag === 'sinal' ? 'Sinal de 30%' : 'Valor total antecipado'}</p><div class="linha-st">${ps(r.status)}${exTag(r)}</div></div>
    <div class="info">
      <div class="l"><span>Cliente</span><span>${esc(nomeCli(r))}</span></div>
      <div class="l"><span>Procedimento</span><span>${esc(sv.nome)}</span></div>
      <div class="l"><span>Valor esperado</span><span class="num">${brl(r.valor)}</span></div>
      <div class="l"><span>Data do atendimento</span><span>${dataCurta(fromKey(r.dia))}, ${fmtH(r.s)}</span></div>
      <div class="l"><span>Comprovante enviado</span><span class="num">${r.enviado ? dataHora(r.enviado) : (r.exemplo ? 'exemplo' : '—')}</span></div>
      <div class="l"><span>Status</span><span>${STATUS[r.status][1]}</span></div>
      ${r.aprovadoPor ? `<div class="l"><span>Aprovado por</span><span>${esc(r.aprovadoPor)}</span></div>` : ''}
      ${r.motivo && r.status === 'recusado' ? `<div class="l"><span>Motivo</span><span>${esc(r.motivo)}</span></div>` : ''}
    </div>
    <button class="bt sec" id="pgComp" style="margin-bottom:14px">${ic('doc', 20)} Ver comprovante</button>
    ${r.status === 'analise' ? `
      <label class="conf-app"><input type="checkbox" id="pgChk"> <span>Conferi no extrato do ${esc(D.cfg.banco)} que <b class="num">${brl(r.valor)}</b> entrou.</span></label>
      <div class="acoes-app duas"><button class="bt perigo" id="pgRec">Recusar</button><button class="bt" id="pgAp" disabled>Aprovar</button></div>
      <p class="nota-demo" style="text-align:center">Botões de demonstração.</p>` : ''}
    <div class="acoes-app" style="margin-top:12px"><button class="bt sec" id="pgAt">Ver atendimento</button></div>`;
  $('#pgComp', el).onclick = () => folhaComprovante(r);
  $('#pgAt', el).onclick = () => abrirAtendimento(r.id);
  if (r.status === 'analise'){
    $('#pgChk', el).onchange = e => { $('#pgAp', el).disabled = !e.target.checked; };
    $('#pgAp', el).onclick = () => confirmar({titulo:'Aprovar pagamento?', texto:`${brl(r.valor)} de ${esc(nomeCli(r))} · ${esc(sv.nome)}. O atendimento passa a constar como confirmado.`, sim:'Simulação: nenhum dado bancário é consultado ou alterado.', ok:'Aprovar (simulação)', fn:() => {
      r.status = 'confirmado'; r.aprovadoPor = D.admin; logar('Aprovou o pagamento de ' + r.id + ' (' + brl(r.valor) + ')');
      toast('Aprovado por ' + D.admin + ' (simulação). Envie a confirmação pelo WhatsApp.'); reApp();
    }});
    $('#pgRec', el).onclick = () => folhaMotivo('Recusar pagamento', ['Pix não encontrado no extrato','Valor diferente do esperado','Comprovante ilegível','Outro'], 'Recusar (simulação)', m => {
      r.status = 'recusado'; r.motivo = m; logar('Recusou o pagamento de ' + r.id + ': ' + m); toast('Pagamento recusado e horário liberado (simulação).'); reApp();
    }, 'O horário da cliente é liberado. Simulação: nada é alterado no banco.');
  }
}

/* ================= Clientes ================= */
PAG.clientes = el => {
  el.innerHTML = `<div class="busca">${ic('busca', 20)}<input id="cBusca" type="search" placeholder="Buscar por nome ou telefone" value="${esc(app.busca)}" aria-label="Buscar clientes"></div><p class="nota-demo" style="margin:0 4px 4px">Clientes marcadas como "exemplo" são fictícias.</p><div id="cLista"></div>`;
  const pintar = () => {
    const b = app.busca.toLowerCase().trim(), bn = b.replace(/\D/g,'');
    const cs = D.clientes.filter(c => !b || c.nome.toLowerCase().includes(b) || (bn && c.whats.replace(/\D/g,'').includes(bn))).sort((a,c) => a.nome.localeCompare(c.nome));
    if (!cs.length){ $('#cLista').innerHTML = `<div class="rows" style="margin-top:12px">${vazioApp('busca', 'Nenhuma cliente encontrada', 'Confira a grafia ou cadastre uma nova pelo botão +.')}</div>`; return; }
    let html = '', letra = '';
    const grupos = [];
    cs.forEach(c => { const l = c.nome.charAt(0).toUpperCase(); if (l !== letra){ letra = l; grupos.push([l, []]); } grupos[grupos.length-1][1].push(c); });
    grupos.forEach(([l, g]) => { html += `<div class="grupo-tit"><span>${l}</span></div><div class="rows">${g.map(c => { const n = D.reservas.filter(r => r.cli === c.id && ['confirmado','concluido'].includes(r.status)).length; return `<button class="row" data-cli="${c.id}"><span class="av">${ini(c.nome)}</span><span class="m"><b>${esc(c.nome)}${exTag(c)}</b><span class="num">${esc(c.whats)} · ${n} atend.</span></span><span class="d">${ic('chev', 18)}</span></button>`; }).join('')}</div>`; });
    $('#cLista').innerHTML = html;
    $$('[data-cli]', el).forEach(x => x.onclick = () => abrirCliente(x.dataset.cli));
  };
  $('#cBusca').oninput = e => { app.busca = e.target.value; pintar(); };
  pintar();
  return {label:'Nova cliente', fn:() => folhaCliente()};
};
function abrirCliente(id){ abrirPagina('Cliente', el => paginaCliente(el, id)); }
function paginaCliente(el, id){
  const c = cliente(id), hk = keyOf(hoje0());
  const rs = D.reservas.filter(r => r.cli === id && !['provisoria','expirada'].includes(r.status));
  const prox = rs.filter(r => r.dia >= hk && ['confirmado','analise'].includes(r.status)).sort(ordR);
  const hist = rs.filter(r => !prox.includes(r)).sort(ordR).reverse();
  const feitos = rs.filter(r => r.status === 'concluido');
  el.innerHTML = `<div class="det-head"><span class="av">${ini(c.nome)}</span><h2>${esc(c.nome)}</h2><div class="linha-st">${exTag(c)}</div></div>
    <div class="acoes-app duas" style="margin-bottom:14px"><a class="bt sec" href="https://wa.me/55${c.whats.replace(/\D/g,'')}" target="_blank" rel="noopener">${ic('wa', 20)} WhatsApp</a><button class="bt sec" id="clEd">${ic('editar', 20)} Editar</button></div>
    <div class="info">
      <div class="l"><span>WhatsApp</span><span class="num">${esc(c.whats)}</span></div>
      <div class="l"><span>Atendimentos concluídos</span><span class="num">${feitos.length}</span></div>
      <div class="l"><span>Total em serviços</span><span class="num">${brl(feitos.reduce((s,r) => s + r.preco, 0))}</span></div>
      ${c.obs ? `<div class="l"><span>Observações</span><span>${esc(c.obs)}</span></div>` : ''}
    </div>
    <div class="info-tit">Próximos atendimentos</div>
    ${prox.length ? `<div class="rows">${prox.map(r => linhaAt(r, true)).join('')}</div>` : `<div class="rows">${vazioApp('agenda', 'Nenhum horário marcado')}</div>`}
    <div class="info-tit">Histórico</div>
    ${hist.length ? `<div class="rows">${hist.map(r => linhaAt(r, true)).join('')}</div>` : `<div class="rows">${vazioApp('hist', 'Sem histórico ainda')}</div>`}`;
  $('#clEd', el).onclick = () => folhaCliente(c);
  ligarAt(el);
}
function folhaCliente(c){
  folha(c ? 'Editar cliente' : 'Nova cliente', `
    <div class="campo-app"><label for="fcN">Nome</label><input id="fcN" value="${esc(c ? c.nome : '')}" autocomplete="off"></div>
    <div class="campo-app"><label for="fcT">WhatsApp</label><input id="fcT" type="tel" value="${esc(c ? c.whats : '')}" placeholder="(99) 99999-9999"></div>
    <div class="campo-app"><label for="fcO">Observações</label><textarea id="fcO" rows="3" placeholder="Preferências, formato favorito, cuidados informados pela cliente">${esc(c ? c.obs : '')}</textarea><small>Não é necessário guardar CPF.</small></div>
    <p id="fcE" class="small" style="color:var(--erro);margin-bottom:10px"></p>
    <div class="acoes-app"><button class="bt" id="fcOk">Salvar</button><button class="bt sec" data-fechar-folha>Cancelar</button></div>`, pn => {
    $('#fcOk', pn).onclick = () => {
      const nome = $('#fcN', pn).value.trim(), tel = $('#fcT', pn).value.trim(), obs = $('#fcO', pn).value.trim();
      if (nome.length < 2 || tel.replace(/\D/g,'').length < 10){ $('#fcE', pn).textContent = 'Preencha o nome e o WhatsApp com DDD.'; return; }
      if (c) Object.assign(c, {nome, whats:tel, obs}); else D.clientes.push({id:'C-' + (300 + D.clientes.length), nome, whats:tel, obs});
      logar((c ? 'Editou' : 'Cadastrou') + ' a cliente ' + nome); fecharFolha(); toast('Cliente salva (simulação).'); reApp();
    };
  });
}

/* ================= Mais ================= */
PAG.mais = el => {
  const outra = Object.keys(ADMINS).find(n => n !== D.admin), nl = D.notifs.filter(n => !n.lida).length;
  const item = (id, icone, t, extra) => `<a class="row" href="#painel-${id}"><span class="ico">${ic(icone, 20)}</span><span class="m"><b>${t}</b></span><span class="d">${extra || ''}${ic('chev', 18)}</span></a>`;
  el.innerHTML = `
    <div class="perfil-mais"><span class="av">${ini(D.admin)}</span><span><b>${D.admin}</b><span>Mesmas permissões que ${outra}</span></span><button id="mTroca">Ver como ${outra}</button></div>
    <div class="grupo-tit">Gestão</div>
    <div class="rows">${item('servicos','servicos','Serviços e preços')}${item('portfolio','port','Portfólio')}${item('financeiro','fin','Financeiro')}${item('notificacoes','notif','Notificações', nl ? `<span class="ps p-analise num">${nl}</span>` : '')}</div>
    <div class="grupo-tit">Estúdio</div>
    <div class="rows">${item('expediente','relogio','Expediente')}${item('pix','pix','Pix')}${item('politicas','pol','Políticas do estúdio')}</div>
    <div class="grupo-tit">Conta</div>
    <div class="rows">${item('seguranca','seg','Segurança')}${item('historico','hist','Histórico de ações')}
      <a class="row" href="#inicio"><span class="ico">${ic('site', 20)}</span><span class="m"><b>Ver site da cliente</b></span><span class="d">${ic('chev', 18)}</span></a>
      <button class="row" id="mSair"><span class="ico" style="color:var(--erro)">${ic('sair', 20)}</span><span class="m"><b style="color:var(--erro)">Sair da conta</b></span><span></span></button></div>
    <p class="nota-demo" style="text-align:center;margin-top:18px">Saara Nail Studio · protótipo do app administrativo</p>`;
  $('#mTroca').onclick = folhaPerfil;
  $('#mSair').onclick = sairConta;
};

PAG.servicos = el => {
  el.innerHTML = `<p class="txt-app">As mudanças aparecem no site e valem para novos agendamentos. Quem já agendou mantém o valor combinado.</p>
    <div class="rows">${D.servicos.map(s => `<button class="row" data-sv="${s.id}"><span class="ico">${ic('servicos', 20)}</span><span class="m"><b>${esc(s.nome)}</b><span class="num">${fmtH(s.dur)} · sinal ${brl(s.preco * .3)}</span></span><span class="d"><span class="v">${brl(s.preco)}</span>${ic('chev', 18)}</span></button>`).join('')}</div>`;
  $$('[data-sv]', el).forEach(b => b.onclick = () => {
    const s = serv(b.dataset.sv); let opDur = ''; for (let m = 30; m <= 300; m += 15) opDur += `<option value="${m}" ${m === s.dur ? 'selected' : ''}>${fmtH(m)}</option>`;
    folha(s.nome, `
      <div class="campo-app"><label for="svN">Nome</label><input id="svN" value="${esc(s.nome)}"></div>
      <div class="duas-col"><div class="campo-app"><label for="svP">Preço (R$)</label><input id="svP" type="number" inputmode="decimal" min="1" step="0.01" value="${s.preco}"></div><div class="campo-app"><label for="svD">Duração</label><select id="svD">${opDur}</select></div></div>
      <div class="campo-app"><label for="svX">Descrição</label><textarea id="svX" rows="3">${esc(s.desc)}</textarea></div>
      <div class="acoes-app"><button class="bt" id="svOk">Salvar</button><button class="bt sec" data-fechar-folha>Cancelar</button></div>`, pn => {
      $('#svOk', pn).onclick = () => {
        const novo = {nome:$('#svN', pn).value.trim(), preco:Math.round(parseFloat($('#svP', pn).value) * 100) / 100, dur:+$('#svD', pn).value, desc:$('#svX', pn).value.trim()};
        if (!novo.nome || !(novo.preco > 0)){ toast('Preencha nome e preço.'); return; }
        const mud = [];
        if (novo.preco !== s.preco) mud.push('preço de ' + brl(s.preco) + ' para ' + brl(novo.preco));
        if (novo.dur !== s.dur) mud.push('duração de ' + fmtH(s.dur) + ' para ' + fmtH(novo.dur));
        if (novo.nome !== s.nome) mud.push('nome para ' + novo.nome);
        if (novo.desc !== s.desc) mud.push('descrição');
        if (!mud.length){ fecharFolha(); return; }
        fecharFolha();
        confirmar({titulo:'Salvar alterações?', texto:esc(s.nome) + ': ' + esc(mud.join(', ')) + '.', ok:'Salvar', fn:() => { Object.assign(s, novo); logar('Alterou ' + s.nome + ': ' + mud.join(', ')); toast('Serviço atualizado (simulação).'); reApp(); }});
      };
    });
  });
};

PAG.portfolio = el => {
  el.innerHTML = `<p class="txt-app">Publique só fotos com autorização das clientes. A ordem aqui é a ordem no site.</p>
    <label class="bt" for="pfUp" style="cursor:pointer;margin-bottom:14px">${ic('plus', 20)} Adicionar fotos</label><input type="file" id="pfUp" accept="image/*" multiple hidden>
    ${D.portfolio.length ? `<div class="pgrid">${D.portfolio.map((p,i) => `<button data-pf="${p.id}" aria-label="Editar foto ${i+1}"><img src="${p.url}" alt="${esc(p.legenda || 'Foto do portfólio')}"><span class="n num">${i+1}</span></button>`).join('')}</div>`
      : `<div class="rows">${vazioApp('foto', 'Nenhuma foto ainda', 'O site mostra "Foto em breve" até a primeira ser publicada.')}</div>`}
    <p class="nota-demo" style="margin-top:12px">Protótipo: as fotos ficam só neste navegador.</p>`;
  $('#pfUp', el).onchange = e => {
    const fs = Array.from(e.target.files); if (!fs.length) return;
    fs.forEach(f => D.portfolio.push({id:'P' + Math.random().toString(36).slice(2,8), url:URL.createObjectURL(f), legenda:'', cat:D.servicos[0].id}));
    logar('Adicionou ' + fs.length + ' foto(s) ao portfólio'); toast(fs.length + ' foto(s) adicionada(s) (simulação).'); reApp();
  };
  $$('[data-pf]', el).forEach(b => b.onclick = () => {
    const i = D.portfolio.findIndex(p => p.id === b.dataset.pf), p = D.portfolio[i];
    folha('Foto ' + (i+1), `<img src="${p.url}" alt="" style="width:100%;border-radius:16px;margin-bottom:14px;max-height:42vh;object-fit:cover">
      <div class="campo-app"><label for="pL">Legenda</label><input id="pL" value="${esc(p.legenda)}" placeholder="Ex.: Molde F1 nude"></div>
      <div class="campo-app"><label for="pC">Procedimento</label><select id="pC">${D.servicos.map(s => `<option value="${s.id}" ${p.cat===s.id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></div>
      <div class="acoes-app duas" style="margin-bottom:10px"><button class="bt sec" id="pA" ${i===0 ? 'disabled' : ''}>Mover antes</button><button class="bt sec" id="pD" ${i===D.portfolio.length-1 ? 'disabled' : ''}>Mover depois</button></div>
      <div class="acoes-app"><button class="bt" id="pOk">Salvar</button><button class="bt perigo" id="pR">Retirar do site</button></div>`, pn => {
      const mover = d => { const j = i + d; [D.portfolio[i], D.portfolio[j]] = [D.portfolio[j], D.portfolio[i]]; fecharFolha(); reApp(); };
      $('#pA', pn).onclick = () => mover(-1); $('#pD', pn).onclick = () => mover(1);
      $('#pOk', pn).onclick = () => { p.legenda = $('#pL', pn).value.trim(); p.cat = $('#pC', pn).value; logar('Editou uma foto do portfólio'); fecharFolha(); reApp(); };
      $('#pR', pn).onclick = () => { fecharFolha(); confirmar({titulo:'Retirar foto?', texto:'Ela deixa de aparecer no portfólio do site.', ok:'Retirar', perigo:true, fn:() => { D.portfolio = D.portfolio.filter(x => x !== p); logar('Retirou uma foto do portfólio'); reApp(); }}); };
    });
  });
};

PAG.financeiro = el => {
  const h = hoje0(), hk = keyOf(h);
  const per = {mes:['Este mês', r => r.dia.slice(0,7) === hk.slice(0,7)], ant:['Mês passado', r => r.dia.slice(0,7) === keyOf(new Date(h.getFullYear(), h.getMonth()-1, 1)).slice(0,7)], prox:['Próximos 30 dias', r => r.dia >= hk && r.dia <= keyOf(addDias(h, 30))]};
  const rs = D.reservas.filter(per[app.finPer][1]), f = resumoFin(rs);
  const max = Math.max(1, ...Object.values(f.porServ).map(p => p.v));
  const pagos = rs.filter(r => ['confirmado','concluido'].includes(r.status));
  el.innerHTML = `
    <div class="segm">${Object.entries(per).map(([k,[n]]) => `<button data-per="${k}" aria-pressed="${app.finPer===k}">${n}</button>`).join('')}</div>
    ${avisoSim('Valores somados a partir dos agendamentos de exemplo. Não é faturamento real.')}
    <div class="det-head" style="padding-top:2px"><p class="muted small">Pix aprovados</p><div class="valor-g num">${brl(f.pix)}</div></div>
    <div class="info">
      <div class="l"><span>Em sinais (30%)</span><span class="num">${brl(f.sinais)}</span></div>
      <div class="l"><span>Pagos à vista</span><span class="num">${brl(f.totais)}</span></div>
      <div class="l"><span>Saldos a receber no estúdio</span><span class="num">${brl(f.saldo)}</span></div>
      <div class="l"><span>Pagamentos em análise</span><span class="num" style="color:var(--alerta)">${brl(f.analise)}</span></div>
      <div class="l"><span>Atendimentos pagos</span><span class="num">${pagos.length}</span></div>
    </div>
    <div class="info-tit">Por procedimento</div>
    <div class="info">${D.servicos.map(s => { const p = f.porServ[s.id] || {n:0, v:0}; return `<div class="l" style="display:block"><div style="display:flex;justify-content:space-between;gap:10px"><span class="muted">${esc(s.nome)} <span class="num">(${p.n})</span></span><b class="num">${brl(p.v)}</b></div><div class="barra-fin"><i style="width:${p.v / max * 100}%"></i></div></div>`; }).join('')}</div>
    <button class="bt sec" id="fnCp">Copiar relatório para planilha</button>`;
  $$('[data-per]', el).forEach(b => b.onclick = () => { app.finPer = b.dataset.per; reApp(); });
  $('#fnCp', el).onclick = () => {
    const linhas = [['Código','Data','Cliente','Procedimento','Preço','Forma','Pago via Pix','Status']].concat(rs.filter(r => !['provisoria','expirada'].includes(r.status)).sort(ordR).map(r => [r.id, r.dia, nomeCli(r), serv(r.serv).nome, r.preco.toFixed(2).replace('.',','), pagTxt(r), (r.valor || 0).toFixed(2).replace('.',','), STATUS[r.status][1]]));
    copiar(linhas.map(l => l.join('\t')).join('\n'), 'Relatório copiado. Cole em uma planilha.');
    logar('Copiou o relatório financeiro (' + per[app.finPer][0].toLowerCase() + ')');
  };
};

PAG.notificacoes = el => {
  const ns = D.notifs.filter(n => !app.notifSo || !n.lida).sort((a,b) => b.t - a.t);
  el.innerHTML = `<div class="segm"><button data-nf="0" aria-pressed="${!app.notifSo}">Todas</button><button data-nf="1" aria-pressed="${app.notifSo}">Não lidas</button></div>
    ${ns.length ? `<div class="rows">${ns.map(n => `<button class="row" data-nt="${n.id}"><span class="notif-dot ${n.lida ? 'lida' : ''}"></span><span class="m"><b style="${n.lida ? 'font-weight:500' : ''};white-space:normal">${esc(n.txt)}${exTag(n)}</b><span>${n.tipo === 'pagamento' ? 'Pagamento' : 'Agendamento'} · ${dataHora(n.t)}</span></span><span class="d">${ic('chev', 18)}</span></button>`).join('')}</div>`
      : `<div class="rows">${vazioApp('notif', 'Nenhuma notificação', app.notifSo ? 'Você já viu tudo.' : '')}</div>`}
    <p class="nota-demo" style="margin-top:12px">No sistema real, as notificações também poderão chegar no celular de Saara e Julianny.</p>`;
  $$('[data-nf]', el).forEach(b => b.onclick = () => { app.notifSo = b.dataset.nf === '1'; reApp(); });
  $$('[data-nt]', el).forEach(b => b.onclick = () => { const n = D.notifs.find(x => x.id === b.dataset.nt); n.lida = true; const r = D.reservas.find(x => x.id === n.ref); if (!r) return reApp(); if (n.tipo === 'pagamento' && r.status === 'analise') abrirPagamento(r.id); else abrirAtendimento(r.id); });
  return D.notifs.some(n => !n.lida) ? {label:'Marcar todas como lidas', icone:'conferir', fn:() => { D.notifs.forEach(n => n.lida = true); toast('Todas marcadas como lidas.'); reApp(); }} : null;
};

PAG.expediente = el => {
  let opRet = '<option value="">A definir</option>'; for (let t = 750; t <= 900; t += 15) opRet += `<option value="${t}" ${D.cfg.sabRetorno===t ? 'selected' : ''}>${fmtH(t)}</option>`;
  el.innerHTML = `<div class="info">${linhasExpediente().map(([a,b]) => `<div class="l"><span>${a}</span><span class="num">${b}</span></div>`).join('')}</div>
    <div class="campo-app"><label for="exSab">Retorno do almoço no sábado</label><select id="exSab">${opRet}</select><small>O almoço começa às 12h. Ao definir o retorno, a tarde de sábado (até 17h) abre no calendário.</small></div>
    <div class="info-tit">Regras de agendamento</div>
    <div class="info">
      <div class="l"><span>Horários de início</span><span>a cada 15 min</span></div>
      <div class="l"><span>Intervalo entre atendimentos</span><span>15 min</span></div>
      <div class="l"><span>Antecedência mínima</span><span>24 horas</span></div>
      <div class="l"><span>Reserva provisória</span><span>15 min</span></div>
      <div class="l"><span>Agenda aberta até</span><span class="num">31/12/2027</span></div>
    </div>
    <p class="txt-app">Regras definidas no projeto. No sistema real, mudanças nelas não afetam quem já agendou.</p>`;
  $('#exSab', el).onchange = e => {
    const v = e.target.value ? +e.target.value : null;
    confirmar({titulo:'Alterar expediente de sábado?', texto: v ? 'Sábado passa a ser das 8h às 12h e das ' + fmtH(v) + ' às 17h.' : 'A tarde de sábado volta a ficar fechada até ser definida.', ok:'Salvar', fn:() => { D.cfg.sabRetorno = v; logar('Definiu o retorno do almoço de sábado: ' + (v ? fmtH(v) : 'a definir')); toast('Expediente atualizado (simulação).'); reApp(); }});
    e.target.value = D.cfg.sabRetorno ? String(D.cfg.sabRetorno) : '';
  };
};

PAG.pix = el => {
  el.innerHTML = `<div class="info"><div class="l"><span>Chave (e-mail)</span><span>${esc(D.cfg.pix)}</span></div><div class="l"><span>Banco</span><span>${esc(D.cfg.banco)}</span></div><div class="l"><span>Sinal</span><span>30% do serviço</span></div></div>
    <div class="acoes-app"><button class="bt sec" id="pxCp">Copiar chave</button><button class="bt sec" id="pxEd">${ic('editar', 20)} Alterar chave Pix</button></div>
    <p class="txt-app" style="margin-top:14px">No sistema real, alterar a chave vai pedir a confirmação com a passkey de quem estiver alterando e avisar a outra administradora.</p>`;
  $('#pxCp', el).onclick = () => copiar(D.cfg.pix, 'Chave Pix copiada.');
  $('#pxEd', el).onclick = () => folha('Alterar Pix', `
    <div class="campo-app"><label for="pxK">Chave Pix</label><input id="pxK" value="${esc(D.cfg.pix)}"></div>
    <div class="campo-app"><label for="pxB">Banco</label><input id="pxB" value="${esc(D.cfg.banco)}"></div>
    <div class="acoes-app"><button class="bt" id="pxOk">Continuar</button><button class="bt sec" data-fechar-folha>Cancelar</button></div>`, pn => {
    $('#pxOk', pn).onclick = () => { const k = $('#pxK', pn).value.trim(), b = $('#pxB', pn).value.trim(); if (!k || !b) return; fecharFolha();
      confirmar({titulo:'Confirmar nova chave?', texto:'As clientes passam a ver:<br><b>' + esc(k) + '</b> · ' + esc(b), sim:'Confira com atenção: um erro aqui faz o Pix ir para outra conta.', ok:'Confirmar', fn:() => { D.cfg.pix = k; D.cfg.banco = b; logar('Alterou a chave Pix'); toast('Pix atualizado (simulação).'); reApp(); }}); };
  });
};

PAG.politicas = el => {
  const li = t => `<div class="l" style="display:block"><span style="color:var(--tinta)">${t}</span></div>`;
  const ad = '<span class="ps p-analise">a definir</span>';
  el.innerHTML = `<p class="txt-app">Resumo do que a cliente vê no site. Os itens "a definir" precisam da decisão de vocês.</p>
    <div class="info-tit">Agendamento</div>
    <div class="info">${[
      'Antecedência mínima de 24 horas.', 'Horário reservado por 15 minutos para o Pix e o comprovante.', 'Sinal de 30% ou valor total antecipado.',
      'Comprovante conferido manualmente por Saara ou Julianny.', 'Intervalo de 15 minutos entre atendimentos.',
      'Cancelamento e remarcação pela cliente ' + ad, 'Tolerância de atraso ' + ad, 'Falta sem aviso e devolução do sinal ' + ad].map(li).join('')}</div>
    <div class="info-tit">Privacidade</div>
    <div class="info">${['Só nome, WhatsApp e comprovante são pedidos. Sem CPF ou senha.', 'Acesso aos dados apenas de Saara e Julianny.', 'A cliente pode pedir correção ou exclusão pelo WhatsApp.', 'Prazo de guarda dos comprovantes ' + ad].map(li).join('')}</div>
    <a class="bt sec" href="#politicas">Ver como aparece no site</a>`;
};

PAG.seguranca = el => {
  el.innerHTML = `${avisoSim('Representação visual. Este protótipo não tem login: o perfil escolhido não comprova identidade, e as passkeys abaixo são exemplos.')}
    <div class="info-tit">Contas administrativas</div>
    <div class="rows">${Object.values(ADMINS).map(a => `<div class="row"><span class="av">${a.ini}</span><span class="m"><b>${a.nome}${a.nome === D.admin ? ' · você' : ''}</b><span>Acesso completo</span></span><span class="ps p-ok">Ativa</span></div>`).join('')}</div>
    <p class="txt-app" style="margin-top:10px">As duas têm as mesmas permissões. Somente elas podem aprovar pagamentos.</p>
    <div class="info-tit">Passkeys de ${D.admin}</div>
    <div class="rows">
      <div class="row"><span class="ico">${ic('cel', 20)}</span><span class="m"><b>Celular${exTag({exemplo:true})}</b><span>Face ID</span></span><span></span></div>
      <div class="row"><span class="ico">${ic('pc', 20)}</span><span class="m"><b>Computador do estúdio${exTag({exemplo:true})}</b><span>Touch ID ou PIN do aparelho</span></span><span></span></div>
    </div>
    <button class="bt" disabled style="margin-top:12px">Cadastrar nova passkey</button>
    <p class="txt-app" style="margin-top:10px">Disponível no sistema real. A passkey usa o desbloqueio do próprio aparelho (Face ID, digital ou PIN). Nenhuma senha, e nunca o CPF, é usada para entrar.</p>
    <div class="info-tit">Histórico</div>
    <a class="row" href="#painel-historico" style="background:#fff;border:1px solid var(--creme-2);border-radius:18px"><span class="ico">${ic('hist', 20)}</span><span class="m"><b>Histórico de ações</b><span>Quem fez o quê e quando</span></span><span class="d">${ic('chev', 18)}</span></a>`;
};

PAG.historico = el => {
  const ls = D.log.filter(l => app.histF === 'todas' || l.quem === app.histF);
  el.innerHTML = `<div class="segm">${['todas'].concat(Object.keys(ADMINS)).map(f => `<button data-hf="${f}" aria-pressed="${app.histF===f}">${f === 'todas' ? 'Todas' : f}</button>`).join('')}</div>
    <p class="txt-app">No sistema real, este registro não pode ser apagado pelo app.</p>
    ${ls.length ? `<div class="rows log-app">${ls.map(l => `<div class="row"><span class="m"><time>${dataHora(l.t)}</time><b style="white-space:normal">${esc(l.quem)}</b><span style="white-space:normal">${esc(l.txt)}${exTag(l)}</span></span></div>`).join('')}</div>` : `<div class="rows">${vazioApp('hist', 'Sem registros')}</div>`}`;
  $$('[data-hf]', el).forEach(b => b.onclick = () => { app.histF = b.dataset.hf; reApp(); });
};
