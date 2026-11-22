-- Dados aprovados no protótipo. Nenhum dado de cliente.
INSERT INTO servicos (id, nome, preco_centavos, duracao_min, descricao) VALUES
  ('f1', 'Molde F1', 10000, 150, 'Alongamento com molde F1: formato uniforme, espessura fina e boa durabilidade.'),
  ('postica', 'Postiça Realista', 5000, 120, 'Unhas postiças ajustadas ao seu formato, com aparência natural.'),
  ('manicure', 'Manicure Tradicional', 2500, 120, 'Cutilagem cuidadosa, lixamento e esmaltação com acabamento caprichado.');

-- Expediente definitivo (minutos desde 0h). 0 = domingo (fechado, sem linhas).
INSERT INTO expediente (dia_semana, inicio_min, fim_min, vigente_desde) VALUES
  (1, 840, 1260, '2026-01-01'),
  (2, 840, 1260, '2026-01-01'),
  (3, 840, 1260, '2026-01-01'),
  (4, 480, 720, '2026-01-01'), (4, 1020, 1200, '2026-01-01'),
  (5, 840, 1260, '2026-01-01'),
  (6, 480, 720, '2026-01-01'), (6, 840, 1020, '2026-01-01');

INSERT INTO administradoras (id, nome, criada_em) VALUES
  ('saara', 'Saara', 0),
  ('julianny', 'Julianny', 0);
