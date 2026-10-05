'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ModeloCustos as Modelo } from '@/lib/db/repo'
import { Badge, Button, Card, Field, NumInput } from '../ui'

type Campos = Omit<Modelo, 'empresaId'>
type Grupo = { titulo: string; ajuda: string; itens: { chave: keyof Campos; rotulo: string; sufixo?: string; prefixo?: string; ajuda?: string; opcional?: boolean }[] }

const GRUPOS: Grupo[] = [
  {
    titulo: 'Taxa da maquininha (MDR)',
    ajuda: 'Nenhum sistema registra a taxa. Vira a linha "Taxas de cartão" de cada mês, marcada como estimada. Use as taxas do contrato com a adquirente.',
    itens: [
      { chave: 'taxaDebito', rotulo: 'Débito', sufixo: '%' }, { chave: 'taxaCredito', rotulo: 'Crédito', sufixo: '%' },
      { chave: 'taxaPix', rotulo: 'Pix', sufixo: '%' }, { chave: 'taxaVoucher', rotulo: 'Voucher', sufixo: '%' },
    ],
  },
  {
    titulo: 'Impostos e encargos',
    ajuda: 'Alíquota efetiva sobre a receita bruta (Simples: depende da receita dos últimos 12 meses do CNPJ, que o Playground e o Circuito do Parque dividem). Encargos sobre a folha CLT quando o contador não enviou o documento.',
    itens: [
      { chave: 'aliquotaImpostos', rotulo: 'Impostos sobre a receita', sufixo: '%', opcional: true },
      { chave: 'pctEncargos', rotulo: 'Encargos sobre a folha', sufixo: '%', opcional: true },
    ],
  },
  {
    titulo: 'Aluguel do shopping',
    ajuda: 'Aluguel = maior entre o mínimo e o % do faturamento, mais condomínio e fundo de promoção. Preencha só o que existir; vazio = não estimar.',
    itens: [
      { chave: 'aluguelMinimo', rotulo: 'Aluguel mínimo', prefixo: 'R$', opcional: true },
      { chave: 'aluguelPctReceita', rotulo: '% do faturamento', sufixo: '%', opcional: true },
      { chave: 'condominio', rotulo: 'Condomínio', prefixo: 'R$', opcional: true },
      { chave: 'fundoPromocao', rotulo: 'Fundo de promoção', prefixo: 'R$', opcional: true },
    ],
  },
  {
    titulo: 'Outros gastos fixos mensais',
    ajuda: 'Valor fixo por mês, repetido em todos os meses ainda sem dado real.',
    itens: [
      { chave: 'manutencao', rotulo: 'Manutenção', prefixo: 'R$', opcional: true },
      { chave: 'marketing', rotulo: 'Marketing', prefixo: 'R$', opcional: true },
      { chave: 'fixosOutros', rotulo: 'Outros fixos', prefixo: 'R$', opcional: true },
    ],
  },
]

/** Modelo de custos da empresa: alimenta as linhas "estimado" do Realizado. */
export function ModeloCustos({ empresaId, modelo }: { empresaId: string; modelo: Modelo | null }) {
  const router = useRouter()
  const { empresaId: _ignorar, ...inicial } = modelo ?? ({} as Modelo)
  void _ignorar
  const [v, setV] = useState<Partial<Campos>>(modelo ? inicial : { taxaDebito: 1, taxaCredito: 3, taxaPix: 0, taxaVoucher: 0 })
  const [msg, setMsg] = useState<{ tom: 'ok' | 'bad'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function salvar() {
    setOcupado(true); setMsg(null)
    const body = Object.fromEntries(GRUPOS.flatMap((g) => g.itens).map((i) => [i.chave, v[i.chave] ?? (i.opcional ? null : 0)]))
    const res = await fetch(`/api/empresas/${empresaId}/modelo-custos`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setOcupado(false); setMsg({ tom: 'bad', texto: (j.erros ?? [j.erro ?? `Falha (${res.status})`]).join('; ') }); return }
    // refaz o mês aberto para as estimativas já refletirem o modelo novo
    const sinc = await fetch(`/api/empresas/${empresaId}/sincronizar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    setOcupado(false)
    setMsg(sinc.ok ? { tom: 'ok', texto: 'Modelo salvo e meses abertos recalculados.' } : { tom: 'ok', texto: 'Modelo salvo. Rode "Atualizar" para recalcular os meses.' })
    router.refresh()
  }

  return (
    <Card className="p-4">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold">
          Modelo de custos <Badge tone="info">estimativas</Badge>
          {!modelo && <Badge tone="warn">ainda não configurado</Badge>}
        </summary>
        <p className="mt-2 text-xs text-ink-soft">
          O que nenhum sistema registra é calculado todo mês por este modelo e aparece como <b>estimado</b>. Dado real (do sistema, do contador ou digitado) sempre vence a estimativa; meses fechados não mudam.
        </p>
        <div className="mt-3 space-y-4">
          {GRUPOS.map((g) => (
            <div key={g.titulo}>
              <div className="text-sm font-medium">{g.titulo}</div>
              <p className="mb-2 text-xs text-ink-soft">{g.ajuda}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {g.itens.map((i) => (
                  <Field key={i.chave} label={i.rotulo}>
                    <NumInput value={v[i.chave] ?? undefined} prefix={i.prefixo} suffix={i.sufixo} placeholder={i.opcional ? 'não estimar' : undefined}
                      onChange={(x) => setV((p) => ({ ...p, [i.chave]: x ?? null }))} />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={salvar} disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar modelo'}</Button>
          {msg && <Badge tone={msg.tom}>{msg.texto}</Badge>}
        </div>
      </details>
    </Card>
  )
}
