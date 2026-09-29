'use client'
import { formatarBRL, type Resultado } from '@sf/engine'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { simular, type Simulado } from '@/lib/motor'
import { preencherExemplo, type Rascunho } from '@/lib/rascunho'
import { setIn } from '@/lib/util'
import { colunasMeses, linhasBP, linhasDFC, linhasDRE, linhasDividas, type Analise } from '@/lib/demonstrativos'
import { Comparar } from '../Comparar'
import { GraficoCaixa } from '../GraficoCaixa'
import { PainelIndicadores } from '../Indicadores'
import { Tabela } from '../Tabela'
import { Badge, Button, Card, Select, TextInput } from '../ui'
import { Alertas } from '../Alertas'
import { Cenarios } from './Cenarios'
import { CampoContext, type EstadoSalvo } from './CampoContext'
import { Premissas, type SetFn } from './Premissas'

const ABAS = [
  { id: 'premissas', rotulo: 'Premissas' },
  { id: 'cenarios', rotulo: 'Cenários' },
  { id: 'dre', rotulo: 'DRE' },
  { id: 'balanco', rotulo: 'Balanço' },
  { id: 'dfc', rotulo: 'Fluxo de caixa' },
  { id: 'indicadores', rotulo: 'Indicadores' },
  { id: 'dividas', rotulo: 'Dívidas' },
  { id: 'comparar', rotulo: 'Comparar' },
] as const
type AbaId = (typeof ABAS)[number]['id']

function useDebounced<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor)
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t) }, [valor, ms])
  return v
}


export function Editor({ id, empresaId, inicial }: { id: string; empresaId: string; inicial: Rascunho }) {
  const [r, setR] = useState<Rascunho>(inicial)
  const [aba, setAba] = useState<AbaId>('premissas')
  const [passo, setPasso] = useState(0)
  const [sel, setSel] = useState(0)
  const [analise, setAnalise] = useState<Analise>('nenhuma')
  const [estado, setEstado] = useState<EstadoSalvo>('salvo')
  const [salvoSnap, setSalvoSnap] = useState<Rascunho>(inicial)

  const set: SetFn = useCallback((path, valor) => setR((x) => setIn(x, path, valor)), [])

  // prévia ao vivo: debounce de 150 ms
  const rd = useDebounced(r, 150)
  const sims: Simulado[] = useMemo(() => rd.cenarios.map((c) => simular(rd, c.alavancas)), [rd])
  const atual = sims[0]
  const resultados = sims.map((s) => (s.ok ? s.resultado : null))
  const selIdx = Math.min(sel, sims.length - 1)
  const cen = sims[selIdx]

  // autosave: debounce de 2 s + descarga ao sair da página
  const ultimo = useRef(r)
  const sujo = useRef(false)
  const primeiro = useRef(true)
  ultimo.current = r
  const salvar = useCallback(async (keepalive = false) => {
    sujo.current = false
    setEstado('salvando')
    const enviado = ultimo.current
    try {
      const res = await fetch(`/api/simulacoes/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(enviado), keepalive })
      if (res.ok) setSalvoSnap(enviado)
      setEstado(res.ok ? (sujo.current ? 'pendente' : 'salvo') : 'erro')
    } catch { setEstado('erro') }
  }, [id])
  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return }
    sujo.current = true
    setEstado('pendente')
    const t = setTimeout(() => void salvar(), 1200)
    return () => clearTimeout(t)
  }, [r, salvar])
  useEffect(() => {
    const flush = () => { if (sujo.current) void salvar(true) }
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('pagehide', flush); flush() }
  }, [salvar])

  const salvarAgora = useCallback(() => { if (sujo.current) void salvar() }, [salvar])
  const totalMeses = r.horizonte
  const nCol = (res: Resultado) => colunasMeses(res).slice(0, totalMeses)

  return (
    <CampoContext.Provider value={{ salvo: salvoSnap, estado, salvarAgora }}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/empresas/${empresaId}`} className="text-sm text-ink-soft hover:text-ink">← {r.empresa.razaoSocial}</Link>
          <div className="mt-1 flex items-center gap-2">
            <TextInput value={r.nome} onChange={(v) => set(['nome'], v)} className="min-w-[16rem] text-lg font-semibold" />
            <Badge tone={estado === 'salvo' ? 'ok' : estado === 'erro' ? 'bad' : 'warn'}>
              {{ salvo: 'Salvo', pendente: 'Alterações pendentes…', salvando: 'Salvando…', erro: 'Erro ao salvar' }[estado]}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => { if (confirm('Substituir os dados atuais por um exemplo de comércio varejista?')) setR((x) => preencherExemplo(x)) }}>Carregar exemplo</Button>
          <a href={`/relatorio/${id}`} target="_blank" rel="noreferrer"><Button variant="soft">Relatório / PDF</Button></a>
        </div>
      </div>

      <FaixaResumo sim={atual} />

      <nav aria-label="Seções da simulação" className="sticky top-[57px] z-20 -mx-4 overflow-x-auto border-b border-line bg-paper/95 px-4 backdrop-blur">
        <div className="flex min-w-max items-center gap-1">
          {ABAS.map((a, i) => (
            <span key={a.id} className="flex items-center">
              {(i === 0 || i === 2) && (
                <span className={`mr-1 text-[10px] font-semibold uppercase tracking-wider text-ink-soft/70 ${i === 2 ? 'ml-3 border-l border-line pl-3' : ''}`}>
                  {i === 0 ? 'Entrada' : 'Resultados'}
                </span>
              )}
              <button
                onClick={() => setAba(a.id)} aria-current={aba === a.id ? 'page' : undefined}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${aba === a.id ? 'border-brand text-brand-dark' : 'border-transparent text-ink-soft hover:text-ink'}`}>
                {a.rotulo}
              </button>
            </span>
          ))}
        </div>
      </nav>

      {aba === 'premissas' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Premissas r={r} set={set} erros={atual.ok ? [] : atual.erros} passo={passo} setPasso={setPasso} />
          <PainelAoVivo sim={atual} />
        </div>
      )}
      {aba === 'cenarios' && <Cenarios r={r} set={set} resultados={resultados} />}

      {['dre', 'balanco', 'dfc', 'indicadores', 'dividas'].includes(aba) && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-soft">Cenário:</span>
          <Select value={String(selIdx)} onChange={(v) => setSel(Number(v))} options={r.cenarios.map((c, i) => ({ value: String(i), label: c.nome }))} />
          {aba === 'dre' && (
            <>
              <span className="ml-4 text-sm text-ink-soft">Análise vertical:</span>
              <Select value={analise} onChange={setAnalise} options={[{ value: 'nenhuma', label: 'Sem %' }, { value: 'rb', label: '% da receita bruta' }, { value: 'rl', label: '% da receita líquida' }]} />
            </>
          )}
          {cen.ok && aba === 'balanco' && <SeloBalanco r={cen.resultado} />}
        </div>
      )}

      {['dre', 'balanco', 'dfc', 'indicadores', 'dividas', 'comparar'].includes(aba) && !cen.ok && <Incompleto erros={cen.erros} ir={() => setAba('premissas')} />}

      {cen.ok && aba === 'dre' && (
        <>
          <Tabela colunas={nCol(cen.resultado)} linhas={linhasDRE(cen.resultado, analise)} totalRotulo="Total" extrasRotulos={analise === 'nenhuma' ? undefined : [analise === 'rb' ? '% RB' : '% RL']} />
          <p className="text-xs text-ink-soft">Passe o mouse sobre o nome de uma linha para ver a fórmula. A distribuição fica abaixo do lucro (decisão do produto); os indicadores usam o lucro antes dela.</p>
        </>
      )}
      {cen.ok && aba === 'balanco' && (
        <>
          <Tabela colunas={['Abertura', ...nCol(cen.resultado)]} linhas={linhasBP(cen.resultado)} />
          <p className="text-xs text-ink-soft">Os “resultados acumulados” do mês de abertura (destacados) são estimados pelo balanço: ativo − passivo − capital social. Contingências <b>possíveis</b> e ativos a receber não são reconhecidos (CPC 25).</p>
          <Notas r={cen.resultado} />
        </>
      )}
      {cen.ok && aba === 'dfc' && (
        <>
          <Card className="p-4"><GraficoCaixa series={[{ nome: 'Caixa', r: cen.resultado }]} /></Card>
          <Tabela colunas={nCol(cen.resultado)} linhas={linhasDFC(cen.resultado)} totalRotulo="Total" />
        </>
      )}
      {cen.ok && aba === 'indicadores' && (
        <>
          <PainelIndicadores r={cen.resultado} />
          <Alertas lista={cen.resultado.alertas} />
        </>
      )}
      {cen.ok && aba === 'dividas' && (
        cen.resultado.meses[0].dividas.length === 0
          ? <p className="text-sm text-ink-soft">Nenhuma dívida cadastrada.</p>
          : <Tabela colunas={['Abertura', ...nCol(cen.resultado)]} linhas={linhasDividas(cen.resultado)} />
      )}
      {aba === 'comparar' && sims.every((s) => s.ok) && (
        <Comparar cenarios={sims.map((s, i) => ({ nome: r.cenarios[i].nome, r: (s as { ok: true; resultado: Resultado }).resultado }))} />
      )}
    </div>
    </CampoContext.Provider>
  )
}

/** Faixa fixa com os números-chave, visível em todas as abas. */
function FaixaResumo({ sim }: { sim: Simulado }) {
  if (!sim.ok)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn">
        <span aria-hidden>●</span> Faltam {sim.erros.length} pendência(s) nas premissas para calcular os resultados.
      </div>
    )
  const r = sim.resultado
  const ult = r.meses[r.meses.length - 1]
  const pec = r.indicadores.anual.pec
  const criticos = r.alertas.filter((a) => a.nivel === 'critico').length
  const itens: [string, string, boolean][] = [
    ['Caixa no último mês', formatarBRL(ult.bp.caixa, 0), ult.bp.caixa < 0],
    ['Lucro antes da distribuição', formatarBRL(r.anual.dre.ll, 0), r.anual.dre.ll < 0],
    ['Equilíbrio contábil / mês', typeof pec === 'number' ? formatarBRL(pec, 0) : '—', false],
    ['EBITDA (12m)', formatarBRL(r.anual.dre.ebitda, 0), r.anual.dre.ebitda < 0],
  ]
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5" role="status" aria-label="Resumo do cenário Atual">
      {itens.map(([l, v, neg]) => (
        <div key={l} className="rounded-lg border border-line bg-card px-3 py-2">
          <div className="text-xs text-ink-soft">{l}</div>
          <div className={`valor text-base font-semibold ${neg ? 'text-bad' : ''}`}>{v}</div>
        </div>
      ))}
      <div className={`rounded-lg border px-3 py-2 ${criticos ? 'border-bad/30 bg-bad-soft' : 'border-ok/30 bg-ok-soft'}`}>
        <div className="text-xs text-ink-soft">Alertas</div>
        <div className={`text-base font-semibold ${criticos ? 'text-bad' : 'text-ok'}`}>{criticos ? `⚠ ${criticos} crítico(s)` : '✓ Sem críticos'}</div>
      </div>
    </div>
  )
}

function Incompleto({ erros, ir }: { erros: string[]; ir: () => void }) {
  return (
    <Card className="border-warn/40 bg-warn-soft p-4">
      <p className="mb-2 font-medium text-warn">Complete as premissas para ver os resultados.</p>
      <ul className="list-disc pl-5 text-sm">{erros.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>
      <Button className="mt-3" onClick={ir}>Ir para as premissas</Button>
    </Card>
  )
}

function SeloBalanco({ r }: { r: Resultado }) {
  const falhas = r.checagens.filter((c) => c.id === 'C1_balanco' && !c.ok)
  return falhas.length === 0 ? <Badge tone="ok">✓ Balanço fechado em todos os meses</Badge> : <Badge tone="bad">Balanço não fecha ({falhas.length} meses)</Badge>
}

function Notas({ r }: { r: Resultado }) {
  const { ativosContingentes, passivosPossiveis } = r.notas
  if (!ativosContingentes.length && !passivosPossiveis.length) return null
  const tot = (l: { valor: number }[]) => l.reduce((s, c) => s + c.valor, 0)
  return (
    <Card className="p-4 text-sm">
      <h3 className="mb-1 font-semibold">Notas — contingências não reconhecidas</h3>
      {ativosContingentes.length > 0 && <p>Ativos contingentes (a favor da empresa): {formatarBRL(tot(ativosContingentes), 0)} em {ativosContingentes.length} processo(s). Só são reconhecidos quando o ganho é praticamente certo.</p>}
      {passivosPossiveis.length > 0 && <p>Passivos com perda possível: {formatarBRL(tot(passivosPossiveis), 0)} em {passivosPossiveis.length} processo(s). Divulgados, mas sem provisão.</p>}
    </Card>
  )
}

function PainelAoVivo({ sim }: { sim: Simulado }) {
  return (
    <aside className="space-y-3 lg:sticky lg:top-28 lg:self-start">
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">Resultado ao vivo · cenário Atual</h3>
        {!sim.ok ? (
          <>
            <p className="mb-2 text-sm text-ink-soft">Faltam dados para calcular:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">{sim.erros.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul>
            {sim.erros.length > 6 && <p className="mt-1 text-xs text-ink-soft">+{sim.erros.length - 6} pendências</p>}
          </>
        ) : (
          <div className="space-y-3">
            <Metrica rotulo="Caixa no último mês" valor={sim.resultado.meses[sim.resultado.meses.length - 1].bp.caixa} />
            <Metrica rotulo="Lucro antes da distribuição (12m)" valor={sim.resultado.anual.dre.ll} />
            <SeloBalanco r={sim.resultado} />
            <Alertas lista={sim.resultado.alertas} compacto />
          </div>
        )}
      </Card>
    </aside>
  )
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: number | null }) {
  return (
    <div>
      <div className="text-xs text-ink-soft">{rotulo}</div>
      <div className={`num text-xl font-semibold ${valor !== null && valor < 0 ? 'text-bad' : ''}`}>{formatarBRL(valor, 0)}</div>
    </div>
  )
}
