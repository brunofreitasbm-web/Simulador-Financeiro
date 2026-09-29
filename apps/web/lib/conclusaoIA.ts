import { formatarBRL, formatarPct, REGISTRY, type IndicadorId, type Resultado } from '@sf/engine'

/** Sobe a cada mudança no prompt ou no formato da entrada; fica gravado em sim_conclusao_ia.prompt_version. */
export const PROMPT_VERSION = 'v1'
export const AVISO_CONTADOR = 'Valide decisões tributárias com seu contador.'

export const SYSTEM_PROMPT = `Você é um analista financeiro que explica projeções a donos de pequenas e médias empresas, em português do Brasil, com linguagem simples e direta.
Você recebe um JSON com o resultado de UM cenário de uma projeção. Regras obrigatórias:
- Só cite números que estejam no JSON, copiados exatamente como aparecem (por exemplo "R$ 12.345" ou "8,5%"). Nunca calcule, arredonde, some, subtraia nem abrevie (não use "mil", "milhão" ou "k").
- Não invente fatos sobre a empresa e não use nenhum dado que não esteja no JSON.
- Não dê orientação jurídica ou tributária.
- Texto puro, sem markdown, sem asteriscos e sem tabelas.
Estrutura fixa, com estes quatro títulos, nesta ordem:
1) Situação atual — exatamente 3 frases.
2) Pontos de atenção — de 3 a 5 itens, do maior para o menor impacto no caixa, um por linha começando com "- ".
3) Alavancas mais sensíveis — o que muda o resultado, com base na comparação entre os cenários do JSON.
4) O que monitorar mês a mês — de 3 a 5 itens, um por linha começando com "- ".`

const brl = (v: number) => formatarBRL(v, 0)
const dias = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} dias`

const IND_ENVIADOS: IndicadorId[] = ['mcPct', 'ebitdaPct', 'mlPct', 'pec', 'lc', 'runway', 'dlEbitda', 'endiv', 'ncg', 'cdg', 'tesouraria', 'pmre', 'pmrv', 'pmpc', 'cf', 'roe']

function fmtIndicador(id: IndicadorId, v: number): string {
  switch (REGISTRY.indicadores[id].unidade) {
    case 'BRL': return brl(v)
    case 'pct': return formatarPct(v)
    case 'dias': return dias(v)
    case 'meses': return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses`
    default: return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}x`
  }
}

/** Resumo de um resultado com valores já formatados. Sem razão social, CNPJ ou qualquer dado de identificação. */
function resumir(r: Resultado) {
  const caixas = r.meses.map((m) => m.bp.caixa)
  const min = Math.min(...caixas)
  const indicadores: Record<string, string> = {}
  for (const id of IND_ENVIADOS) {
    const v = r.indicadores.anual[id]
    indicadores[REGISTRY.indicadores[id].rotulo] = v === 'nao_queima' ? 'não consome caixa' : typeof v === 'number' ? fmtIndicador(id, v) : 'não se aplica'
  }
  const dre = r.anual.dre
  return {
    receitaBruta12m: brl(dre.rb), receitaLiquida12m: brl(dre.rl), margemContribuicao12m: brl(dre.mc), ebitda12m: brl(dre.ebitda),
    lucroLiquido12m: brl(dre.ll), despesasFinanceiras12m: brl(dre.despFinanceiras),
    caixaAbertura: brl(caixas[0]), caixaFinal: brl(caixas[caixas.length - 1]), caixaMinimo: brl(min), mesDoCaixaMinimo: String(caixas.indexOf(min)),
    indicadoresAnuais: indicadores,
    alertas: r.alertas.map((a) => ({ nivel: a.nivel, mensagem: a.mensagem })),
  }
}

export interface EntradaIA {
  regime: string
  horizonteMeses: string
  cenarioAnalisado: { nome: string } & ReturnType<typeof resumir>
  comparacaoDeCenarios: { nome: string; caixaFinal: string; caixaMinimo: string; ebitda12m: string; lucroLiquido12m: string; alertasCriticos: string }[]
}

export function montarEntrada(regime: string, horizonte: number, cenarios: { nome: string; r: Resultado }[], idx: number): EntradaIA {
  return {
    regime, horizonteMeses: String(horizonte),
    cenarioAnalisado: { nome: cenarios[idx].nome, ...resumir(cenarios[idx].r) },
    comparacaoDeCenarios: cenarios.map(({ nome, r }) => {
      const s = resumir(r)
      return { nome, caixaFinal: s.caixaFinal, caixaMinimo: s.caixaMinimo, ebitda12m: s.ebitda12m, lucroLiquido12m: s.lucroLiquido12m, alertasCriticos: String(r.alertas.filter((a) => a.nivel === 'critico').length) }
    }),
  }
}

export const montarPrompt = (e: EntradaIA) => `Dados do cenário (JSON):\n${JSON.stringify(e, null, 1)}\n\nEscreva a conclusão seguindo a estrutura fixa.`

/** Extrai números em formato pt-BR ("1.234,56"). Datas MM/AAAA são ignoradas. */
export function extrairNumeros(texto: string): number[] {
  const semDatas = texto.replace(/\b\d{1,2}\/\d{4}\b/g, ' ')
  return (semDatas.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g) ?? []).map((s) => Number(s.replace(/\./g, '').replace(',', '.')))
}

/** Guardrail (PRD §9.1): todo número do texto tem de existir na entrada, com tolerância de arredondamento. */
export function validarNumeros(texto: string, entrada: EntradaIA): { ok: boolean; invalidos: number[] } {
  const permitidos = extrairNumeros(JSON.stringify(entrada))
  const invalidos = extrairNumeros(texto).filter((n) => {
    if (Number.isInteger(n) && n <= 12) return false // numeração de itens, meses e contagens pequenas
    return !permitidos.some((p) => Math.abs(p - n) <= Math.max(0.06, Math.abs(p) * 0.005))
  })
  return { ok: invalidos.length === 0, invalidos }
}
