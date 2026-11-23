// Regras de horário do Saara Nail Studio. Tudo é decidido aqui, no servidor.
// O servidor roda em UTC; toda conta de dia e hora é convertida para America/Fortaleza (UTC−3, sem horário de verão).

export const FUSO = 'America/Fortaleza';
export const PASSO_MIN = 15;              // horários de início a cada 15 min
export const INTERVALO_MIN = 15;          // intervalo depois de cada atendimento
export const ANTECEDENCIA_SITE_MS = 24 * 3600e3;
export const PRAZO_VISIVEL_MS = 15 * 60e3; // o que a cliente vê
export const PRAZO_FINAL_MS = 17 * 60e3;   // 15 + 2 min de tolerância, decidido pelo relógio do servidor
export const ULTIMO_DIA = '2027-12-31';
// Margem de processamento: um comprovante que chegou ao armazenamento até 17:00 pode levar alguns segundos
// para ser registrado. A liberação automática espera essa margem para nunca derrubar um envio feito no prazo.
// O que vale para aceitar é sempre a hora em que o arquivo chegou (relógio do servidor), nunca a do registro.
export const VALIDADE_ENVIO_MS = 2 * 60e3;          // autorização de envio do comprovante
export const MARGEM_PROCESSAMENTO_MS = 3 * 60e3;   // ≥ validade do envio + folga: nunca libera com envio em andamento

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
});
const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Converte um instante (ms UTC) em { dia: 'AAAA-MM-DD', minuto, diaSemana } no fuso de Fortaleza. */
export function emFortaleza(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, minuto: Number(p.hour) * 60 + Number(p.minute), diaSemana: DIAS[p.weekday] };
}

/** Instante (ms UTC) de um dia + minuto em Fortaleza. Fortaleza é UTC−3 fixo desde 1990. */
export function instante(dia, minuto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new ErroRegra('dia_invalido');
  const [a, m, d] = dia.split('-').map(Number);
  const ms = Date.UTC(a, m - 1, d, 0, minuto) + 3 * 3600e3;
  const volta = emFortaleza(ms);
  if (volta.dia !== dia) throw new ErroRegra('dia_invalido'); // ex.: 2026-02-30
  return ms;
}

export function diaSemana(dia) { return new Date(`${dia}T12:00:00Z`).getUTCDay(); }

export class ErroRegra extends Error {
  constructor(codigo, detalhes) { super(codigo); this.codigo = codigo; this.detalhes = detalhes; }
}

/** Casas de 15 min ocupadas por um atendimento: do início até o fim + intervalo. */
export function casasDoAtendimento(inicio, fim) {
  const out = [];
  for (let m = inicio; m < fim + INTERVALO_MIN; m += PASSO_MIN) out.push(m);
  return out;
}
/** Casas ocupadas por um bloqueio: só o período bloqueado. */
export function casasDoBloqueio(inicio, fim) {
  const out = [];
  for (let m = inicio; m < fim; m += PASSO_MIN) out.push(m);
  return out;
}

/** Períodos de expediente válidos para o dia (lista de [inicio, fim]). */
export function periodosDoDia(expediente, dia) {
  // Cada versão do expediente vale para a SEMANA inteira a partir de vigente_desde: um dia sem linhas na versão
  // vigente está fechado (mesmo que uma versão antiga o tivesse aberto).
  const ds = diaSemana(dia);
  const versao = expediente.reduce((a, e) => (e.vigente_desde <= dia && e.vigente_desde > a ? e.vigente_desde : a), '');
  if (!versao) return [];
  return expediente.filter(e => e.vigente_desde === versao && e.dia_semana === ds)
    .map(e => [e.inicio_min, e.fim_min]).sort((a, b) => a[0] - b[0]);
}

/**
 * Confere se um atendimento pode começar em (dia, inicio). Não consulta conflitos: quem garante isso é o banco.
 * equipe = true libera a antecedência de 24 h (a equipe pode agendar para o mesmo dia).
 */
export function validarInicio({ expediente, dia, inicio, duracao, agoraMs, equipe = false }) {
  if (dia > ULTIMO_DIA) throw new ErroRegra('fora_do_calendario');
  if (inicio % PASSO_MIN !== 0) throw new ErroRegra('inicio_fora_da_grade');
  const fim = inicio + duracao;
  const periodo = periodosDoDia(expediente, dia).find(([a, b]) => inicio >= a && fim <= b);
  if (!periodo) throw new ErroRegra('fora_do_expediente');
  const inicioMs = instante(dia, inicio);
  const minimo = agoraMs + (equipe ? 0 : ANTECEDENCIA_SITE_MS);
  if (inicioMs < minimo) throw new ErroRegra(equipe ? 'horario_no_passado' : 'antecedencia_minima');
  return { fim };
}

/** Horários de início livres num dia, dado o conjunto de casas ocupadas (Set de minutos). */
export function horariosLivres({ expediente, dia, duracao, ocupadas, agoraMs, equipe = false }) {
  const out = [];
  for (const [a, b] of periodosDoDia(expediente, dia)) {
    for (let t = a; t + duracao <= b; t += PASSO_MIN) {
      try { validarInicio({ expediente, dia, inicio: t, duracao, agoraMs, equipe }); } catch { continue; }
      if (casasDoAtendimento(t, t + duracao).every(m => !ocupadas.has(m))) out.push(t);
    }
  }
  return out;
}

/**
 * Alertas de pagamento em análise (só para o painel; nada é enviado à cliente).
 * nivel: 0 nenhum · 1 após 30 min · 2 após 2 h · 3 após 12 h (pendência antiga, exige decisão).
 * proximo: atendimento em menos de 24 h · urgente: em menos de 3 h.
 * Nenhum nível libera o horário: isso só acontece por decisão de Saara ou Julianny.
 */
export function alertaPagamento({ recebidoMs, atendimentoMs, agoraMs }) {
  const espera = agoraMs - recebidoMs;
  const nivel = espera >= 12 * 3600e3 ? 3 : espera >= 2 * 3600e3 ? 2 : espera >= 30 * 60e3 ? 1 : 0;
  const falta = atendimentoMs - agoraMs;
  return { nivel, proximo: falta <= 24 * 3600e3, urgente: falta <= 3 * 3600e3, esperaMin: Math.floor(espera / 60e3) };
}

/** Ordem da fila de pendências: urgentes primeiro, depois atendimento mais próximo, depois espera mais longa. */
export function ordenarPendencias(lista) {
  return [...lista].sort((x, y) =>
    (y.alerta.urgente - x.alerta.urgente) || (y.alerta.proximo - x.alerta.proximo) ||
    (x.atendimentoMs - y.atendimentoMs) || (y.alerta.esperaMin - x.alerta.esperaMin));
}
