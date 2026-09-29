import { formatarBRL, REGISTRY, type IndicadorId } from '@sf/engine'
import { notFound } from 'next/navigation'
import { Alertas } from '@/components/Alertas'
import { ComparacaoDRE } from '@/components/ComparacaoDRE'
import { GraficoCaixa } from '@/components/GraficoCaixa'
import { PrintButton } from '@/components/PrintButton'
import { formatar, Tabela } from '@/components/Tabela'
import { carregarRascunho, obterEmpresa } from '@/lib/db/repo'
import { colunasMeses, linhasBP, linhasDFC, linhasDRE } from '@/lib/demonstrativos'
import { fmtInd, GRUPOS_IND } from '@/lib/indicadoresGrupos'
import { simular } from '@/lib/motor'
import { premissasPorBloco, recebiveisPorFaixa, resumoEmprestimos } from '@/lib/relatorioExtras'
import { criarCliente } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const PORTE: Record<string, string> = { mei: 'MEI', micro: 'Microempresa', pequena: 'Pequena', media: 'Média', grande: 'Grande' }
const REGIME: Record<string, string> = { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real', mei: 'MEI' }
const h2 = 'text-2xl font-semibold'

/** T14: relatório para impressão/PDF. */
export default async function Relatorio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = await criarCliente()
  const c = await carregarRascunho(sb, id)
  if (!c) notFound()
  const emp = await obterEmpresa(sb, c.empresaId)
  const r = c.rascunho
  const sims = r.cenarios.map((cn) => ({ nome: cn.nome, descricao: cn.descricao, s: simular(r, cn.alavancas) }))
  const base = sims[0].s
  if (!base.ok)
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-xl font-semibold">Relatório indisponível</h1>
        <p>Faltam dados na simulação:</p>
        <ul className="list-disc pl-5">{base.erros.map((e) => <li key={e}>{e}</li>)}</ul>
      </div>
    )
  const res = base.resultado
  const cols = colunasMeses(res)
  const ult = res.meses[res.meses.length - 1]
  const tot = (l: { valor: number }[]) => l.reduce((s, x) => s + x.valor, 0)
  const cenarios = sims.filter((x) => x.s.ok).map((x) => ({ nome: x.nome, r: (x.s as { ok: true; resultado: typeof res }).resultado }))
  const emprestimos = resumoEmprestimos(r)
  const receb = recebiveisPorFaixa(r, res)
  const a = res.indicadores.anual
  const glossario = Object.values(REGISTRY.indicadores)
  const ident: [string, string | null | undefined][] = emp
    ? [
        ['Empresa', emp.razaoSocial], ['Nome fantasia', emp.nomeFantasia], ['CNPJ', emp.cnpj], ['Segmento', emp.segmento],
        ['Porte', emp.porte ? PORTE[emp.porte] : null], ['Regime tributário', REGIME[emp.regimeTributario]],
        ['Localização', [emp.cidade, emp.uf].filter(Boolean).join(' / ')], ['Início das atividades', emp.anoInicio ? String(emp.anoInicio) : null],
        ['Responsável', emp.responsavel], ['E-mail', emp.emailContato], ['Telefone', emp.telefone], ['Site', emp.site],
      ]
    : []

  return (
    <div className="mx-auto max-w-[1100px] space-y-10">
      <div className="no-print flex justify-end gap-2"><PrintButton /></div>

      <section className="pagina space-y-6 py-12">
        <div className="text-center">
          <p className="text-sm uppercase tracking-widest text-ink-soft">Simulação financeira projetada</p>
          <h1 className="mt-2 text-4xl font-bold text-brand-dark">{r.empresa.razaoSocial}</h1>
          <p className="mt-1 text-xl">{r.nome}</p>
          <p className="text-ink-soft">Data-base {new Date(r.dataBase + 'T12:00:00').toLocaleDateString('pt-BR')} · horizonte de {r.horizonte} meses · motor v{res.engineVersion}</p>
        </div>
        <dl className="mx-auto grid max-w-3xl gap-x-8 gap-y-2 rounded-lg border border-line p-5 text-sm sm:grid-cols-2">
          {ident.map(([k, v]) => (
            <div key={k}><dt className="text-xs text-ink-soft">{k}</dt><dd>{v || '—'}</dd></div>
          ))}
        </dl>
        {emp?.descricaoAtividade && <p className="mx-auto max-w-3xl text-sm text-ink-soft">{emp.descricaoAtividade}</p>}
        {emp && !emp.consentimentoEm && (
          <p className="no-print mx-auto max-w-3xl rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
            Atenção: não há autorização LGPD registrada para esta empresa. Registre no cadastro antes de compartilhar o relatório.
          </p>
        )}
        <p className="pt-6 text-center text-xs text-ink-soft">Projeção gerencial. Não substitui demonstrações contábeis oficiais nem aconselhamento tributário.</p>
      </section>

      <section className="pagina space-y-4">
        <h2 className={h2}>Sumário executivo</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {([
            ['Faturamento mensal médio', formatar(a.rbMensal, 'brl')], ['Margem de contribuição', formatar(a.mcPct, 'pct')],
            ['Margem EBITDA', formatar(a.ebitdaPct, 'pct')], ['Margem líquida', formatar(a.mlPct, 'pct')],
            ['Equilíbrio contábil (mês)', formatar(a.pec, 'brl')], ['Liquidez corrente', formatar(a.lc, 'x')],
          ] as [string, string][]).map(([l, v]) => (
            <div key={l} className="rounded-lg border border-line p-3"><div className="text-xs text-ink-soft">{l}</div><div className="valor text-xl font-semibold">{v}</div></div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[['Receita bruta (12m)', res.anual.dre.rb], ['Lucro antes da distribuição', res.anual.dre.ll], ['EBITDA', res.anual.dre.ebitda], ['Caixa no último mês', ult.bp.caixa]].map(([l, v]) => (
            <div key={String(l)} className="rounded-lg border border-line p-3">
              <div className="text-xs text-ink-soft">{l}</div>
              <div className={`valor text-xl font-semibold ${Number(v) < 0 ? 'text-bad' : ''}`}>{formatarBRL(Number(v), 0)}</div>
            </div>
          ))}
        </div>
        <h3 className="font-semibold">Alertas</h3>
        <Alertas lista={res.alertas} />
        <h3 className="font-semibold">Caixa projetado</h3>
        <GraficoCaixa series={[{ nome: 'Caixa', r: res }]} />
      </section>

      <section className="pagina space-y-4">
        <h2 className={h2}>Premissas informadas</h2>
        <p className="text-sm text-ink-soft">Tudo o que foi preenchido no simulador, organizado por bloco.</p>
        {premissasPorBloco(r).map((b) => (
          <div key={b.titulo} className="break-inside-avoid">
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-brand-dark">{b.titulo}</h3>
            <table className="tabela w-full text-sm"><tbody>
              {b.itens.map(([k, v], i) => (
                <tr key={`${k}-${i}`} className="border-b border-line"><td className="w-2/3">{k}</td><td className="valor text-right">{v}</td></tr>
              ))}
            </tbody></table>
          </div>
        ))}
      </section>

      <section className="pagina space-y-3"><h2 className={h2}>DRE</h2><Tabela colunas={cols} linhas={linhasDRE(res, 'rl')} totalRotulo="Total" extrasRotulos={['% RL']} /></section>
      <section className="pagina space-y-3"><h2 className={h2}>Balanço patrimonial</h2><Tabela colunas={['Abertura', ...cols]} linhas={linhasBP(res)} /></section>
      <section className="pagina space-y-3"><h2 className={h2}>Fluxo de caixa</h2><Tabela colunas={cols} linhas={linhasDFC(res)} totalRotulo="Total" /></section>

      <section className="pagina space-y-3">
        <h2 className={h2}>Indicadores (anual)</h2>
        {GRUPOS_IND.map((g) => (
          <div key={g.titulo} className="break-inside-avoid">
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-soft">{g.titulo}</h3>
            <table className="tabela w-full text-sm"><tbody>
              {g.ids.map((i: IndicadorId) => (
                <tr key={i} className="border-b border-line">
                  <td>{REGISTRY.indicadores[i].rotulo}</td>
                  <td className="valor text-right font-medium">{formatar(res.indicadores.anual[i], fmtInd(i))}</td>
                  <td className="text-xs text-ink-soft">{REGISTRY.indicadores[i].formulaLegivel}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        ))}
      </section>

      <section className="pagina space-y-3">
        <h2 className={h2}>Ciclos: da compra ao recebimento</h2>
        <CicloOperacional pmre={a.pmre as number | null} pmrv={a.pmrv as number | null} pmpc={a.pmpc as number | null} cf={a.cf as number | null} />
      </section>

      <section className="pagina space-y-3">
        <h2 className={h2}>Recebíveis na abertura</h2>
        <p className="text-sm text-ink-soft">Carteira de contas a receber distribuída por vencimento. A desvalorização estima o custo de antecipar cada faixa à taxa informada.</p>
        <div className="grid grid-cols-3 gap-4">
          {[['Total nominal', receb.total], ['Total ajustado', receb.ajustado], ['Entrada mensal esperada', receb.entradaMensal]].map(([l, v]) => (
            <div key={String(l)} className="rounded-lg border border-line p-3"><div className="text-xs text-ink-soft">{l}</div><div className="valor text-lg font-semibold">{formatarBRL(Number(v), 0)}</div></div>
          ))}
        </div>
        <table className="tabela num w-full border-collapse text-sm">
          <thead><tr className="border-b border-line bg-paper text-xs text-ink-soft">
            <th className="text-left">Faixa</th><th className="text-right">Nominal</th><th className="text-right">Desvalorização</th><th className="text-right">Ajustado</th><th className="text-right">Acumulado</th>
          </tr></thead>
          <tbody>
            {receb.faixas.map((f) => (
              <tr key={f.faixa} className="border-b border-line">
                <td className="text-left">{f.faixa}</td>
                <td className="text-right">{formatarBRL(f.nominal, 0)}</td><td className="text-right">{formatarBRL(f.desvalorizacao, 0)}</td>
                <td className="text-right">{formatarBRL(f.ajustado, 0)}</td><td className="text-right">{formatarBRL(f.acumulado, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pagina space-y-3">
        <h2 className={h2}>Empréstimos</h2>
        {emprestimos.length === 0 ? <p className="text-sm text-ink-soft">Nenhum empréstimo bancário informado.</p> : (
          <table className="tabela num w-full border-collapse text-sm">
            <thead><tr className="border-b border-line bg-paper text-xs text-ink-soft">
              <th className="text-left">Empréstimo</th><th className="text-right">Principal</th><th className="text-right">Taxa a.m.</th><th className="text-right">Prazo</th>
              <th className="text-right">1ª parcela</th><th className="text-right">Total de juros</th><th className="text-right">Curto prazo</th><th className="text-right">Longo prazo</th>
            </tr></thead>
            <tbody>
              {emprestimos.map((e) => (
                <tr key={e.nome} className="border-b border-line">
                  <td className="text-left">{e.nome} <span className="text-xs text-ink-soft">({e.sistema}{e.carencia ? `, carência ${e.carencia}m` : ''}{e.mesInicio ? `, entra no mês ${e.mesInicio}` : ''})</span></td>
                  <td className="text-right">{formatarBRL(e.principal, 0)}</td><td className="text-right">{formatar(e.taxaMensal, 'pct')}</td><td className="text-right">{e.prazo} m</td>
                  <td className="text-right">{e.primeiraParcela === null ? '—' : formatarBRL(e.primeiraParcela, 0)}</td>
                  <td className="text-right">{formatarBRL(e.totalJuros, 0)}</td><td className="text-right">{formatarBRL(e.cp, 0)}</td><td className="text-right">{formatarBRL(e.lp, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3 className="pt-2 font-semibold">Contingências e dívidas tributárias</h3>
        <p className="text-sm">Ativos contingentes (não reconhecidos — CPC 25): {formatarBRL(tot(res.notas.ativosContingentes), 0)} em {res.notas.ativosContingentes.length} processo(s).</p>
        <p className="text-sm">Passivos com perda possível (divulgados, sem provisão): {formatarBRL(tot(res.notas.passivosPossiveis), 0)} em {res.notas.passivosPossiveis.length} processo(s).</p>
        <p className="text-sm">Provisões (perda provável) na abertura: {formatarBRL(res.meses[0].bp.provisoesCP + res.meses[0].bp.provisoesLP, 0)}. Parcelamentos tributários: {formatarBRL(res.meses[0].bp.parcelamentosCP + res.meses[0].bp.parcelamentosLP, 0)}.</p>
      </section>

      <section className="pagina space-y-3">
        <h2 className={h2}>Comparação de cenários</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {sims.map((s) => (
            <div key={s.nome} className="rounded-lg border border-line p-3 text-sm">
              <div className="font-semibold">{s.nome}</div>
              <p className="text-ink-soft">{s.descricao || 'Sem descrição registrada.'}</p>
            </div>
          ))}
        </div>
        <GraficoCaixa series={cenarios} />
        <ComparacaoDRE cenarios={cenarios} />
      </section>

      <section className="space-y-2">
        <h2 className={h2}>Glossário</h2>
        <table className="tabela w-full text-sm"><tbody>
          {glossario.map((g) => (
            <tr key={g.id} className="break-inside-avoid border-b border-line align-top">
              <td className="font-medium">{g.rotulo}</td><td className="whitespace-normal text-ink-soft">{g.glossario}</td>
            </tr>
          ))}
        </tbody></table>
      </section>
    </div>
  )
}

/** Barra simples do ciclo: estoque + recebimento, e o prazo de pagamento. */
function CicloOperacional({ pmre, pmrv, pmpc, cf }: { pmre: number | null; pmrv: number | null; pmpc: number | null; cf: number | null }) {
  if (pmre === null && pmrv === null && pmpc === null)
    return <p className="text-sm text-ink-soft">Ainda não há dados suficientes de estoque, recebimento e pagamento para desenhar os ciclos.</p>
  const partes = [
    { l: 'Estoque', v: pmre ?? 0, cor: 'bg-brand' }, { l: 'Recebimento', v: pmrv ?? 0, cor: 'bg-[#2b6cb0]' },
  ]
  const total = Math.max(1, (pmre ?? 0) + (pmrv ?? 0), pmpc ?? 0)
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 text-sm">Ciclo operacional: {formatar((pmre ?? 0) + (pmrv ?? 0), 'dias')}</div>
        <div className="flex h-7 overflow-hidden rounded bg-paper" role="img" aria-label="Ciclo operacional">
          {partes.map((p) => <div key={p.l} className={`${p.cor} flex items-center justify-center text-xs text-white`} style={{ width: `${(p.v / total) * 100}%` }}>{p.v > 0 ? `${p.l} ${Math.round(p.v)}d` : ''}</div>)}
        </div>
      </div>
      <div>
        <div className="mb-1 text-sm">Prazo de pagamento a fornecedores: {formatar(pmpc, 'dias')}</div>
        <div className="h-7 rounded bg-paper"><div className="flex h-7 items-center justify-center rounded bg-[#b7791f] text-xs text-white" style={{ width: `${((pmpc ?? 0) / total) * 100}%` }}>{pmpc ? `Pagamento ${Math.round(pmpc)}d` : ''}</div></div>
      </div>
      <p className="text-sm">Ciclo financeiro (dias em que o caixa financia a operação): <b>{formatar(cf, 'dias')}</b></p>
    </div>
  )
}
