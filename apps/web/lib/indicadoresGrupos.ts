import { REGISTRY, type IndicadorId } from '@sf/engine'
import type { Fmt } from '@/components/Tabela'

export const GRUPOS_IND: { titulo: string; ids: IndicadorId[] }[] = [
  { titulo: 'Resultado', ids: ['rbMensal', 'gvPct', 'mcPct', 'ebitdaPct', 'ebitPct', 'mlPct', 'gfRl', 'custoVender'] },
  { titulo: 'Equilíbrio', ids: ['pec', 'pecRB', 'pef', 'mso', 'gao'] },
  { titulo: 'Ciclos e capital de giro', ids: ['pmre', 'pmrv', 'pmpc', 'co', 'cf', 'ncg', 'ncgDias', 'cdg', 'tesouraria'] },
  { titulo: 'Liquidez', ids: ['lc', 'ls', 'li', 'lg', 'runway'] },
  { titulo: 'Endividamento', ids: ['dlEbitda', 'icj', 'icjEbitda', 'endiv', 'ipl'] },
  { titulo: 'Retorno', ids: ['roe', 'roa', 'roic', 'spread'] },
  { titulo: 'Eficiência', ids: ['giroEstoque'] },
]

export const fmtInd = (id: IndicadorId): Fmt => {
  const u = REGISTRY.indicadores[id].unidade
  return u === 'BRL' ? 'brl' : u === 'pct' ? 'pct' : u === 'dias' ? 'dias' : u === 'meses' ? 'meses' : 'x'
}

