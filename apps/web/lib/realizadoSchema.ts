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
])
export const FontesBody = z.array(FonteBody).max(3)
export type FonteInput = z.infer<typeof FonteBody>
