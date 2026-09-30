/**
 * Realizado mensal → premissas da simulação (puro, sem IO).
 *
 * O painel "Realizado" guarda, por empresa e competência, os valores vindos dos sistemas-fonte
 * (PDV, Clínica, RH) com a proveniência de cada campo. Este módulo transforma uma janela de meses
 * reais no histórico de 12 meses + balanço de abertura que o motor espera, e devolve a lista de
 * lacunas (campos que não puderam ser derivados e o motivo) para a UI sinalizar.
 */
import type { Abertura, Historico, Projecao } from './schema'

/** Drivers do realizado, na ordem do catálogo da UI. 1:1 com as colunas de sim_realizado_mensal. */
export const CAMPOS_REALIZADO = [
  'receitaBruta', 'receitaServicos', 'receitaProdutos', 'descontos', 'cancelamentos', 'qtdPedidos',
  'receitaDinheiro', 'receitaPix', 'receitaDebito', 'receitaCredito', 'receitaVoucher', 'receitaPrazo', 'inadimplencia', 'glosas',
  'compras', 'frete', 'comissoes', 'impostosVendas', 'irCsll',
  'folha', 'encargos', 'temporarios', 'proLabore', 'repassesTerapeutas',
  'aluguel', 'manutencao', 'fixosOutros', 'marketing', 'distribuicao',
  'caixaFinal', 'contasReceber', 'contasPagar', 'estoque', 'passivoPrepago', 'quebraCaixa',
] as const
export type CampoRealizado = (typeof CAMPOS_REALIZADO)[number]

/** Nome da coluna no banco (snake_case) de cada campo. */
export const COLUNA_REALIZADO: Record<CampoRealizado, string> = Object.fromEntries(
  CAMPOS_REALIZADO.map((c) => [c, c.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)]),
) as Record<CampoRealizado, string>

export type StatusCampoRealizado = 'ok' | 'sem_fonte' | 'sem_dados' | 'parcial' | 'manual'

export interface ProvenienciaCampo {
  fonte: string
  status: StatusCampoRealizado
  obs?: string | null
  atualizadoEm?: string | null
}

export interface RealizadoMensal {
  /** 'YYYY-MM' */
  competencia: string
  valores: Partial<Record<CampoRealizado, number | null>>
  campos: Partial<Record<CampoRealizado, ProvenienciaCampo>>
  status: 'vazio' | 'parcial' | 'ok'
  fechado: boolean
}

export interface Lacuna {
  /** Caminho do campo da simulação, ex.: 'historico.rb12' */
  campo: string
  motivo: string
  /** bloqueante = o campo ficou sem valor; aviso = preenchido, mas com ressalva */
  nivel: 'bloqueante' | 'aviso'
}

export interface Alimentacao {
  historico: Partial<Historico>
  abertura: Partial<Pick<Abertura, 'caixa0' | 'cr0' | 'estoque0'>>
  projecao: Partial<Pick<Projecao, 'sazonalidade'>>
  lacunas: Lacuna[]
  /** Janela usada ('YYYY-MM'), da mais antiga à mais recente */
  competencias: string[]
}

/** Normaliza para média 1 (a UI e a alimentação usam a mesma regra). */
export function normalizarSazonalidade(a: number[]): number[] {
  const m = a.reduce((s, x) => s + x, 0) / a.length
  return m > 0 ? a.map((x) => x / m) : Array(12).fill(1)
}

/** As `n` competências que terminam no mês de `dataBase` ('YYYY-MM-DD' ou 'YYYY-MM'). */
export function competenciasAte(dataBase: string, n = 12): string[] {
  const ano = Number(dataBase.slice(0, 4))
  const mes = Number(dataBase.slice(5, 7))
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const idx = ano * 12 + (mes - 1) - i
    const a = Math.floor(idx / 12)
    const m = (idx % 12) + 1
    out.push(`${a}-${String(m).padStart(2, '0')}`)
  }
  return out
}

const r2 = (x: number) => Math.round(x * 100) / 100

type Soma = { total: number; faltando: string[] }

function somar(meses: Map<string, RealizadoMensal>, janela: string[], campo: CampoRealizado): Soma {
  let total = 0
  const faltando: string[] = []
  for (const c of janela) {
    const v = meses.get(c)?.valores[campo]
    if (typeof v === 'number' && Number.isFinite(v)) total += v
    else faltando.push(c)
  }
  return { total, faltando }
}

const motivoFalta = (f: string[]) => (f.length === 12 ? 'sem dados em nenhum mês da janela' : `sem dados em ${f.join(', ')}`)

/** Ajusta [vista, prazo, cartão] para somar exatamente 100,00 (ajuste no maior). */
function fecharMix(vista: number, prazo: number, cartao: number): [number, number, number] {
  const tot = vista + prazo + cartao
  if (tot <= 0) return [100, 0, 0]
  const p = [r2((vista / tot) * 100), r2((prazo / tot) * 100), r2((cartao / tot) * 100)]
  const diff = r2(100 - (p[0] + p[1] + p[2]))
  if (diff !== 0) {
    const i = p.indexOf(Math.max(...p))
    p[i] = r2(p[i] + diff)
  }
  return [p[0], p[1], p[2]]
}

/**
 * Monta histórico 12m, abertura e sazonalidade a partir dos meses reais.
 * Campo derivado só entra quando todos os meses da janela têm valor; caso contrário vira lacuna bloqueante.
 */
export function montarPremissasDeRealizado(meses: RealizadoMensal[], dataBase: string): Alimentacao {
  const janela = competenciasAte(dataBase, 12)
  const mapa = new Map(meses.map((m) => [m.competencia, m]))
  const historico: Partial<Historico> = {}
  const abertura: Alimentacao['abertura'] = {}
  const projecao: Alimentacao['projecao'] = {}
  const lacunas: Lacuna[] = []
  const bloq = (campo: string, motivo: string) => lacunas.push({ campo, motivo, nivel: 'bloqueante' })
  const aviso = (campo: string, motivo: string) => lacunas.push({ campo, motivo, nivel: 'aviso' })

  const total12 = (chave: keyof Historico, campo: CampoRealizado, extra?: CampoRealizado) => {
    const s = somar(mapa, janela, campo)
    if (s.faltando.length) { bloq(`historico.${chave}`, motivoFalta(s.faltando)); return null }
    let v = s.total
    if (extra) {
      const e = somar(mapa, janela, extra)
      if (e.faltando.length) aviso(`historico.${chave}`, `${extra} sem dados em ${e.faltando.join(', ')} — somado só o que existe`)
      v += e.total
    }
    ;(historico as Record<string, number>)[chave] = r2(v)
    return v
  }

  const rb = total12('rb12', 'receitaBruta')
  total12('compras12', 'compras')
  total12('folha12', 'folha', 'encargos')
  total12('temporarios12', 'temporarios')
  total12('proLabore12', 'proLabore')
  total12('marketing12', 'marketing')
  total12('distribuicao12', 'distribuicao')
  total12('frete12', 'frete')
  total12('impVendas12', 'impostosVendas')
  total12('irCsll12', 'irCsll')

  // fixos12 = aluguel + manutenção + outros (cada parcela precisa existir)
  {
    const partes: CampoRealizado[] = ['aluguel', 'manutencao', 'fixosOutros']
    const somas = partes.map((p) => somar(mapa, janela, p))
    const faltas = partes.filter((_, i) => somas[i].faltando.length)
    if (faltas.length) bloq('historico.fixos12', `${faltas.join(', ')} ${motivoFalta(somas[partes.indexOf(faltas[0])].faltando)}`)
    else historico.fixos12 = r2(somas.reduce((s, x) => s + x.total, 0))
  }

  // comissão média = Σ comissões / Σ receita bruta
  {
    const s = somar(mapa, janela, 'comissoes')
    if (s.faltando.length) bloq('historico.pctComissao', motivoFalta(s.faltando))
    else if (rb === null || rb <= 0) bloq('historico.pctComissao', 'sem receita bruta para calcular a proporção')
    else historico.pctComissao = r2((s.total / rb) * 100)
  }

  // mix de pagamento: proporções dos próprios pagamentos recebidos
  {
    const partes: CampoRealizado[] = ['receitaPix', 'receitaDinheiro', 'receitaDebito', 'receitaCredito', 'receitaVoucher', 'receitaPrazo']
    const somas = new Map(partes.map((p) => [p, somar(mapa, janela, p)]))
    const faltas = partes.filter((p) => somas.get(p)!.faltando.length)
    if (faltas.length) {
      const f = somas.get(faltas[0])!.faltando
      for (const k of ['pctVista', 'pctPrazo', 'pctCartao']) bloq(`historico.${k}`, `formas de pagamento (${faltas.join(', ')}) ${motivoFalta(f)}`)
    } else {
      const vista = somas.get('receitaPix')!.total + somas.get('receitaDinheiro')!.total + somas.get('receitaDebito')!.total
      const cartao = somas.get('receitaCredito')!.total + somas.get('receitaVoucher')!.total
      const prazo = somas.get('receitaPrazo')!.total
      const tot = vista + cartao + prazo
      if (tot <= 0) {
        for (const k of ['pctVista', 'pctPrazo', 'pctCartao']) bloq(`historico.${k}`, 'nenhum pagamento registrado na janela')
      } else {
        const [pv, pp, pc] = fecharMix(vista, prazo, cartao)
        historico.pctVista = pv; historico.pctPrazo = pp; historico.pctCartao = pc
        if (rb !== null && rb > 0 && tot / rb < 0.8) aviso('historico.pctVista', `os pagamentos cobrem ${Math.round((tot / rb) * 100)}% da receita (sessões pré-pagas ou recebíveis fora do mês)`)
        // desconto médio à vista, estimado
        const d = somar(mapa, janela, 'descontos')
        if (!d.faltando.length && vista + d.total > 0) {
          historico.descVista = r2((d.total / (vista + d.total)) * 100)
          aviso('historico.descVista', 'estimado: descontos ÷ (vendas à vista + descontos)')
        }
        // inadimplência sobre vendas a prazo
        const i = somar(mapa, janela, 'inadimplencia')
        if (!i.faltando.length && prazo > 0) historico.pctInadimplencia = r2((i.total / prazo) * 100)
        else if (!i.faltando.length && i.total > 0) aviso('historico.pctInadimplencia', 'há inadimplência registrada, mas sem vendas a prazo para a base')
      }
    }
  }

  // sazonalidade: só com receita nos 12 meses; índice pelo mês do calendário
  {
    const s = somar(mapa, janela, 'receitaBruta')
    if (!s.faltando.length && s.total > 0) {
      const porMes = Array<number>(12).fill(0)
      for (const c of janela) porMes[Number(c.slice(5, 7)) - 1] = mapa.get(c)!.valores.receitaBruta as number
      if (porMes.every((x) => x > 0)) projecao.sazonalidade = normalizarSazonalidade(porMes).map((x) => Math.round(x * 1000) / 1000)
      else aviso('projecao.sazonalidade', 'há mês sem receita na janela; sazonalidade não calculada')
    } else if (!s.faltando.length) aviso('projecao.sazonalidade', 'receita zerada na janela')
  }

  // abertura: posições do mês da data-base
  {
    const ult = mapa.get(janela[janela.length - 1])
    const pos = (chave: 'caixa0' | 'cr0' | 'estoque0', campo: CampoRealizado) => {
      const v = ult?.valores[campo]
      if (typeof v === 'number' && Number.isFinite(v)) abertura[chave] = r2(v)
      else bloq(`abertura.${chave}`, `sem posição de ${campo} em ${janela[janela.length - 1]}`)
    }
    pos('caixa0', 'caixaFinal')
    pos('cr0', 'contasReceber')
    pos('estoque0', 'estoque')
  }

  // avisos gerais
  const parciais = janela.filter((c) => mapa.get(c)?.status === 'parcial')
  if (parciais.length) aviso('historico.rb12', `meses com dados parciais na janela: ${parciais.join(', ')}`)

  return { historico, abertura, projecao, lacunas, competencias: janela }
}

/**
 * Mescla valores alimentados num objeto já digitado. Sem `sobrescrever`, só preenche o que está vazio.
 */
export function mesclarPremissas<T extends object>(atual: Partial<T>, novo: Partial<T>, sobrescrever: boolean): {
  resultado: Partial<T>; aplicados: (keyof T)[]; mantidos: (keyof T)[]
} {
  const resultado: Partial<T> = { ...atual }
  const aplicados: (keyof T)[] = []
  const mantidos: (keyof T)[] = []
  for (const k of Object.keys(novo) as (keyof T)[]) {
    const v = novo[k]
    if (v === undefined) continue
    const existente = atual[k]
    const vazio = existente === undefined || existente === null || (existente as unknown) === ''
    if (vazio || sobrescrever) { resultado[k] = v; aplicados.push(k) }
    else mantidos.push(k)
  }
  return { resultado, aplicados, mantidos }
}
