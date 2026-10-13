/**
 * Artefato de fechamento mensal publicado pelos repositórios-fonte (puro, sem IO).
 *
 * Cada sistema do grupo (PDV, Clínica, RH) versiona, no fim do mês, um arquivo
 * `fechamento/AAAA-MM.json` no próprio repositório GitHub. O Simulador só lê esse arquivo: não
 * conhece o banco do outro sistema. Este módulo é o contrato — valida o artefato e o converte no
 * par `(valores, campos)` que a RPC `sim_gravar_realizado` espera, exatamente como as extrações
 * ao vivo (`sim_extrair_pdv`, `extrairClinica`, `extrairRh`) fazem.
 *
 * Regra central: um campo **não declarado** fica intocado no banco (outra fonte pode ter trazido).
 * Para dizer "este sistema não tem este dado", a fonte declara `valores[k] = null` com
 * `campos[k].status = 'sem_fonte'`.
 */
import { CAMPOS_REALIZADO, COLUNA_REALIZADO, type StatusCampoRealizado } from './realizado'

/** Versão do contrato. Muda em breaking change; o leitor recusa versão que não conhece. */
export const SCHEMA_FECHAMENTO = 'sf.fechamento/1'

/** Sistemas que publicam fechamento. */
export const SISTEMAS_FECHAMENTO = ['pdv', 'clinica', 'rh'] as const
export type SistemaFechamento = (typeof SISTEMAS_FECHAMENTO)[number]

/** Colunas de `sim_realizado_mensal` (snake_case) que um fechamento pode declarar. */
export const COLUNAS_FECHAMENTO: readonly string[] = CAMPOS_REALIZADO.map((c) => COLUNA_REALIZADO[c])

export interface CampoFechamento {
  status?: StatusCampoRealizado
  obs?: string | null
}

export interface UnidadeFechamento {
  /** Identidade da unidade no sistema-fonte (unit_id, clinic_id ou slug). Casa com `sim_fonte_dados.config`. */
  chave: string
  rotulo?: string
  /** Só colunas de `COLUNAS_FECHAMENTO`. `null` = a fonte declara ausência. */
  valores: Record<string, number | null>
  campos?: Record<string, CampoFechamento>
  detalhes?: Record<string, unknown>
}

export interface Fechamento {
  schema: string
  /** 'YYYY-MM' */
  competencia: string
  gerado_em?: string
  sistema: SistemaFechamento
  repo?: string
  unidades: UnidadeFechamento[]
}

export type ResultadoValidacaoFechamento =
  | { ok: true; fechamento: Fechamento; avisos: string[] }
  | { ok: false; erros: string[] }

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/
const STATUS: readonly StatusCampoRealizado[] = ['ok', 'sem_fonte', 'sem_dados', 'parcial', 'manual']

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
/** Número finito, `null` explícito, ou string numérica aceita de planilha. */
function numeroOuNull(v: unknown): number | null | undefined {
  if (v === null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

/**
 * Valida o artefato publicado. Erro = o arquivo existe mas não é um fechamento utilizável
 * (schema desconhecido, competência inválida, unidade sem chave). Chave numérica inválida em
 * `valores` vira aviso e o campo é descartado, para um número sujo não derrubar o mês inteiro.
 */
export function validarFechamento(bruto: unknown): ResultadoValidacaoFechamento {
  const erros: string[] = []
  const avisos: string[] = []
  if (!ehObjeto(bruto)) return { ok: false, erros: ['o arquivo não é um objeto JSON'] }

  const schema = bruto.schema
  if (schema !== SCHEMA_FECHAMENTO) erros.push(`schema: esperado '${SCHEMA_FECHAMENTO}', veio ${JSON.stringify(schema ?? null)}`)

  const competencia = bruto.competencia
  if (typeof competencia !== 'string' || !COMPETENCIA.test(competencia)) erros.push(`competencia: esperado 'YYYY-MM', veio ${JSON.stringify(competencia ?? null)}`)

  const sistema = bruto.sistema
  if (typeof sistema !== 'string' || !(SISTEMAS_FECHAMENTO as readonly string[]).includes(sistema)) {
    erros.push(`sistema: esperado um de ${SISTEMAS_FECHAMENTO.join(' | ')}, veio ${JSON.stringify(sistema ?? null)}`)
  }

  const unidadesBrutas = bruto.unidades
  if (!Array.isArray(unidadesBrutas) || unidadesBrutas.length === 0) erros.push('unidades: esperado um array com pelo menos uma unidade')

  const unidades: UnidadeFechamento[] = []
  if (Array.isArray(unidadesBrutas)) {
    unidadesBrutas.forEach((u, i) => {
      if (!ehObjeto(u)) { erros.push(`unidades[${i}]: não é um objeto`); return }
      const chave = u.chave
      if (typeof chave !== 'string' || chave.trim() === '') { erros.push(`unidades[${i}].chave: obrigatória`); return }
      if (!ehObjeto(u.valores)) { erros.push(`unidades[${i}].valores: obrigatório (use null para declarar ausência)`); return }

      const valores: Record<string, number | null> = {}
      for (const [k, v] of Object.entries(u.valores)) {
        if (!COLUNAS_FECHAMENTO.includes(k)) { avisos.push(`unidades[${i}].valores.${k}: coluna desconhecida, ignorada`); continue }
        const n = numeroOuNull(v)
        if (n === undefined) { avisos.push(`unidades[${i}].valores.${k}: ${JSON.stringify(v)} não é número nem null, ignorado`); continue }
        valores[k] = n
      }

      const campos: Record<string, CampoFechamento> = {}
      if (u.campos !== undefined) {
        if (!ehObjeto(u.campos)) erros.push(`unidades[${i}].campos: esperado objeto`)
        else {
          for (const [k, c] of Object.entries(u.campos)) {
            if (!COLUNAS_FECHAMENTO.includes(k)) continue
            if (!(k in valores)) { avisos.push(`unidades[${i}].campos.${k}: sem valor correspondente em valores, ignorado`); continue }
            if (!ehObjeto(c)) { erros.push(`unidades[${i}].campos.${k}: esperado objeto { status, obs }`); continue }
            const st = c.status
            if (st !== undefined && !STATUS.includes(st as StatusCampoRealizado)) {
              erros.push(`unidades[${i}].campos.${k}.status: '${String(st)}' inválido`)
              continue
            }
            campos[k] = { status: st as StatusCampoRealizado | undefined, obs: typeof c.obs === 'string' ? c.obs : null }
          }
        }
      }

      unidades.push({
        chave,
        rotulo: typeof u.rotulo === 'string' ? u.rotulo : undefined,
        valores,
        campos,
        detalhes: ehObjeto(u.detalhes) ? u.detalhes : undefined,
      })
    })
  }

  if (erros.length) return { ok: false, erros }
  return {
    ok: true,
    avisos,
    fechamento: {
      schema: SCHEMA_FECHAMENTO,
      competencia: competencia as string,
      gerado_em: typeof bruto.gerado_em === 'string' ? bruto.gerado_em : undefined,
      sistema: sistema as SistemaFechamento,
      repo: typeof bruto.repo === 'string' ? bruto.repo : undefined,
      unidades,
    },
  }
}

/** A unidade do fechamento que casa com `chave` (config da fonte). Casa também pelo rótulo. */
export function selecionarUnidade(f: Fechamento, chave: string): UnidadeFechamento | null {
  const alvo = chave.trim().toLowerCase()
  return f.unidades.find((u) => u.chave.trim().toLowerCase() === alvo)
    ?? f.unidades.find((u) => (u.rotulo ?? '').trim().toLowerCase() === alvo)
    ?? null
}

export interface ExtracaoFechamento {
  valores: Record<string, number | null>
  campos: Record<string, { fonte: string; status: StatusCampoRealizado; obs: string | null; atualizado_em: string }>
  detalhes: Record<string, unknown>
}

/**
 * Converte uma unidade do fechamento no par `(valores, campos)` da RPC de gravação.
 *
 * Duas regras protegem os dados já gravados por outra fonte:
 *  1. o que o artefato não citou permanece intocado no banco;
 *  2. `sem_fonte` é **declaração de ausência de fonte**, não afirmação sobre o campo — por isso é
 *     ignorado por padrão. Um repositório que publica o universo inteiro (para auditoria) não pode
 *     zerar a receita que o PDV trouxe só porque o RH não conhece a receita.
 *     Use `incluirSemFonte: true` para inspecionar o artefato cru.
 */
export function extrairFechamento(
  unidade: UnidadeFechamento,
  o: { fonte: string; rotuloFonte?: string; detalhes?: Record<string, unknown>; incluirSemFonte?: boolean },
): ExtracaoFechamento {
  const em = new Date().toISOString()
  const padrao = o.rotuloFonte ?? o.fonte
  const valores: ExtracaoFechamento['valores'] = {}
  const campos: ExtracaoFechamento['campos'] = {}
  for (const [k, v] of Object.entries(unidade.valores)) {
    if (!COLUNAS_FECHAMENTO.includes(k)) continue
    const decl = unidade.campos?.[k]
    const status = decl?.status ?? (v === null ? 'sem_dados' : 'ok')
    if (status === 'sem_fonte' && o.incluirSemFonte !== true) continue
    valores[k] = v
    campos[k] = {
      fonte: o.fonte,
      status,
      obs: decl?.obs ?? `fechamento publicado por ${padrao}`,
      atualizado_em: em,
    }
  }
  return { valores, campos, detalhes: { ...(o.detalhes ?? {}), ...(unidade.detalhes ?? {}) } }
}

/**
 * Esqueleto com todas as colunas marcadas como `sem_fonte` — o que o gerador de cada repo usa
 * para declarar explicitamente o que o sistema não sabe, em vez de omitir.
 */
export function esqueletoSemFonte(motivo: string): { valores: Record<string, null>; campos: Record<string, CampoFechamento> } {
  const valores: Record<string, null> = {}
  const campos: Record<string, CampoFechamento> = {}
  for (const k of COLUNAS_FECHAMENTO) { valores[k] = null; campos[k] = { status: 'sem_fonte', obs: motivo } }
  return { valores, campos }
}
