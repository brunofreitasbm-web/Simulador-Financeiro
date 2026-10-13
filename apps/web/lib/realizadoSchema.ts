import { z } from 'zod'
import { CAMPOS_REALIZADO } from '@sf/engine'

export const Competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'competência no formato YYYY-MM')

/** PATCH /api/empresas/:id/realizado — edita uma célula ou fecha/reabre um mês. */
export const EdicaoRealizadoBody = z.union([
  z.object({
    competencia: Competencia,
    campo: z.enum(CAMPOS_REALIZADO),
    valor: z.number().finite().nullable(),
    obs: z.string().max(300).nullish(),
  }),
  z.object({ competencia: Competencia, fechado: z.boolean() }),
])
export type EdicaoRealizado = z.infer<typeof EdicaoRealizadoBody>

/** POST /api/empresas/:id/sincronizar */
export const SincronizarBody = z.object({
  competencias: z.array(Competencia).min(1).max(24).optional(),
  sobrescrever: z.boolean().default(false),
})

/** PUT /api/empresas/:id/fontes */
export const FonteBody = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('pdv'), ativo: z.boolean(), rotulo: z.string().max(120).nullish(), config: z.object({ unit_id: z.uuid() }) }),
  z.object({ tipo: z.literal('clinica'), ativo: z.boolean(), rotulo: z.string().max(120).nullish(), config: z.object({ clinic_id: z.uuid() }) }),
  z.object({ tipo: z.literal('rh'), ativo: z.boolean(), rotulo: z.string().max(120).nullish(), config: z.object({ unit_id: z.string().min(1).max(80) }) }),
  /**
   * Fechamento publicado no GitHub (`fechamento/AAAA-MM.json`). Uma empresa pode ter mais de uma:
   * o Playground recebe o PDV de `faca_amigos` e a folha de `controle-de-estagiario`.
   */
  z.object({
    tipo: z.literal('github'),
    ativo: z.boolean(),
    rotulo: z.string().max(120).nullish(),
    config: z.object({
      repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'repo no formato owner/nome'),
      unidade: z.string().min(1).max(160),
      branch: z.string().max(120).optional(),
      caminho: z.string().max(200).optional(),
    }),
  }),
])
/** Uma fonte por tipo, exceto `github`, que pode repetir (um repositório por fonte). */
export const FontesBody = z.array(FonteBody).max(12)
export type FonteInput = z.infer<typeof FonteBody>
