-- Fase 3 · operação: autorização temporária de envio de comprovante, clientes únicas por WhatsApp e índices.
-- Somente ACRESCENTA (nenhuma tabela ou dado existente é apagado ou alterado).

-- Autorização de envio: emitida só dentro do prazo de 17 min, vale 2 min, uso único, presa a tipo e tamanho.
-- Um envio INICIADO dentro do prazo (autorização emitida até 17:00) é aceito mesmo que termine logo depois.
CREATE TABLE autorizacoes_envio (
  token_hash TEXT PRIMARY KEY,
  agendamento_id TEXT NOT NULL REFERENCES agendamentos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  tamanho_max INTEGER NOT NULL CHECK (tamanho_max > 0 AND tamanho_max <= 5242880),
  emitida_em INTEGER NOT NULL,
  expira_em INTEGER NOT NULL,
  usada_em INTEGER
) STRICT;
CREATE INDEX autoriz_agend ON autorizacoes_envio(agendamento_id);

-- Uma ficha por WhatsApp (a cliente que volta é a mesma cliente). Reservas fictícias de teste não têm WhatsApp.
CREATE UNIQUE INDEX clientes_whatsapp ON clientes(whatsapp) WHERE whatsapp IS NOT NULL;

-- Consultas do painel e da agenda.
CREATE INDEX agend_cliente ON agendamentos(cliente_id, dia);
CREATE INDEX pag_agend ON pagamentos(agendamento_id, status);
CREATE INDEX comp_agend ON comprovantes(agendamento_id);
CREATE INDEX comp_etag ON comprovantes(etag);
CREATE INDEX bloq_dia ON bloqueios(dia, removido_em);
CREATE INDEX hist_agend ON historico_agendamento(agendamento_id, id);
CREATE INDEX solic_status ON solicitacoes(status, criada_em);
CREATE INDEX reemb_agend ON reembolsos(agendamento_id, status);
CREATE INDEX cred_cliente ON creditos(cliente_id, usado_em);
CREATE INDEX notif_criada ON notificacoes(criada_em);
