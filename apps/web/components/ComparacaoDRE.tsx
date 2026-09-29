import { REGISTRY, type DREKey, type Resultado } from '@sf/engine'
import { formatar } from './Tabela'

const LINHAS: [DREKey, boolean][] = [
  ['rb', true], ['descontos', false], ['impostos', false], ['rl', true], ['cmv', false], ['comissoes', false], ['taxaCartao', false],
  ['frete', false], ['perdas', false], ['mc', true], ['pessoal', false], ['gastosFixos', false], ['marketing', false], ['ebitda', true],
  ['depreciacao', false], ['despFinanceiras', false], ['recFinanceiras', false], ['irCsll', false], ['ll', true], ['distribuicao', false], ['resultadoApos', true],
]

/** DRE anual dos cenários lado a lado, em R$ e em % da receita bruta (análise vertical). Sem hooks: serve ao relatório. */
export function ComparacaoDRE({ cenarios }: { cenarios: { nome: string; r: Resultado }[] }) {
  const cols = cenarios.length
  const cab = (t: string) => (
    <thead>
      <tr className="border-b border-line bg-paper text-xs text-ink-soft">
        <th className="px-3 py-2 text-left font-medium">{t}</th>
        {cenarios.map((c) => <th key={c.nome} className="px-3 py-2 text-right font-medium">{c.nome}</th>)}
      </tr>
    </thead>
  )
  return (
    <div className="space-y-6">
      {(['brl', 'pct'] as const).map((modo) => (
        <div key={modo} className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="tabela num w-full border-collapse text-sm">
            {cab(modo === 'brl' ? 'DRE anual (R$)' : 'Análise vertical (% da receita bruta)')}
            <tbody>
              {LINHAS.map(([k, total]) => (
                <tr key={k} className={total ? 'linha-total font-semibold' : ''}>
                  <td className="text-left">{REGISTRY.dre[k].rotulo}</td>
                  {cenarios.map((c) => {
                    const v = c.r.anual.dre[k]
                    const base = c.r.anual.dre.rb
                    return (
                      <td key={c.nome} className={`text-right ${v < -0.005 ? 'text-bad' : ''}`}>
                        {modo === 'brl' ? formatar(v, 'brl') : formatar(base > 0 ? v / base : null, 'pct')}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <span className="sr-only">{cols} cenários comparados</span>
    </div>
  )
}
