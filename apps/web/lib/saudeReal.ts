import type { RealizadoMensal } from '@sf/engine'

export interface DRECalculada {
  competencia: string
  receitaBruta: number
  descontos: number
  cancelamentos: number
  receitaLiquida: number
  compras: number
  frete: number
  comissoes: number
  impostosVendas: number
  custosVariaveis: number
  margemContribuicao: number
  margemContribuicaoPct: number
  folha: number
  encargos: number
  temporarios: number
  proLabore: number
  repassesTerapeutas: number
  gastosPessoal: number
  aluguel: number
  manutencao: number
  fixosOutros: number
  marketing: number
  distribuicao: number
  gastosFixos: number
  despesasOperacionais: number
  ebitda: number
  ebitdaPct: number
  irCsll: number
  lucroLiquido: number
  lucroLiquidoPct: number
}

export interface BalancoTCalculado {
  competencia: string
  ativo: {
    circulante: {
      caixa: number
      contasReceber: number
      estoque: number
      total: number
    }
    naoCirculante: {
      imobilizado: number
      total: number
    }
    total: number
  }
  passivo: {
    circulante: {
      contasPagar: number
      passivoPrepago: number
      total: number
    }
    naoCirculante: {
      dividasLP: number
      total: number
    }
    patrimonioLiquido: number
    totalComPL: number
  }
  equilibrado: boolean
  diferenca: number
  proporcoes: {
    caixaPctAtivo: number
    contasReceberPctAtivo: number
    estoquePctAtivo: number
    contasPagarPctPassivo: number
    prepagoPctPassivo: number
    plPctPassivo: number
  }
}

export type StatusSemaforo = 'verde' | 'amarelo' | 'vermelho'

export interface ItemSemaforo {
  id: 'liquidez' | 'margem' | 'equilibrio' | 'runway'
  titulo: string
  subtitulo: string
  valorFormatado: string
  status: StatusSemaforo
  diagnostico: string
  detalheTecnico: string
  metaRecomendada: string
}

export interface IndicadoresSaude {
  competencia: string
  liquidezCorrente: number
  margemLiquidaPct: number
  margemEbitdaPct: number
  pontoEquilibrioBRL: number
  margemSegurancaPct: number
  runwayMeses: number
  semaforos: ItemSemaforo[]
}

const n = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function calcularDREReal(m: RealizadoMensal): DRECalculada {
  const v = m.valores
  const receitaBruta = n(v.receitaBruta)
  const descontos = n(v.descontos)
  const cancelamentos = n(v.cancelamentos)
  const receitaLiquida = Math.max(0, receitaBruta - descontos - cancelamentos)

  const compras = n(v.compras)
  const frete = n(v.frete)
  const comissoes = n(v.comissoes)
  const impostosVendas = n(v.impostosVendas)
  const custosVariaveis = compras + frete + comissoes + impostosVendas

  const margemContribuicao = receitaLiquida - custosVariaveis
  const margemContribuicaoPct = receitaLiquida > 0 ? margemContribuicao / receitaLiquida : 0

  const folha = n(v.folha)
  const encargos = n(v.encargos)
  const temporarios = n(v.temporarios)
  const proLabore = n(v.proLabore)
  const repassesTerapeutas = n(v.repassesTerapeutas)
  const gastosPessoal = folha + encargos + temporarios + proLabore + repassesTerapeutas

  const aluguel = n(v.aluguel)
  const manutencao = n(v.manutencao)
  const fixosOutros = n(v.fixosOutros)
  const marketing = n(v.marketing)
  const distribuicao = n(v.distribuicao)
  const gastosFixos = aluguel + manutencao + fixosOutros + marketing + distribuicao

  const despesasOperacionais = gastosPessoal + gastosFixos
  const ebitda = margemContribuicao - despesasOperacionais
  const ebitdaPct = receitaLiquida > 0 ? ebitda / receitaLiquida : 0

  const irCsll = n(v.irCsll)
  const lucroLiquido = ebitda - irCsll
  const lucroLiquidoPct = receitaLiquida > 0 ? lucroLiquido / receitaLiquida : 0

  return {
    competencia: m.competencia,
    receitaBruta,
    descontos,
    cancelamentos,
    receitaLiquida,
    compras,
    frete,
    comissoes,
    impostosVendas,
    custosVariaveis,
    margemContribuicao,
    margemContribuicaoPct,
    folha,
    encargos,
    temporarios,
    proLabore,
    repassesTerapeutas,
    gastosPessoal,
    aluguel,
    manutencao,
    fixosOutros,
    marketing,
    distribuicao,
    gastosFixos,
    despesasOperacionais,
    ebitda,
    ebitdaPct,
    irCsll,
    lucroLiquido,
    lucroLiquidoPct,
  }
}

export function calcularBalancoTReal(m: RealizadoMensal): BalancoTCalculado {
  const v = m.valores
  const caixa = n(v.caixaFinal)
  const contasReceber = n(v.contasReceber)
  const estoque = n(v.estoque)
  const totalAC = caixa + contasReceber + estoque

  const imobilizado = 0
  const totalANC = imobilizado
  const totalAtivo = totalAC + totalANC

  const contasPagar = n(v.contasPagar)
  const passivoPrepago = n(v.passivoPrepago)
  const totalPC = contasPagar + passivoPrepago

  const dividasLP = 0
  const totalPNC = dividasLP

  // No modelo real sem lançamento de capital histórico separado, o PL fecha o balanço (Ativo - Passivo Exigível)
  const exigivelTotal = totalPC + totalPNC
  const patrimonioLiquido = totalAtivo - exigivelTotal
  const totalComPL = exigivelTotal + patrimonioLiquido
  const diferenca = Math.abs(totalAtivo - totalComPL)
  const equilibrado = diferenca < 0.05

  const baseAtivo = totalAtivo > 0 ? totalAtivo : 1
  const basePassivo = totalComPL > 0 ? totalComPL : 1

  return {
    competencia: m.competencia,
    ativo: {
      circulante: {
        caixa,
        contasReceber,
        estoque,
        total: totalAC,
      },
      naoCirculante: {
        imobilizado,
        total: totalANC,
      },
      total: totalAtivo,
    },
    passivo: {
      circulante: {
        contasPagar,
        passivoPrepago,
        total: totalPC,
      },
      naoCirculante: {
        dividasLP,
        total: totalPNC,
      },
      patrimonioLiquido,
      totalComPL,
    },
    equilibrado,
    diferenca,
    proporcoes: {
      caixaPctAtivo: totalAtivo > 0 ? caixa / baseAtivo : 0,
      contasReceberPctAtivo: totalAtivo > 0 ? contasReceber / baseAtivo : 0,
      estoquePctAtivo: totalAtivo > 0 ? estoque / baseAtivo : 0,
      contasPagarPctPassivo: totalComPL > 0 ? contasPagar / basePassivo : 0,
      prepagoPctPassivo: totalComPL > 0 ? passivoPrepago / basePassivo : 0,
      plPctPassivo: totalComPL > 0 ? Math.max(0, patrimonioLiquido) / basePassivo : 0,
    },
  }
}

export function calcularSemaforosSaude(dre: DRECalculada, bp: BalancoTCalculado): IndicadoresSaude {
  const ac = bp.ativo.circulante.total
  const pc = bp.passivo.circulante.total
  const caixa = bp.ativo.circulante.caixa

  // 1. Liquidez Corrente
  const liquidezCorrente = pc > 0 ? ac / pc : ac > 0 ? 99 : 0
  let statusLiquidez: StatusSemaforo = 'amarelo'
  let diagLiquidez = 'Equilíbrio exato entre ativos de curto prazo e contas a pagar.'

  if (pc === 0 && ac > 0) {
    statusLiquidez = 'verde'
    diagLiquidez = 'Sem dívidas de curto prazo registradas e com saldo disponível.'
  } else if (liquidezCorrente >= 1.5) {
    statusLiquidez = 'verde'
    diagLiquidez = `Para cada R$ 1,00 a pagar no curto prazo, a empresa possui R$ ${liquidezCorrente.toFixed(2).replace('.', ',')} em caixa, clientes e estoque.`
  } else if (liquidezCorrente >= 1.0) {
    statusLiquidez = 'amarelo'
    diagLiquidez = `Cobre as contas à risca (R$ ${liquidezCorrente.toFixed(2).replace('.', ',')} por R$ 1,00 de dívida), com pouca folga de caixa.`
  } else {
    statusLiquidez = 'vermelho'
    diagLiquidez = `Alerta de liquidez: as contas imediatas (R$ ${pc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) superam o ativo circulante.`
  }

  // 2. Margem Líquida & EBITDA
  const mlPct = dre.lucroLiquidoPct
  let statusMargem: StatusSemaforo = 'amarelo'
  let diagMargem = ''

  if (mlPct >= 0.15) {
    statusMargem = 'verde'
    diagMargem = `Alta rentabilidade: ${(mlPct * 100).toFixed(1).replace('.', ',')}% da receita vira lucro líquido real após todos os custos.`
  } else if (mlPct > 0) {
    statusMargem = 'amarelo'
    diagMargem = `Operação no azul com margem de ${(mlPct * 100).toFixed(1).replace('.', ',')}%. Pequenos aumentos de custos podem pressionar o caixa.`
  } else if (dre.receitaLiquida === 0) {
    statusMargem = 'amarelo'
    diagMargem = 'Período sem faturamento registrado.'
  } else {
    statusMargem = 'vermelho'
    diagMargem = `Operação gerando prejuízo líquido de R$ ${Math.abs(dre.lucroLiquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no período.`
  }

  // 3. Ponto de Equilíbrio Operacional
  const mcPct = dre.margemContribuicaoPct
  const pontoEquilibrioBRL = mcPct > 0 ? dre.despesasOperacionais / mcPct : 0
  const folgaBRL = dre.receitaLiquida - pontoEquilibrioBRL
  const margemSegurancaPct = dre.receitaLiquida > 0 ? folgaBRL / dre.receitaLiquida : 0

  let statusEquilibrio: StatusSemaforo = 'amarelo'
  let diagEquilibrio = ''

  if (dre.receitaLiquida >= pontoEquilibrioBRL * 1.2 && pontoEquilibrioBRL > 0) {
    statusEquilibrio = 'verde'
    diagEquilibrio = `Faturamento seguro: ${(margemSegurancaPct * 100).toFixed(0)}% acima do necessário para pagar todas as contas da operação.`
  } else if (dre.receitaLiquida >= pontoEquilibrioBRL && pontoEquilibrioBRL > 0) {
    statusEquilibrio = 'amarelo'
    diagEquilibrio = 'Faturamento muito próximo do limite mínimo operacional (margem de segurança baixa).'
  } else if (pontoEquilibrioBRL > 0) {
    statusEquilibrio = 'vermelho'
    diagEquilibrio = `Faltam R$ ${Math.abs(folgaBRL).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de faturamento para atingir o zero a zero.`
  } else {
    statusEquilibrio = 'amarelo'
    diagEquilibrio = 'Custos fixos ou margem de contribuição zerados.'
  }

  // 4. Runway / Cobertura de Caixa
  const custosMensaisOperacionais = dre.despesasOperacionais + dre.custosVariaveis
  const runwayMeses = custosMensaisOperacionais > 0 ? caixa / custosMensaisOperacionais : caixa > 0 ? 12 : 0

  let statusRunway: StatusSemaforo = 'amarelo'
  let diagRunway = ''

  if (runwayMeses >= 3) {
    statusRunway = 'verde'
    diagRunway = `Caixa saudável: ${runwayMeses.toFixed(1).replace('.', ',')} meses de despesas cobertas com o saldo atual.`
  } else if (runwayMeses >= 1) {
    statusRunway = 'amarelo'
    diagRunway = `Reserva moderada: ${runwayMeses.toFixed(1).replace('.', ',')} mês(es) de sobrevida sem novas entradas.`
  } else if (custosMensaisOperacionais > 0) {
    statusRunway = 'vermelho'
    diagRunway = `Atenção: caixa atual cobre menos de 1 mês de gastos operacionais da empresa.`
  } else {
    statusRunway = 'amarelo'
    diagRunway = 'Sem histórico de gastos operacionais no mês.'
  }

  const semaforos: ItemSemaforo[] = [
    {
      id: 'liquidez',
      titulo: 'Liquidez Corrente',
      subtitulo: 'Capacidade de honrar compromissos de curto prazo',
      valorFormatado: pc > 0 ? `${liquidezCorrente.toFixed(2).replace('.', ',')}x` : ac > 0 ? 'Sem dívidas' : '—',
      status: statusLiquidez,
      diagnostico: diagLiquidez,
      detalheTecnico: `Ativo Circulante (R$ ${ac.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) ÷ Passivo Circulante (R$ ${pc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`,
      metaRecomendada: 'Meta saudável: ≥ 1,50x',
    },
    {
      id: 'margem',
      titulo: 'Margens Realizadas',
      subtitulo: 'Lucro Líquido e EBITDA sobre faturamento',
      valorFormatado: `${(mlPct * 100).toFixed(1).replace('.', ',')}% líq. · ${(dre.ebitdaPct * 100).toFixed(1).replace('.', ',')}% EBITDA`,
      status: statusMargem,
      diagnostico: diagMargem,
      detalheTecnico: `Lucro Líquido (R$ ${dre.lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) ÷ Receita Líquida (R$ ${dre.receitaLiquida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`,
      metaRecomendada: 'Meta saudável: ≥ 15,0% líquida',
    },
    {
      id: 'equilibrio',
      titulo: 'Ponto de Equilíbrio',
      subtitulo: 'Faturamento mínimo mensal para não ter prejuízo',
      valorFormatado: `R$ ${pontoEquilibrioBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      status: statusEquilibrio,
      diagnostico: diagEquilibrio,
      detalheTecnico: `Custos Fixos (R$ ${dre.despesasOperacionais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) ÷ Margem Contribuição (${(mcPct * 100).toFixed(1).replace('.', ',')}%)`,
      metaRecomendada: 'Meta: Faturamento ≥ 20% acima do Ponto de Equilíbrio',
    },
    {
      id: 'runway',
      titulo: 'Runway / Cobertura de Caixa',
      subtitulo: 'Autonomia em meses sem novas receitas',
      valorFormatado: `${runwayMeses.toFixed(1).replace('.', ',')} meses`,
      status: statusRunway,
      diagnostico: diagRunway,
      detalheTecnico: `Caixa Final (R$ ${caixa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) ÷ Custos da Operação (R$ ${custosMensaisOperacionais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês)`,
      metaRecomendada: 'Meta saudável: ≥ 3 a 6 meses de cobertura',
    },
  ]

  return {
    competencia: dre.competencia,
    liquidezCorrente,
    margemLiquidaPct: mlPct,
    margemEbitdaPct: dre.ebitdaPct,
    pontoEquilibrioBRL,
    margemSegurancaPct,
    runwayMeses,
    semaforos,
  }
}
