'use client'
import type { Resultado } from '@sf/engine'
import { formatarBRL } from '@sf/engine'
import { Badge, Button, Card, NumInput, TextInput } from '../ui'
import type { CenarioForm, Rascunho } from '@/lib/rascunho'
import type { SetFn } from './Premissas'

const ALAVANCAS: { k: string; rotulo: string; un: string; ajuda: string }[] = [
  { k: 'dReceita', rotulo: 'Variação da receita', un: '%', ajuda: 'Aplicada sobre a receita bruta de cada mês.' },
  { k: 'dVariaveis', rotulo: 'Variação dos custos variáveis', un: '%', ajuda: 'Multiplica as alíquotas (CMV, frete, comissão, cartão, impostos).' },
  { k: 'dFixos', rotulo: 'Variação dos gastos fixos', un: '%', ajuda: 'Não afeta a distribuição de lucros.' },
  { k: 'dDistribuicao', rotulo: 'Variação da distribuição', un: '%', ajuda: 'Separada dos gastos fixos.' },
  { k: 'dInadimplencia', rotulo: 'Variação da inadimplência', un: 'p.p.', ajuda: 'Pontos percentuais somados à taxa base.' },
  { k: 'dJuros', rotulo: 'Variação dos juros', un: '%', ajuda: 'Dívidas bancárias e cheque especial.' },
  { k: 'dPrazoReceb', rotulo: 'Dias a mais para receber', un: 'dias', ajuda: 'Negativo = recebe mais cedo.' },
  { k: 'dPrazoPag', rotulo: 'Dias a mais para pagar', un: 'dias', ajuda: 'Negativo = paga mais cedo.' },
]

export function Cenarios({ r, set, resultados }: { r: Rascunho; set: SetFn; resultados: (Resultado | null)[] }) {
  const add = () => {
    const c: CenarioForm = { id: `custom-${Date.now()}`, tipo: 'custom', nome: `Cenário ${r.cenarios.length + 1}`, alavancas: { ...r.cenarios[0].alavancas } }
    set(['cenarios'], [...r.cenarios, c])
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-soft">Cada cenário altera as premissas com 8 alavancas. O cenário <b>Atual</b> é a base e não pode ser editado.</p>
        <Button onClick={add}>+ Novo cenário</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {r.cenarios.map((c, ci) => {
          const res = resultados[ci]
          const travado = c.tipo === 'atual'
          return (
            <Card key={c.id} className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                {c.tipo === 'custom'
                  ? <TextInput className="flex-1 font-medium" value={c.nome} onChange={(v) => set(['cenarios', ci, 'nome'], v)} />
                  : <h3 className="font-semibold">{c.nome}</h3>}
                {travado ? <Badge>travado</Badge> : c.tipo === 'custom'
                  ? <Button variant="danger" onClick={() => set(['cenarios'], r.cenarios.filter((_, j) => j !== ci))}>Remover</Button> : <Badge tone="info">padrão</Badge>}
              </div>
              <label className="mb-3 block">
                <span className="text-xs text-ink-soft">Descrição do cenário (aparece no relatório)</span>
                <textarea
                  rows={2} value={c.descricao ?? ''} onChange={(e) => set(['cenarios', ci, 'descricao'], e.target.value)}
                  placeholder={{ atual: 'Manutenção da situação atual, sem mudanças.', pessimista: 'Queda nas vendas e/ou aumento dos custos.', otimista: 'Mais vendas, menos custos, mais investimentos.', custom: 'Descreva as premissas deste cenário.' }[c.tipo]}
                  className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </label>
              <div className="space-y-2">
                {ALAVANCAS.map((a) => (
                  <div key={a.k} className="flex items-center justify-between gap-2" title={a.ajuda}>
                    <span className="text-sm">{a.rotulo}</span>
                    <NumInput className="w-28" disabled={travado} suffix={a.un}
                      value={(c.alavancas as Record<string, number | undefined>)[a.k] ?? 0}
                      onChange={(v) => set(['cenarios', ci, 'alavancas', a.k], v ?? 0)} />
                  </div>
                ))}
              </div>
              {res && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-sm">
                  <div><div className="text-xs text-ink-soft">Lucro (12m)</div><div className="num font-medium">{formatarBRL(res.anual.dre.ll, 0)}</div></div>
                  <div><div className="text-xs text-ink-soft">Caixa final</div><div className={`num font-medium ${res.meses[res.meses.length - 1].bp.caixa < 0 ? 'text-bad' : ''}`}>{formatarBRL(res.meses[res.meses.length - 1].bp.caixa, 0)}</div></div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
