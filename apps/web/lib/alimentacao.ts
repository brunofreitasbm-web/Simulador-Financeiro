import { mesclarPremissas, type Alimentacao } from '@sf/engine'
import type { AlimentacaoRegistro, Rascunho } from './rascunho'

const ehPadrao = (s: number[] | undefined) => !s || s.every((x) => x === 1)

/**
 * Aplica o realizado ao rascunho da simulação. Sem `sobrescrever`, só preenche campos vazios
 * (a sazonalidade padrão, toda 1, conta como vazia). Registra em `rascunho.alimentacao` o que veio
 * do realizado para o editor marcar os campos como "importado" e listar as lacunas.
 */
export function aplicarAlimentacao(r: Rascunho, a: Alimentacao, sobrescrever: boolean): { rascunho: Rascunho; aplicados: string[]; mantidos: string[] } {
  const aplicados: string[] = []
  const mantidos: string[] = []
  const campos: Record<string, number> = { ...(r.alimentacao?.campos ?? {}) }

  const h = mesclarPremissas(r.historico, a.historico, sobrescrever)
  for (const k of h.aplicados) { aplicados.push(`historico.${String(k)}`); campos[`historico.${String(k)}`] = a.historico[k] as number }
  for (const k of h.mantidos) mantidos.push(`historico.${String(k)}`)

  const { dividas, contingencias, ...aberturaAtual } = r.abertura
  const ab = mesclarPremissas(aberturaAtual, a.abertura, sobrescrever)
  for (const k of ab.aplicados) { aplicados.push(`abertura.${String(k)}`); campos[`abertura.${String(k)}`] = a.abertura[k as keyof typeof a.abertura] as number }
  for (const k of ab.mantidos) mantidos.push(`abertura.${String(k)}`)

  let sazonalidade = r.projecao.sazonalidade
  if (a.projecao.sazonalidade) {
    if (sobrescrever || ehPadrao(r.projecao.sazonalidade)) { sazonalidade = a.projecao.sazonalidade; aplicados.push('projecao.sazonalidade') }
    else mantidos.push('projecao.sazonalidade')
  }

  const alimentacao: AlimentacaoRegistro = { em: new Date().toISOString(), competencias: a.competencias, campos, lacunas: a.lacunas }
  return {
    rascunho: {
      ...r,
      historico: h.resultado,
      abertura: { ...ab.resultado, dividas, contingencias },
      projecao: { ...r.projecao, sazonalidade },
      alimentacao,
    },
    aplicados, mantidos,
  }
}
