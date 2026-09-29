'use client'
import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Select } from '../ui'

interface Conclusao { id: string; cenarioNome: string; modelo: string; texto: string; numerosValidados: boolean; criadoEm: string }

/** T12: conclusão por IA (Gemini) por cenário. */
export function ConclusaoIA({ id, cenarios, antes }: { id: string; cenarios: string[]; antes: () => Promise<void> }) {
  const [sel, setSel] = useState(0)
  const [lista, setLista] = useState<Conclusao[]>([])
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/simulacoes/${id}/conclusao`).then((r) => (r.ok ? r.json() : [])).then(setLista).catch(() => setLista([]))
  }, [id])

  const gerar = useCallback(async () => {
    setGerando(true); setErro(null)
    try {
      await antes()
      const res = await fetch(`/api/simulacoes/${id}/conclusao`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cenario: sel }) })
      const j = await res.json()
      if (!res.ok) setErro(j.erro ?? 'Não foi possível gerar a conclusão.')
      else setLista((l) => [j, ...l])
    } catch { setErro('Falha de conexão ao gerar a conclusão.') } finally { setGerando(false) }
  }, [id, sel, antes])

  const atual = lista.find((c) => c.cenarioNome === cenarios[sel])
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-soft">Cenário:</span>
        <Select value={String(sel)} onChange={(v) => setSel(Number(v))} options={cenarios.map((n, i) => ({ value: String(i), label: n }))} />
        <Button onClick={gerar} disabled={gerando}>{gerando ? 'Gerando…' : atual ? 'Gerar novamente' : 'Gerar conclusão'}</Button>
      </div>
      {erro && <p role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">{erro}</p>}
      {atual ? (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <Badge tone={atual.numerosValidados ? 'ok' : 'warn'}>{atual.numerosValidados ? '✓ Números conferidos' : 'Números não conferidos'}</Badge>
            <span>{atual.modelo} · {new Date(atual.criadoEm).toLocaleString('pt-BR')}</span>
          </div>
          {!atual.numerosValidados && (
            <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">Algum número deste texto não foi encontrado nos resultados da simulação. Confira antes de usar.</p>
          )}
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{atual.texto}</p>
        </Card>
      ) : (
        !gerando && <p className="text-sm text-ink-soft">Ainda não há conclusão para este cenário. O texto é gerado pela IA a partir dos resultados calculados, sem enviar o nome ou o CNPJ da empresa.</p>
      )}
    </div>
  )
}
