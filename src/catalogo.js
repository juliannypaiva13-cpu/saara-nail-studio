// Dados públicos do estúdio (aprovados no protótipo). Usados pela vitrine, que funciona sem banco.
// Os mesmos serviços e expediente estão em migrations/0002_dados_iniciais.sql (um teste confere que batem).
export const ESTUDIO = {
  nome: 'Saara Nail Studio',
  whatsapp: '(99) 99217-4909',
  endereco: ['Rua Natinho Filho, s/n', 'Bairro Tucum', 'Alto Alegre do Maranhão, MA'],
  pix: { chave: 'saarasilvaesilva@gmail.com', tipo: 'e-mail', banco: 'Nubank' },
  sinalPercentual: 30,
  prazoVisivelMin: 15,
  toleranciaAtrasoMin: 15
};
export const SERVICOS = [
  { id: 'f1', nome: 'Molde F1', preco_centavos: 10000, duracao_min: 150, descricao: 'Alongamento com molde F1: formato uniforme, espessura fina e boa durabilidade.' },
  { id: 'postica', nome: 'Postiça Realista', preco_centavos: 5000, duracao_min: 120, descricao: 'Unhas postiças ajustadas ao seu formato, com aparência natural.' },
  { id: 'manicure', nome: 'Manicure Tradicional', preco_centavos: 2500, duracao_min: 120, descricao: 'Cutilagem cuidadosa, lixamento e esmaltação com acabamento caprichado.' }
];
// 0 = domingo … 6 = sábado · minutos desde 0h
export const EXPEDIENTE = { 0: [], 1: [[840, 1260]], 2: [[840, 1260]], 3: [[840, 1260]], 4: [[480, 720], [1020, 1200]], 5: [[840, 1260]], 6: [[480, 720], [840, 1020]] };
