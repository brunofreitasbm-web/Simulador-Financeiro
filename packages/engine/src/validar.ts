import { EntradaSchema, type EntradaBruta, type EntradaSimulacao } from './schema'
import type { AlertaResultado } from './types'

export interface ValidacaoOk { ok: true; entrada: EntradaSimulacao; alertas: AlertaResultado[] }
export interface ValidacaoErro { ok: false; erros: string[] }

/** Seção 6.2 passo 1: erros bloqueantes e alertas (faixas de alerta da Seção 4). */
export function validar(bruta: EntradaBruta): ValidacaoOk | ValidacaoErro {
  const parsed = EntradaSchema.safeParse(bruta)
  if (!parsed.success) {
    return { ok: false, erros: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
  }
  const e = parsed.data
  const h = e.historico
  const erros: string[] = []
  const soma = h.pctVista + h.pctPrazo + h.pctCartao
  if (Math.abs(soma - 100) > 0.01) erros.push(`historico: pctVista + pctPrazo + pctCartao deve ser 100 (atual ${soma})`)
  if (e.empresa.regime === 'presumido' && !e.empresa.atividadePresumido) erros.push('empresa.atividadePresumido é obrigatório no regime presumido')
  if (e.abertura.imobilizado0 > 0 && !(e.abertura.vidaUtilMeses && e.abertura.vidaUtilMeses > 0)) erros.push('abertura.vidaUtilMeses deve ser > 0 quando há imobilizado')
  const media = e.projecao.sazonalidade.reduce((a, b) => a + b, 0) / 12
  if (Math.abs(media - 1) > 0.001) erros.push(`projecao.sazonalidade: média deve ser 1 (atual ${media.toFixed(4)})`)
  if (erros.length) return { ok: false, erros }

  const alertas: AlertaResultado[] = []
  const av = (id: string, mensagem: string) => alertas.push({ id, nivel: 'atencao', mensagem })
  if (h.descVista > 15) av('V_descVista', 'Desconto médio à vista acima de 15%.')
  if (h.prazoRecebDias > 120) av('V_prazoReceb', 'Prazo de recebimento acima de 120 dias.')
  if (h.taxaCartao > 6) av('V_taxaCartao', 'Taxa de cartão acima de 6%.')
  if (h.taxaAntecipacao > 4) av('V_taxaAntecipacao', 'Taxa de antecipação acima de 4% a.m.')
  if (h.pctInadimplencia > 10) av('V_inadimplencia', 'Inadimplência acima de 10%.')
  if (h.compras12 > h.rb12) av('V_compras', 'Compras 12m maiores que o faturamento 12m.')
  if (h.prazoPagFornecDias > 120) av('V_prazoPag', 'Prazo de pagamento a fornecedores acima de 120 dias.')
  const baseImp = h.rb12 - h.rb12 * (h.pctVista / 100) * (h.descVista / 100)
  if (baseImp > 0 && h.impVendas12 / baseImp > 0.3) av('V_aliquota', 'Alíquota efetiva de impostos sobre vendas acima de 30%.')
  return { ok: true, entrada: e, alertas }
}
