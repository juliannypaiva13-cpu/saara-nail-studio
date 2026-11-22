-- Saara Nail Studio · migração inicial (Cloudflare D1 / SQLite)
-- Horários: dia = 'AAAA-MM-DD' no fuso America/Fortaleza; minutos desde 0h. Instantes: milissegundos UTC.
-- Valores em centavos. Tabelas STRICT: o banco recusa tipo errado.

CREATE TABLE administradoras (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ativa INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1)),
  criada_em INTEGER NOT NULL
) STRICT;

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,                       -- id da credencial (base64url)
  admin_id TEXT NOT NULL REFERENCES administradoras(id),
  chave_publica TEXT NOT NULL,              -- chave pública COSE em base64url (texto evita diferenças de BLOB entre D1 e SQLite local)
  contador INTEGER NOT NULL DEFAULT 0 CHECK (contador >= 0),
  transportes TEXT,
  aparelho TEXT,
  criada_em INTEGER NOT NULL,
  ultimo_uso INTEGER,
  desativada_em INTEGER
) STRICT;
CREATE INDEX passkeys_admin ON passkeys(admin_id);

CREATE TABLE desafios (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('cadastro', 'login', 'reautenticacao')),
  admin_id TEXT REFERENCES administradoras(id),
  convite_id TEXT,
  desafio TEXT NOT NULL,
  expira_em INTEGER NOT NULL,
  usado_em INTEGER
) STRICT;

CREATE TABLE convites (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES administradoras(id),
  token_hash TEXT NOT NULL UNIQUE,           -- só o resumo SHA-256; o token nunca é guardado
  motivo TEXT NOT NULL CHECK (motivo IN ('primeiro_acesso', 'recuperacao')),
  emitido_por TEXT,                          -- administradora ou 'instalacao'
  criado_em INTEGER NOT NULL,
  expira_em INTEGER NOT NULL,
  usado_em INTEGER
) STRICT;

CREATE TABLE codigos_recuperacao (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES administradoras(id),
  codigo_hash TEXT NOT NULL UNIQUE,
  criado_em INTEGER NOT NULL,
  usado_em INTEGER
) STRICT;

CREATE TABLE sessoes (
  id_hash TEXT PRIMARY KEY,                  -- resumo do cookie; o cookie em si não fica no banco
  admin_id TEXT NOT NULL REFERENCES administradoras(id),
  criada_em INTEGER NOT NULL,
  ultimo_uso INTEGER NOT NULL,
  expira_em INTEGER NOT NULL,                -- limite absoluto (7 dias)
  reautenticada_em INTEGER,
  encerrada_em INTEGER,
  aparelho TEXT
) STRICT;

CREATE TABLE tentativas (                    -- limite de tentativas (reserva para quando o binding não existir)
  chave TEXT NOT NULL,
  janela INTEGER NOT NULL,
  contagem INTEGER NOT NULL,
  PRIMARY KEY (chave, janela)
) STRICT;

CREATE TABLE clientes (
  id TEXT PRIMARY KEY,
  nome TEXT,
  whatsapp TEXT,
  observacoes TEXT,
  criada_em INTEGER NOT NULL,
  ultimo_atendimento TEXT,
  anonimizada_em INTEGER
) STRICT;

CREATE TABLE servicos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  preco_centavos INTEGER NOT NULL CHECK (preco_centavos > 0),
  duracao_min INTEGER NOT NULL CHECK (duracao_min > 0 AND duracao_min % 15 = 0),
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
) STRICT;

CREATE TABLE expediente (
  id INTEGER PRIMARY KEY,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  inicio_min INTEGER NOT NULL CHECK (inicio_min % 15 = 0),
  fim_min INTEGER NOT NULL CHECK (fim_min % 15 = 0 AND fim_min <= 1440),
  vigente_desde TEXT NOT NULL,
  CHECK (fim_min > inicio_min)
) STRICT;

CREATE TABLE bloqueios (
  id TEXT PRIMARY KEY,
  dia TEXT NOT NULL,
  inicio_min INTEGER NOT NULL CHECK (inicio_min % 15 = 0),
  fim_min INTEGER NOT NULL CHECK (fim_min % 15 = 0),
  motivo TEXT,
  criado_por TEXT REFERENCES administradoras(id),
  criado_em INTEGER NOT NULL,
  removido_em INTEGER,
  CHECK (fim_min > inicio_min)
) STRICT;

CREATE TABLE agendamentos (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,               -- código aleatório que a cliente usa para acompanhar
  cliente_id TEXT REFERENCES clientes(id),
  servico_id TEXT NOT NULL REFERENCES servicos(id),
  preco_centavos INTEGER NOT NULL CHECK (preco_centavos > 0),
  dia TEXT NOT NULL,
  inicio_min INTEGER NOT NULL CHECK (inicio_min % 15 = 0),
  fim_min INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('aguardando_comprovante', 'em_analise', 'aguardando_pix', 'confirmado',
                                         'recusado', 'expirado', 'cancelado', 'concluido', 'nao_compareceu')),
  origem TEXT NOT NULL CHECK (origem IN ('site', 'equipe')),
  forma_pagamento TEXT CHECK (forma_pagamento IN ('sinal', 'integral', 'estudio')),
  prazo_visivel_em INTEGER,                  -- 15 min: o que a cliente vê
  prazo_final_em INTEGER,                    -- 17 min: o que o servidor aceita
  presenca_confirmada INTEGER NOT NULL DEFAULT 0 CHECK (presenca_confirmada IN (0, 1)),
  atraso_min INTEGER,
  criado_em INTEGER NOT NULL,
  atualizado_em INTEGER NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  CHECK (fim_min > inicio_min)
) STRICT;
CREATE INDEX agend_dia ON agendamentos(dia);
CREATE INDEX agend_status ON agendamentos(status, prazo_final_em);

-- Peça central contra conflito: cada atendimento ocupa casas de 15 min, do início até 15 min depois do fim.
-- A chave primária (dia, minuto) impede duas reservas na mesma casa, mesmo com pedidos simultâneos.
CREATE TABLE casas_ocupadas (
  dia TEXT NOT NULL,
  minuto INTEGER NOT NULL CHECK (minuto % 15 = 0 AND minuto >= 0),
  agendamento_id TEXT REFERENCES agendamentos(id),
  bloqueio_id TEXT REFERENCES bloqueios(id),
  PRIMARY KEY (dia, minuto),
  CHECK ((agendamento_id IS NULL) <> (bloqueio_id IS NULL))
) STRICT;
CREATE INDEX casas_agend ON casas_ocupadas(agendamento_id);

CREATE TABLE comprovantes (
  id TEXT PRIMARY KEY,
  agendamento_id TEXT NOT NULL REFERENCES agendamentos(id),
  objeto TEXT NOT NULL UNIQUE,               -- chave interna no R2 privado
  etag TEXT NOT NULL,                        -- impressão digital do arquivo no R2
  tipo TEXT NOT NULL CHECK (tipo IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  tamanho INTEGER NOT NULL CHECK (tamanho > 0 AND tamanho <= 5242880),
  recebido_em INTEGER NOT NULL,
  UNIQUE (agendamento_id, etag)
) STRICT;

CREATE TABLE pagamentos (
  id TEXT PRIMARY KEY,
  agendamento_id TEXT NOT NULL REFERENCES agendamentos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('sinal', 'integral', 'estudio')),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  status TEXT NOT NULL CHECK (status IN ('em_analise', 'aguardando_pix', 'confirmado', 'recusado')),
  comprovante_id TEXT REFERENCES comprovantes(id),
  conferido INTEGER NOT NULL DEFAULT 0 CHECK (conferido IN (0, 1)),
  decidido_por TEXT REFERENCES administradoras(id),
  decidido_em INTEGER,
  motivo TEXT,
  alerta_nivel INTEGER NOT NULL DEFAULT 0,   -- 0 nenhum · 1 30 min · 2 2 h · 3 12 h
  criado_em INTEGER NOT NULL,
  CHECK (status <> 'confirmado' OR (conferido = 1 AND decidido_por IS NOT NULL AND decidido_em IS NOT NULL))
) STRICT;
-- No máximo um pagamento confirmado de cada tipo por agendamento: impede contar o mesmo pagamento duas vezes.
CREATE UNIQUE INDEX pag_um_confirmado ON pagamentos(agendamento_id, tipo) WHERE status = 'confirmado';
CREATE INDEX pag_status ON pagamentos(status, criado_em);

CREATE TABLE creditos (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES clientes(id),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  origem_agendamento_id TEXT REFERENCES agendamentos(id),
  usado_em_agendamento_id TEXT REFERENCES agendamentos(id),
  criado_por TEXT REFERENCES administradoras(id),
  criado_em INTEGER NOT NULL,
  usado_em INTEGER
) STRICT;

CREATE TABLE reembolsos (
  id TEXT PRIMARY KEY,
  agendamento_id TEXT NOT NULL REFERENCES agendamentos(id),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  status TEXT NOT NULL CHECK (status IN ('pendente', 'concluido', 'cancelado')),
  prazo_em INTEGER,
  justificativa TEXT,
  decidido_por TEXT NOT NULL REFERENCES administradoras(id),
  decidido_em INTEGER NOT NULL,
  concluido_por TEXT REFERENCES administradoras(id),
  concluido_em INTEGER
) STRICT;
-- Reembolso nunca maior que o que foi pago e ainda não devolvido.
CREATE TRIGGER reembolso_limite BEFORE INSERT ON reembolsos
BEGIN
  SELECT RAISE(ABORT, 'reembolso_maior_que_pago')
  WHERE NEW.valor_centavos >
    (SELECT COALESCE(SUM(valor_centavos), 0) FROM pagamentos WHERE agendamento_id = NEW.agendamento_id AND status = 'confirmado')
    - (SELECT COALESCE(SUM(valor_centavos), 0) FROM reembolsos WHERE agendamento_id = NEW.agendamento_id AND status <> 'cancelado');
END;

CREATE TABLE solicitacoes (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('cancelamento', 'reagendamento')),
  agendamento_id TEXT NOT NULL REFERENCES agendamentos(id),
  origem TEXT NOT NULL CHECK (origem IN ('site', 'whatsapp', 'presencial', 'equipe')),
  motivo TEXT,
  criada_em INTEGER NOT NULL,
  responder_ate INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendente', 'decidida')),
  decisao TEXT,
  justificativa TEXT,
  decidida_por TEXT REFERENCES administradoras(id),
  decidida_em INTEGER
) STRICT;
CREATE UNIQUE INDEX solic_uma_pendente ON solicitacoes(agendamento_id) WHERE status = 'pendente';

CREATE TABLE notificacoes (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  referencia TEXT,
  texto TEXT NOT NULL,
  nivel INTEGER NOT NULL DEFAULT 0,
  criada_em INTEGER NOT NULL,
  UNIQUE (tipo, referencia, nivel)           -- um aviso por nível: sem mensagens repetidas
) STRICT;
CREATE TABLE notificacoes_lidas (
  notificacao_id TEXT NOT NULL REFERENCES notificacoes(id),
  admin_id TEXT NOT NULL REFERENCES administradoras(id),
  lida_em INTEGER NOT NULL,
  PRIMARY KEY (notificacao_id, admin_id)
) STRICT;

CREATE TABLE historico_agendamento (
  id INTEGER PRIMARY KEY,
  agendamento_id TEXT NOT NULL,
  quando INTEGER NOT NULL,
  quem TEXT NOT NULL,                        -- administradora, 'cliente' ou 'sistema'
  acao TEXT NOT NULL,
  detalhes TEXT
) STRICT;
CREATE TRIGGER historico_sem_alterar BEFORE UPDATE ON historico_agendamento BEGIN SELECT RAISE(ABORT, 'historico_somente_inclusao'); END;
CREATE TRIGGER historico_sem_apagar BEFORE DELETE ON historico_agendamento BEGIN SELECT RAISE(ABORT, 'historico_somente_inclusao'); END;

CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY,
  quando INTEGER NOT NULL,
  admin_id TEXT,
  acao TEXT NOT NULL,
  entidade TEXT,
  dados TEXT,
  hash_anterior TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
) STRICT;
CREATE TRIGGER auditoria_sem_alterar BEFORE UPDATE ON auditoria BEGIN SELECT RAISE(ABORT, 'auditoria_somente_inclusao'); END;
CREATE TRIGGER auditoria_sem_apagar BEFORE DELETE ON auditoria BEGIN SELECT RAISE(ABORT, 'auditoria_somente_inclusao'); END;

-- Afirmações dentro de um lote atômico: inserir NULL aqui derruba o lote inteiro.
-- O D1 não tem transação interativa; é assim que uma condição lida antes vira garantia na hora de gravar.
CREATE TABLE afirmacoes (ok INTEGER NOT NULL CHECK (ok = 1)) STRICT;
