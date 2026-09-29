import { z } from 'zod'

export const EmpresaBody = z.object({
  razaoSocial: z.string().min(2).max(200),
  cnpj: z.string().max(20).nullish(),
  segmento: z.string().nullish(),
  regime: z.enum(['simples', 'presumido', 'real', 'mei']),
  atividadePresumido: z.enum(['comercio_industria', 'servicos']).nullish(),
  uf: z.string().length(2).nullish().or(z.literal('')),
  cidade: z.string().nullish(),
  anoInicio: z.number().int().nullish(),
  nomeFantasia: z.string().max(200).nullish(),
  porte: z.enum(['mei', 'micro', 'pequena', 'media', 'grande']).nullish().or(z.literal('')),
  responsavel: z.string().max(200).nullish(),
  emailContato: z.string().max(200).nullish(),
  telefone: z.string().max(40).nullish(),
  site: z.string().max(200).nullish(),
  descricaoAtividade: z.string().max(2000).nullish(),
  consentimento: z.boolean().nullish(),
})
