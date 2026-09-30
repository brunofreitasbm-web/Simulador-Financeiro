'use client'
import { formatarBRL } from '@sf/engine'
import { OBRIGATORIOS, useCampo, type StatusCampo } from './CampoContext'
import { useState } from 'react'
import { Button, Card, Field, NumInput, Select, TextInput } from '../ui'
import { getIn } from '@/lib/util'
import { ROTULOS } from '@/lib/rotulos'
import {
  normalizarSazonalidade, type ContingenciaForm, type DividaForm, type EventoForm, type Rascunho,
} from '@/lib/rascunho'

type Path = (string | number)[]
export type SetFn = (path: Path, valor: unknown) => void

export const PASSOS = [
  'Receita e canais', 'Custos variáveis', 'Estrutura fixa', 'Balanço de abertura', 'Dívidas e contingências', 'Projeção',
]

/** Campos obrigatórios por passo — para sinalizar pendências na navegação. */
const CHAVES_PASSO: string[][] = [
  ['rb12', 'pctVista', 'pctPrazo', 'pctCartao', 'prazoRecebDias'],
  ['pctComissao', 'compras12', 'prazoPagFornecDias'],
  ['folha12', 'fixos12'],
  ['caixa0', 'capitalSocial', 'vidaUtilMeses'],
  [], ['sazonalidade'],
]

interface Props { r: Rascunho; set: SetFn; erros: string[]; passo: number; setPasso: (n: number) => void }

export function Premissas({ r, set, erros, passo, setPasso }: Props) {
  const { salvo, salvarAgora } = useCampo()
  const eObrigatorio = (path: Path) => OBRIGATORIOS.some((o) => o.join('.') === path.join('.'))
  const preenchido = (v: unknown) => v !== undefined && v !== null && v !== ''
  const statusDe = (path: Path): StatusCampo => {
    const v = getIn(r, path)
    if (!preenchido(v)) return eObrigatorio(path) ? 'vazio' : 'opcional'
    if (r.alimentacao?.campos[path.join('.')] === v) return 'importado'
    if (!salvo) return 'pendente'
    return getIn(salvo, path) === v ? 'salvo' : 'pendente'
  }
  const lacunas = r.alimentacao?.lacunas.filter((l) => l.nivel === 'bloqueante') ?? []
  const totalObrig = OBRIGATORIOS.length
  const feitos = OBRIGATORIOS.filter((o) => preenchido(getIn(r, o))).length
  const pendente = (i: number) => CHAVES_PASSO[i].some((k) => erros.some((e) => e.includes(k) || e.includes(ROTULOS[`historico.${k}`] ?? '§') || e.includes(ROTULOS[`abertura.${k}`] ?? '§') || e.includes(ROTULOS[`projecao.${k}`] ?? '§')))
  const num = (path: Path, label: string, o: { unit?: 'R$' | '%' | 'dias' | 'meses'; help?: string; wide?: boolean; mensal?: boolean } = {}) => {
    const v12 = getIn(r, path) as number | undefined
    const dica = o.mensal && v12 ? `Equivale a ${formatarBRL(v12 / 12, 0)} por mês.${o.help ? ` ${o.help}` : ''}` : o.help
    return (
    <Field label={label} help={dica} wide={o.wide}>
      <NumInput
        value={getIn(r, path) as number | undefined}
        onChange={(v) => set(path, v)}
        status={statusDe(path)}
        onCommit={salvarAgora}
        prefix={o.unit === 'R$' ? 'R$' : undefined}
        suffix={o.unit === '%' ? '%' : o.unit === 'dias' ? 'dias' : o.unit === 'meses' ? 'meses' : undefined}
      />
    </Field>
    )
  }
  const somaMix = (r.historico.pctVista ?? 0) + (r.historico.pctPrazo ?? 0) + (r.historico.pctCartao ?? 0)
  const mixOk = Math.abs(somaMix - 100) <= 0.01
  const simplesOuMei = r.empresa.regime === 'simples' || r.empresa.regime === 'mei'

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-1.5">
        {PASSOS.map((p, i) => (
          <li key={p}>
            <button
              onClick={() => setPasso(i)}
              aria-current={i === passo ? 'step' : undefined}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1 text-sm ${i === passo ? 'bg-brand text-white' : 'border border-line bg-card text-ink-soft hover:bg-paper'}`}
            >
              {i + 1}. {p}
              {pendente(i) ? <span className={`rounded-full px-1.5 text-xs font-semibold ${i === passo ? 'bg-white/25' : 'bg-warn-soft text-warn'}`} title="Há campos obrigatórios pendentes neste passo">!</span>
                : CHAVES_PASSO[i].length > 0 ? <span className={i === passo ? '' : 'text-ok'} aria-label="passo completo">✓</span> : null}
            </button>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-card px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">Obrigatórios: {feitos}/{totalObrig}</span>
          <div className="h-2 w-28 overflow-hidden rounded bg-paper" role="progressbar" aria-valuemin={0} aria-valuemax={totalObrig} aria-valuenow={feitos}>
            <div className={`h-full ${feitos === totalObrig ? 'bg-ok' : 'bg-warn'}`} style={{ width: `${(feitos / totalObrig) * 100}%` }} />
          </div>
        </div>
        <span className="text-ink-soft">Cada campo é salvo sozinho — pode preencher aos poucos.</span>
        <span className="ml-auto flex items-center gap-3 text-xs">
          <span className="text-bad">! em aberto</span><span className="text-warn">● não salvo</span><span className="text-ok">✓ salvo</span><span className="text-brand-dark">↓ importado</span>
        </span>
      </div>

      {lacunas.length > 0 && (
        <div className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-2 text-sm">
          <span className="font-medium text-warn">{lacunas.length} campo(s) sem fonte no realizado</span>
          <span className="text-ink-soft"> — preencha à mão ou lance no painel Realizado: </span>
          <span className="text-ink">{lacunas.map((l) => ROTULOS[l.campo] ?? l.campo).join(' · ')}</span>
        </div>
      )}

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {passo === 0 && (
            <>
              {num(['historico', 'rb12'], 'Faturamento bruto dos últimos 12 meses', { unit: 'R$', mensal: true, help: 'Total vendido antes de descontos e impostos.' })}
              <div />
              {num(['historico', 'pctVista'], '% das vendas à vista', { unit: '%', help: 'Pix, dinheiro e débito.' })}
              {num(['historico', 'pctPrazo'], '% das vendas a prazo', { unit: '%', help: 'Boleto, crediário.' })}
              {num(['historico', 'pctCartao'], '% das vendas no cartão de crédito', { unit: '%' })}
              <div className={`self-end rounded-md px-3 py-2 text-sm ${mixOk ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>
                Soma dos canais: <b className="num">{somaMix.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</b> {mixOk ? '✓' : '— precisa fechar em 100%'}
              </div>
              {num(['historico', 'descVista'], 'Desconto médio nas vendas à vista', { unit: '%' })}
              {num(['historico', 'prazoRecebDias'], 'Prazo médio de recebimento (vendas a prazo)', { unit: 'dias' })}
              {num(['historico', 'prazoCartaoDias'], 'Prazo de recebimento do cartão', { unit: 'dias', help: 'Sem antecipação. Padrão: 30 dias.' })}
              {num(['historico', 'taxaCartao'], 'Taxa média do cartão', { unit: '%' })}
              {num(['historico', 'pctAntecipado'], '% dos recebíveis antecipados', { unit: '%', help: 'Parcela do que é vendido a prazo/cartão e recebido antes.' })}
              {num(['historico', 'taxaAntecipacao'], 'Taxa de antecipação', { unit: '%', help: 'Ao mês.' })}
              {num(['historico', 'pctInadimplencia'], 'Inadimplência sobre vendas a prazo', { unit: '%' })}
            </>
          )}
          {passo === 1 && (
            <>
              {num(['historico', 'pctComissao'], 'Comissão média sobre vendas', { unit: '%' })}
              {num(['historico', 'compras12'], 'Compras de mercadoria/insumos (12 meses)', { unit: 'R$', mensal: true })}
              {num(['historico', 'prazoPagFornecDias'], 'Prazo médio de pagamento a fornecedores', { unit: 'dias' })}
              {num(['historico', 'frete12'], 'Logística/frete (12 meses)', { unit: 'R$', mensal: true })}
              {num(['historico', 'impVendas12'], r.empresa.regime === 'simples' ? 'DAS pago (12 meses)' : 'Impostos sobre vendas (12 meses)', { unit: 'R$', help: 'A alíquota efetiva é calculada sobre o faturamento após descontos.' })}
              {num(['historico', 'irCsll12'], 'IR/CSLL pagos (12 meses)', { unit: 'R$', help: simplesOuMei ? 'No Simples/MEI o IR já está no DAS — deixe zero para não contar duas vezes.' : 'Mantido fixo mês a mês (modo informado).' })}
              {r.empresa.regime === 'mei' && num(['historico', 'dasMei_m'], 'DAS mensal do MEI', { unit: 'R$' })}
            </>
          )}
          {passo === 2 && (
            <>
              {num(['historico', 'folha12'], 'Folha completa com encargos (12 meses)', { unit: 'R$', mensal: true })}
              {num(['historico', 'temporarios12'], 'Mão de obra temporária (12 meses)', { unit: 'R$', mensal: true })}
              {num(['historico', 'proLabore12'], 'Pró-labore dos sócios (12 meses)', { unit: 'R$', mensal: true, help: 'É despesa. Não confunda com distribuição de lucros.' })}
              {num(['historico', 'fixos12'], 'Demais gastos fixos (12 meses)', { unit: 'R$', mensal: true, help: 'Aluguel, energia, sistemas, contabilidade…' })}
              {num(['historico', 'marketing12'], 'Marketing e mídia (12 meses)', { unit: 'R$', mensal: true })}
              {num(['historico', 'distribuicao12'], 'Distribuição de lucros aos sócios (12 meses)', { unit: 'R$', mensal: true, help: 'Fica na DRE abaixo do lucro; os indicadores usam o lucro antes dela.' })}
            </>
          )}
          {passo === 3 && (
            <>
              {num(['abertura', 'caixa0'], 'Saldo em contas correntes', { unit: 'R$' })}
              {num(['abertura', 'capitalSocial'], 'Capital social integralizado', { unit: 'R$' })}
              {num(['abertura', 'aplicacoes0'], 'Aplicações financeiras', { unit: 'R$' })}
              <Field label="Rendimento das aplicações">
                <div className="flex gap-2">
                  <NumInput value={r.abertura.taxaAplicacao} onChange={(v) => set(['abertura', 'taxaAplicacao'], v)} suffix="%" className="flex-1" />
                  <Select value={r.abertura.unidadeTaxaAplicacao ?? 'am'} onChange={(v) => set(['abertura', 'unidadeTaxaAplicacao'], v)} options={[{ value: 'am', label: 'a.m.' }, { value: 'aa', label: 'a.a.' }]} />
                </div>
              </Field>
              {num(['abertura', 'cr0'], 'Contas a receber (saldo)', { unit: 'R$', help: 'Se vazio, é estimado a partir do faturamento e dos prazos.' })}
              {num(['abertura', 'estoque0'], 'Estoque (a custo)', { unit: 'R$' })}
              {num(['abertura', 'imobilizado0'], 'Máquinas, móveis, veículos e equipamentos', { unit: 'R$', help: 'Valor atual estimado (gerencial).' })}
              {num(['abertura', 'vidaUtilMeses'], 'Vida útil restante do imobilizado', { unit: 'meses' })}
              {num(['abertura', 'imoveis0'], 'Imóveis da empresa', { unit: 'R$' })}
              {num(['abertura', 'pctEdificacao'], '% do imóvel que é edificação', { unit: '%', help: 'Terreno não deprecia.' })}
              {num(['abertura', 'intangivel0'], 'Intangível (software, marcas, fundo de comércio)', { unit: 'R$' })}
              {num(['abertura', 'vidaUtilIntangivelMeses'], 'Prazo de amortização do intangível', { unit: 'meses', help: '0 = não amortiza.' })}
              <Field label="Juros de saldo negativo (cheque especial)">
                <div className="flex gap-2">
                  <NumInput value={r.abertura.taxaChequeEspecial} onChange={(v) => set(['abertura', 'taxaChequeEspecial'], v)} suffix="%" className="flex-1" />
                  <Select value={r.abertura.unidadeTaxaChequeEspecial ?? 'am'} onChange={(v) => set(['abertura', 'unidadeTaxaChequeEspecial'], v)} options={[{ value: 'am', label: 'a.m.' }, { value: 'aa', label: 'a.a.' }]} />
                </div>
              </Field>
              <p className="rounded-md bg-brand-soft px-3 py-2 text-sm text-brand-dark sm:col-span-2">
                O patrimônio líquido de abertura é estimado pelo balanço: ativos − passivos − capital social. Ele é o único fechamento do modelo.
              </p>
            </>
          )}
          {passo === 4 && (
            <div className="space-y-6 sm:col-span-2">
              <Dividas r={r} set={set} />
              <Contingencias r={r} set={set} />
            </div>
          )}
          {passo === 5 && (
            <>
              <Field label="Data-base do balanço de abertura">
                <input type="date" value={r.dataBase} onChange={(e) => set(['dataBase'], e.target.value)} className="rounded-md border border-line bg-white px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Horizonte (meses)">
                <Select value={String(r.horizonte)} onChange={(v) => set(['horizonte'], Number(v))} options={[6, 12, 18, 24, 36].map((n) => ({ value: String(n), label: `${n} meses` }))} />
              </Field>
              {num(['projecao', 'crescimentoReceita'], 'Crescimento da receita', { unit: '%', help: 'Ao mês, composto.' })}
              {num(['projecao', 'inflacaoCustos'], 'Reajuste dos gastos fixos', { unit: '%', help: 'Ao ano, aplicado de forma composta mês a mês.' })}
              <Field label="Marketing">
                <Select value={r.projecao.marketingModo ?? 'valor'} onChange={(v) => set(['projecao', 'marketingModo'], v)}
                  options={[{ value: 'valor', label: 'Valor fixo (média dos últimos 12 meses)' }, { value: 'pctRB', label: '% da receita bruta' }]} />
              </Field>
              <Sazonalidade r={r} set={set} />
              <div className="sm:col-span-2"><Eventos r={r} set={set} /></div>
            </>
          )}
        </div>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => setPasso(Math.max(0, passo - 1))} disabled={passo === 0}>← Anterior</Button>
        <Button onClick={() => setPasso(Math.min(PASSOS.length - 1, passo + 1))} disabled={passo === PASSOS.length - 1}>Próximo →</Button>
      </div>
    </div>
  )
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function Sazonalidade({ r, set }: { r: Rascunho; set: SetFn }) {
  const s = r.projecao.sazonalidade ?? Array(12).fill(1)
  const media = s.reduce((a, b) => a + (b ?? 0), 0) / 12
  const ok = Math.abs(media - 1) <= 0.001
  return (
    <div className="sm:col-span-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">Sazonalidade por mês do calendário</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${ok ? 'text-ok' : 'text-bad'}`}>média {media.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {ok ? '✓' : '(precisa ser 1)'}</span>
          <Button variant="soft" onClick={() => set(['projecao', 'sazonalidade'], normalizarSazonalidade(s.map((x) => x || 0)))}>Normalizar</Button>
          <Button variant="ghost" onClick={() => set(['projecao', 'sazonalidade'], Array(12).fill(1))}>Zerar</Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
        {MESES.map((m, i) => (
          <div key={m}>
            <div className="text-center text-xs text-ink-soft">{m}</div>
            <NumInput value={s[i]} onChange={(v) => set(['projecao', 'sazonalidade', i], v ?? 0)} />
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-soft">1,00 = mês médio. Ex.: 1,15 = mês 15% acima da média. A média dos 12 meses deve ser 1.</p>
    </div>
  )
}

function Dividas({ r, set }: { r: Rascunho; set: SetFn }) {
  const lista = r.abertura.dividas
  const novo = (): DividaForm => ({ tipo: 'bancaria', descricao: '', saldo: 0, taxa: 0, unidadeTaxa: 'am', prazoMeses: 12, sistema: 'price', carenciaMeses: 0, mesInicio: 0, parcelada: true })
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">Dívidas</h3>
        <Button variant="soft" onClick={() => set(['abertura', 'dividas'], [...lista, novo()])}>+ Adicionar dívida</Button>
      </div>
      {lista.length === 0 && <p className="text-sm text-ink-soft">Nenhuma dívida. Adicione empréstimos, financiamentos ou parcelamentos de impostos.</p>}
      <div className="space-y-3">
        {lista.map((d, i) => {
          const p = (k: keyof DividaForm) => ['abertura', 'dividas', i, k]
          return (
            <div key={i} className="rounded-md border border-line p-3">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Tipo"><Select value={d.tipo} onChange={(v) => { set(p('tipo'), v); if (v === 'tributaria') set(p('sistema'), 'sac') }} options={[{ value: 'bancaria', label: 'Bancária' }, { value: 'tributaria', label: 'Tributária' }]} /></Field>
                <Field label="Descrição" wide><TextInput className="w-full" value={d.descricao ?? ''} onChange={(v) => set(p('descricao'), v)} /></Field>
                <Field label="Saldo devedor"><NumInput value={d.saldo} onChange={(v) => set(p('saldo'), v ?? 0)} prefix="R$" /></Field>
                <Field label="Taxa">
                  <div className="flex gap-1"><NumInput value={d.taxa} onChange={(v) => set(p('taxa'), v ?? 0)} suffix="%" className="flex-1" />
                    <Select value={d.unidadeTaxa} onChange={(v) => set(p('unidadeTaxa'), v)} options={[{ value: 'am', label: 'a.m.' }, { value: 'aa', label: 'a.a.' }]} /></div>
                </Field>
                <Field label="Prazo restante"><NumInput value={d.prazoMeses} onChange={(v) => set(p('prazoMeses'), Math.max(1, Math.round(v ?? 1)))} suffix="meses" /></Field>
                <Field label="Sistema"><Select value={d.sistema ?? 'price'} onChange={(v) => set(p('sistema'), v)} options={[{ value: 'price', label: 'Price (parcela fixa)' }, { value: 'sac', label: 'SAC (amortização fixa)' }, { value: 'bullet', label: 'Bullet (principal no fim)' }]} /></Field>
                <Field label="Carência (só juros)"><NumInput value={d.carenciaMeses} onChange={(v) => set(p('carenciaMeses'), Math.max(0, Math.round(v ?? 0)))} suffix="meses" /></Field>
                <Field label="Entra no mês" help="0 = já existe; >0 = captação planejada."><NumInput value={d.mesInicio} onChange={(v) => set(p('mesInicio'), Math.max(0, Math.round(v ?? 0)))} /></Field>
                {d.tipo === 'tributaria' && (
                  <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
                    <input type="checkbox" checked={d.parcelada ?? true} onChange={(e) => set(p('parcelada'), e.target.checked)} />
                    Parcelada (desmarcado: acumula Selic e fica 100% no curto prazo)
                  </label>
                )}
              </div>
              <div className="mt-2 text-right"><Button variant="danger" onClick={() => set(['abertura', 'dividas'], lista.filter((_, j) => j !== i))}>Remover</Button></div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Contingencias({ r, set }: { r: Rascunho; set: SetFn }) {
  const lista = r.abertura.contingencias
  const novo = (): ContingenciaForm => ({ natureza: 'trabalhista', polo: 'passivo', valor: 0, probabilidade: 'provavel' })
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">Contingências (processos)</h3>
        <Button variant="soft" onClick={() => set(['abertura', 'contingencias'], [...lista, novo()])}>+ Adicionar processo</Button>
      </div>
      <p className="mb-2 text-xs text-ink-soft">Só passivos <b>prováveis</b> viram provisão no balanço; possíveis e ativos a receber aparecem apenas em nota (CPC 25).</p>
      <div className="space-y-2">
        {lista.map((c, i) => {
          const p = (k: keyof ContingenciaForm) => ['abertura', 'contingencias', i, k]
          return (
            <div key={i} className="grid items-end gap-2 rounded-md border border-line p-3 sm:grid-cols-6">
              <Field label="Natureza"><Select value={c.natureza} onChange={(v) => set(p('natureza'), v)} options={[{ value: 'trabalhista', label: 'Trabalhista' }, { value: 'civel', label: 'Cível' }, { value: 'tributaria', label: 'Tributária' }]} /></Field>
              <Field label="Polo"><Select value={c.polo} onChange={(v) => set(p('polo'), v)} options={[{ value: 'passivo', label: 'Contra a empresa' }, { value: 'ativo', label: 'A favor' }]} /></Field>
              <Field label="Valor"><NumInput value={c.valor} onChange={(v) => set(p('valor'), v ?? 0)} prefix="R$" /></Field>
              <Field label="Probabilidade"><Select value={c.probabilidade} onChange={(v) => set(p('probabilidade'), v)} options={[{ value: 'provavel', label: 'Provável' }, { value: 'possivel', label: 'Possível' }, { value: 'remota', label: 'Remota' }]} /></Field>
              <Field label="Mês do desfecho"><NumInput value={c.mesDesfecho} onChange={(v) => set(p('mesDesfecho'), v === undefined ? undefined : Math.max(1, Math.round(v)))} /></Field>
              <Button variant="danger" onClick={() => set(['abertura', 'contingencias'], lista.filter((_, j) => j !== i))}>Remover</Button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Eventos({ r, set }: { r: Rascunho; set: SetFn }) {
  const lista = r.projecao.eventos
  const [tipo, setTipo] = useState<EventoForm['tipo']>('capex')
  const add = () => {
    const ev: EventoForm =
      tipo === 'capex' ? { tipo, mes: 1, valor: 0, vidaUtilMeses: 60 }
        : tipo === 'aporte' ? { tipo, mes: 1, valor: 0 }
          : tipo === 'contratacao' ? { tipo, mes: 1, custoMensalComEncargos: 0 }
            : { tipo, mes: 1, pct: 0 }
    set(['projecao', 'eventos'], [...lista, ev])
  }
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Eventos planejados</h3>
        <div className="flex gap-2">
          <Select value={tipo} onChange={setTipo} options={[
            { value: 'capex', label: 'Investimento (capex)' }, { value: 'aporte', label: 'Aporte de capital' },
            { value: 'contratacao', label: 'Contratação' }, { value: 'reajusteFolha', label: 'Reajuste da folha' },
          ]} />
          <Button variant="soft" onClick={add}>+ Adicionar</Button>
        </div>
      </div>
      {lista.length === 0 && <p className="text-sm text-ink-soft">Nenhum evento. Use para investimentos, aportes, novas contratações e reajustes.</p>}
      <div className="space-y-2">
        {lista.map((ev, i) => {
          const p = (k: string) => ['projecao', 'eventos', i, k]
          const titulo = { capex: 'Investimento (capex)', aporte: 'Aporte de capital', contratacao: 'Contratação', reajusteFolha: 'Reajuste da folha' }[ev.tipo]
          return (
            <div key={i} className="grid items-end gap-2 rounded-md border border-line p-3 sm:grid-cols-5">
              <div className="text-sm font-medium">{titulo}</div>
              <Field label="No mês"><NumInput value={ev.mes} onChange={(v) => set(p('mes'), Math.max(1, Math.round(v ?? 1)))} /></Field>
              {ev.tipo === 'capex' && <><Field label="Valor"><NumInput value={ev.valor} onChange={(v) => set(p('valor'), v ?? 0)} prefix="R$" /></Field>
                <Field label="Vida útil"><NumInput value={ev.vidaUtilMeses} onChange={(v) => set(p('vidaUtilMeses'), Math.max(1, v ?? 1))} suffix="meses" /></Field></>}
              {ev.tipo === 'aporte' && <Field label="Valor"><NumInput value={ev.valor} onChange={(v) => set(p('valor'), v ?? 0)} prefix="R$" /></Field>}
              {ev.tipo === 'contratacao' && <Field label="Custo mensal com encargos"><NumInput value={ev.custoMensalComEncargos} onChange={(v) => set(p('custoMensalComEncargos'), v ?? 0)} prefix="R$" /></Field>}
              {ev.tipo === 'reajusteFolha' && <Field label="Reajuste"><NumInput value={ev.pct} onChange={(v) => set(p('pct'), v ?? 0)} suffix="%" /></Field>}
              <Button variant="danger" onClick={() => set(['projecao', 'eventos'], lista.filter((_, j) => j !== i))}>Remover</Button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
