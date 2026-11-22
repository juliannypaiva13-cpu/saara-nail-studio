function pagoTotal(r){ return (r.pixOk ? (r.valor || 0) : 0) + (r.presencial || 0); }
function resumoFin(rs){
  const f = {pix:0, presencial:0, reembolsos:0, saldo:0, analise:0, aguardando:0, servicos:0, sinais:0, totais:0, porServ:{}};
  for (const r of rs){
    if (r.pixOk){ f.pix += r.valor || 0; if (r.pag === 'sinal') f.sinais += r.valor; else f.totais += r.valor; }
    f.presencial += r.presencial || 0;
    f.reembolsos += r.reembolso || 0;
    if (['confirmado','concluido'].includes(r.status)){
      f.saldo += Math.max(0, r.preco - pagoTotal(r));
      f.servicos += r.preco;
      const p = f.porServ[r.serv] || (f.porServ[r.serv] = {n:0, v:0}); p.n++; p.v += r.preco;
    }
    if (r.status === 'analise') f.analise += r.valor;
    if (r.status === 'aguardando') f.aguardando += r.valor;
  }
  f.recebido = f.pix + f.presencial - f.reembolsos;
  return f;
}
