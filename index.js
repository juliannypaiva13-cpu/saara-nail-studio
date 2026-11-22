// Worker sem endereço público: só a agenda (cron) o aciona. O Pages não tem cron próprio.
// A cada 5 min: libera reservas vencidas (17 min + margem) e gera os avisos internos de pagamento em análise.
import { expirarReservas, processarAlertasPagamento } from '../src/reservas.js';

export default {
  async scheduled(evento, env, ctx) {
    const agora = Date.now();
    const expiradas = await expirarReservas(env.DB, agora);
    const avisos = await processarAlertasPagamento(env.DB, agora);
    if (expiradas || avisos) console.log(JSON.stringify({ expiradas, avisos })); // sem dados pessoais
  },
  async fetch() { return new Response('Não encontrado', { status: 404 }); }
};
