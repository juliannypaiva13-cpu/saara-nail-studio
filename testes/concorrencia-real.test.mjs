// Teste 1 com paralelismo de verdade: 50 linhas de execução (worker_threads), cada uma com sua própria conexão
// ao mesmo arquivo SQLite, disparando a mesma reserva ao mesmo tempo (liberadas juntas por uma barreira).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bancoDeTeste, D1Local } from './d1-local.mjs';

const AGORA = Date.UTC(2026, 10, 22, 15, 0);

if (!isMainThread) {
  const { arquivo, i, barreira } = workerData;
  const R = await import('../src/reservas.js');
  const db = new D1Local(arquivo);
  Atomics.wait(new Int32Array(barreira), 0, 0); // todas esperam aqui e partem juntas
  try {
    await R.criarReservaSite(db, { servicoId: 'f1', dia: '2026-11-24', inicio: 14 * 60, cliente: { nome: `T${i}` }, formaPagamento: 'sinal', agoraMs: AGORA, ficticia: true });
    parentPort.postMessage('ok');
  } catch (e) { parentPort.postMessage(e.codigo || String(e.message)); }
} else {
  test('teste 1 (paralelo real) · 50 conexões, mesma reserva: exatamente 1 grava', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'saara-'));
    const arquivo = join(dir, 'teste.db');
    const base = bancoDeTeste(arquivo); base.db.exec('PRAGMA journal_mode = WAL'); base.db.close();
    const barreira = new SharedArrayBuffer(4);
    const trabalhos = Array.from({ length: 50 }, (_, i) => new Promise((ok, falha) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { arquivo, i, barreira } });
      w.once('message', ok); w.once('error', falha);
    }));
    await new Promise(r => setTimeout(r, 400));
    const v = new Int32Array(barreira); Atomics.store(v, 0, 1); Atomics.notify(v, 0);
    const resultados = await Promise.all(trabalhos);
    const cont = resultados.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {});
    const fim = new D1Local(arquivo);
    const n = (await fim.prepare('SELECT COUNT(*) n FROM agendamentos').first()).n;
    const casas = (await fim.prepare('SELECT COUNT(*) n FROM casas_ocupadas').first()).n;
    fim.db.close(); rmSync(dir, { recursive: true });
    console.log('resultados:', cont);
    assert.equal(cont.ok, 1);
    assert.equal(cont.horario_ocupado, 49);
    assert.equal(n, 1);
    assert.equal(casas, 11);
  });
}
