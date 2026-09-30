import type { CampoRealizado, StatusCampoRealizado } from '@sf/engine'

export type GrupoRealizado = 'Receita' | 'Mix de pagamento' | 'Custos variáveis' | 'Pessoal' | 'Fixos' | 'Posições no fim do mês'

export interface ItemCatalogo { chave: CampoRealizado; rotulo: string; grupo: GrupoRealizado; unidade: 'R$' | 'un'; ajuda?: string }

/** Rótulos e agrupamento das linhas do painel Realizado (mesma ordem de CAMPOS_REALIZADO). */
export const CATALOGO_REALIZADO: ItemCatalogo[] = [
  { chave: 'receitaBruta', rotulo: 'Receita bruta', grupo: 'Receita', unidade: 'R$', ajuda: 'Vendas reconhecidas no mês (antes de descontos e impostos).' },
  { chave: 'receitaServicos', rotulo: 'Receita de serviços', grupo: 'Receita', unidade: 'R$' },
  { chave: 'receitaProdutos', rotulo: 'Receita de produtos', grupo: 'Receita', unidade: 'R$' },
  { chave: 'descontos', rotulo: 'Descontos concedidos', grupo: 'Receita', unidade: 'R$' },
  { chave: 'cancelamentos', rotulo: 'Cancelamentos', grupo: 'Receita', unidade: 'R$' },
  { chave: 'qtdPedidos', rotulo: 'Pedidos / atendimentos', grupo: 'Receita', unidade: 'un' },
  { chave: 'receitaDinheiro', rotulo: 'Dinheiro', grupo: 'Mix de pagamento', unidade: 'R$' },
  { chave: 'receitaPix', rotulo: 'Pix', grupo: 'Mix de pagamento', unidade: 'R$' },
  { chave: 'receitaDebito', rotulo: 'Cartão de débito', grupo: 'Mix de pagamento', unidade: 'R$' },
  { chave: 'receitaCredito', rotulo: 'Cartão de crédito', grupo: 'Mix de pagamento', unidade: 'R$' },
  { chave: 'receitaVoucher', rotulo: 'Voucher', grupo: 'Mix de pagamento', unidade: 'R$' },
  { chave: 'receitaPrazo', rotulo: 'A prazo (boleto, convênio)', grupo: 'Mix de pagamento', unidade: 'R$' },
  { chave: 'inadimplencia', rotulo: 'Inadimplência', grupo: 'Mix de pagamento', unidade: 'R$' },
  { chave: 'glosas', rotulo: 'Glosas de convênio', grupo: 'Mix de pagamento', unidade: 'R$' },
  { chave: 'compras', rotulo: 'Compras / insumos', grupo: 'Custos variáveis', unidade: 'R$' },
  { chave: 'frete', rotulo: 'Frete / logística', grupo: 'Custos variáveis', unidade: 'R$' },
  { chave: 'comissoes', rotulo: 'Comissões', grupo: 'Custos variáveis', unidade: 'R$' },
  { chave: 'impostosVendas', rotulo: 'Impostos sobre vendas', grupo: 'Custos variáveis', unidade: 'R$' },
  { chave: 'irCsll', rotulo: 'IR / CSLL', grupo: 'Custos variáveis', unidade: 'R$' },
  { chave: 'folha', rotulo: 'Folha', grupo: 'Pessoal', unidade: 'R$' },
  { chave: 'encargos', rotulo: 'Encargos', grupo: 'Pessoal', unidade: 'R$' },
  { chave: 'temporarios', rotulo: 'Temporários / freelas', grupo: 'Pessoal', unidade: 'R$' },
  { chave: 'proLabore', rotulo: 'Pró-labore', grupo: 'Pessoal', unidade: 'R$' },
  { chave: 'repassesTerapeutas', rotulo: 'Repasses a terapeutas', grupo: 'Pessoal', unidade: 'R$' },
  { chave: 'aluguel', rotulo: 'Aluguel', grupo: 'Fixos', unidade: 'R$' },
  { chave: 'manutencao', rotulo: 'Manutenção', grupo: 'Fixos', unidade: 'R$' },
  { chave: 'fixosOutros', rotulo: 'Outros gastos fixos', grupo: 'Fixos', unidade: 'R$' },
  { chave: 'marketing', rotulo: 'Marketing', grupo: 'Fixos', unidade: 'R$' },
  { chave: 'distribuicao', rotulo: 'Distribuição de lucros', grupo: 'Fixos', unidade: 'R$' },
  { chave: 'caixaFinal', rotulo: 'Caixa e bancos', grupo: 'Posições no fim do mês', unidade: 'R$' },
  { chave: 'contasReceber', rotulo: 'Contas a receber', grupo: 'Posições no fim do mês', unidade: 'R$' },
  { chave: 'contasPagar', rotulo: 'Contas a pagar', grupo: 'Posições no fim do mês', unidade: 'R$' },
  { chave: 'estoque', rotulo: 'Estoque (a custo)', grupo: 'Posições no fim do mês', unidade: 'R$' },
  { chave: 'passivoPrepago', rotulo: 'Créditos pré-pagos (passivo)', grupo: 'Posições no fim do mês', unidade: 'R$' },
  { chave: 'quebraCaixa', rotulo: 'Quebra de caixa', grupo: 'Posições no fim do mês', unidade: 'R$' },
]

export const GRUPOS_REALIZADO: GrupoRealizado[] = ['Receita', 'Mix de pagamento', 'Custos variáveis', 'Pessoal', 'Fixos', 'Posições no fim do mês']

export const ROTULO_STATUS_CAMPO: Record<StatusCampoRealizado, string> = {
  ok: 'sincronizado', sem_fonte: 'sem fonte', sem_dados: 'sem dados', parcial: 'parcial', manual: 'manual',
}

export const ROTULO_FONTE: Record<string, string> = { pdv: 'PDV FaçaAmigos', clinica: 'Sistema da Clínica', rh: 'Gestão de Pessoas (RH)', manual: 'Digitado' }

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/** '2026-09' → 'set/2026' */
export const rotuloCompetencia = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(0, 4)}`

/** Competência atual 'YYYY-MM' no fuso de Belém (UTC−3). */
export function competenciaAtual(delta = 0): string {
  const d = new Date(Date.now() - 3 * 3600 * 1000)
  const idx = d.getUTCFullYear() * 12 + d.getUTCMonth() + delta
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}
