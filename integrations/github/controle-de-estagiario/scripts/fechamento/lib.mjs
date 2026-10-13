/**
 * Publicação do fechamento mensal — biblioteca compartilhada pelos repositórios-fonte.
 *
 * Copie esta pasta para `scripts/fechamento/` do repositório. O gerador (`gerar.mjs`) só descreve
 * o que o sistema sabe; aqui ficam o contrato, o esqueleto e a escrita do arquivo.
 *
 * Sem dependências: usa `fetch` (Node 20+) para falar com o PostgREST do Supabase.
 *
 * Contrato: ver `integrations/README.md` e `packages/engine/src/fechamento.ts`.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const SCHEMA = 'sf.fechamento/1'

/** Colunas de sim_realizado_mensal, na ordem do catálogo. Mantenha igual a packages/engine/src/realizado.ts. */
export const COLUNAS = [
  'receita_bruta', 'receita_servicos', 'receita_produtos', 'descontos', 'cancelamentos', 'qtd_pedidos',
  'receita_dinheiro', 'receita_pix', 'receita_debito', 'receita_credito', 'receita_voucher', 'receita_prazo',
  'inadimplencia', 'glosas',
  'compras', 'frete', 'comissoes', 'impostos_vendas', 'ir_csll',
  'folha', 'encargos', 'temporarios', 'pro_labore', 'repasses_terapeutas',
  'aluguel', 'manutencao', 'fixos_outros', 'marketing', 'distribuicao',
  'caixa_final', 'contas_receber', 'contas_pagar', 'estoque', 'passivo_prepago', 'quebra_caixa',
]

export const r2 = (x) => Math.round(x * 100) / 100

/** 'YYYY-MM' de hoje deslocado `delta` meses, no fuso de Belém (UTC−3). */
export function competencia(delta = 0, tzHoras = -3) {
  const agora = new Date(Date.now() + tzHoras * 3600 * 1000)
  const idx = agora.getUTCFullYear() * 12 + agora.getUTCMonth() + delta
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

/**
 * Esqueleto com todas as colunas marcadas como `sem_fonte`. Use como base e sobrescreva:
 *   const { valores, campos } = esqueleto('o PDV não registra este dado')
 *   valores.receita_bruta = 1234.56
 *   campos.receita_bruta = { status: 'ok', obs: 'pedidos pagos no mês' }
 * Declarar explicitamente é melhor que omitir: o Simulador distingue "não tem a fonte" de
 * "a fonte tem, mas o mês veio vazio".
 */
export function esqueleto(motivo) {
  const valores = {}
  const campos = {}
  for (const c of COLUNAS) { valores[c] = null; campos[c] = { status: 'sem_fonte', obs: motivo } }
  return { valores, campos }
}

/** Chamada RPC ao PostgREST do Supabase (service_role). Zero dependências. */
export async function rpc(url, chave, fn, params) {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const texto = await res.text()
  if (!res.ok) throw new Error(`rpc ${fn} (${res.status}): ${texto.slice(0, 400)}`)
  try { return JSON.parse(texto) } catch { throw new Error(`rpc ${fn}: resposta não é JSON`) }
}

/** SELECT no PostgREST. `query` no formato da query string, ex.: 'select=id,name&order=name'. */
export async function selecionar(url, chave, tabela, query = 'select=*') {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${tabela}?${query}`, {
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, Accept: 'application/json' },
  })
  const texto = await res.text()
  if (!res.ok) throw new Error(`select ${tabela} (${res.status}): ${texto.slice(0, 400)}`)
  return JSON.parse(texto)
}

/** Normaliza o retorno de uma RPC `{ valores, campos, detalhes }` na unidade do artefato. */
export function unidadeDeExtracao(chave, rotulo, extracao) {
  const valores = {}
  const campos = {}
  for (const c of COLUNAS) {
    if (!(c in (extracao?.valores ?? {}))) continue
    const v = extracao.valores[c]
    valores[c] = v === null || v === undefined ? null : Number(v)
    const meta = extracao?.campos?.[c]
    campos[c] = { status: meta?.status ?? 'ok', obs: meta?.obs ?? null }
  }
  return { chave, rotulo, valores, campos, detalhes: extracao?.detalhes ?? undefined }
}

/** Grava `fechamento/AAAA-MM.json` na raiz do repositório e devolve o caminho. */
export async function escreverFechamento(raiz, { sistema, repo, competencia: comp, unidades, parcial }) {
  const conteudo = {
    schema: SCHEMA,
    competencia: comp,
    gerado_em: new Date().toISOString(),
    sistema,
    repo,
    parcial: parcial === true,
    unidades,
  }
  const caminho = join(raiz, 'fechamento', `${comp}.json`)
  await mkdir(dirname(caminho), { recursive: true })
  await writeFile(caminho, `${JSON.stringify(conteudo, null, 2)}\n`, 'utf8')
  return caminho
}

/** Lê variáveis de ambiente obrigatórias, com mensagem clara para o log da Action. */
export function exigir(nomes) {
  const faltando = nomes.filter((n) => !process.env[n])
  if (faltando.length) throw new Error(`secrets ausentes: ${faltando.join(', ')}`)
  return Object.fromEntries(nomes.map((n) => [n, process.env[n]]))
}

/** Argumento `--competencia=AAAA-MM` (workflow_dispatch) ou a lista padrão [mês anterior, mês corrente]. */
export function competenciasAlvo(argv = process.argv.slice(2)) {
  const arg = argv.find((a) => a.startsWith('--competencia='))
  if (arg) {
    const c = arg.split('=')[1]
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(c)) throw new Error(`--competencia inválida: ${c}`)
    return [{ comp: c, parcial: false }]
  }
  return [{ comp: competencia(-1), parcial: false }, { comp: competencia(0), parcial: true }]
}
