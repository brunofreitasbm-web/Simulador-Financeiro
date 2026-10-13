#!/usr/bin/env node
/**
 * Publica o fechamento mensal do PDV FaçaAmigos em `fechamento/AAAA-MM.json`.
 *
 * A extração é a MESMA que o Simulador usa ao vivo: a RPC `sim_extrair_pdv`, que já separa as
 * unidades por `unit_id` e devolve `{ valores, campos, unidade }`. Assim não existe segunda
 * implementação das regras do PDV para divergir.
 *
 * Secrets (Settings → Secrets and variables → Actions):
 *   PDV_SUPABASE_URL                URL do projeto Supabase do PDV
 *   PDV_SUPABASE_SERVICE_ROLE_KEY   service_role do projeto do PDV (a RPC é restrita a ele)
 *
 * Uso: node scripts/fechamento/gerar.mjs [--competencia=AAAA-MM]
 */
import { competencia, competenciasAlvo, escreverFechamento, exigir, rpc, selecionar, unidadeDeExtracao } from './lib.mjs'

const REPO = 'brunofreitasbm-web/faca_amigos'
const SISTEMA = 'pdv'

async function main() {
  const { PDV_SUPABASE_URL: url, PDV_SUPABASE_SERVICE_ROLE_KEY: chave } = exigir(['PDV_SUPABASE_URL', 'PDV_SUPABASE_SERVICE_ROLE_KEY'])
  const raiz = process.cwd()

  const unidades = await selecionar(url, chave, 'fa_kiosk_units', 'select=id,name&order=name')
  if (unidades.length === 0) throw new Error('nenhuma unidade em fa_kiosk_units')
  console.log(`PDV: ${unidades.length} unidade(s) — ${unidades.map((u) => u.name ?? u.id).join(', ')}`)

  for (const { comp, parcial } of competenciasAlvo()) {
    const saida = []
    for (const u of unidades) {
      const ext = await rpc(url, chave, 'sim_extrair_pdv', { p_unit_id: u.id, p_competencia: `${comp}-01` })
      // A RPC devolve `unidade` (nome) junto; o rótulo ajuda a conferir o arquivo a olho.
      const unidade = unidadeDeExtracao(u.id, ext?.unidade ?? u.name ?? undefined, ext)
      unidade.detalhes = { ...(unidade.detalhes ?? {}), pdv_unidade: u.name ?? null, parcial }
      saida.push(unidade)
    }
    const caminho = await escreverFechamento(raiz, { sistema: SISTEMA, repo: REPO, competencia: comp, unidades: saida, parcial })
    const n = saida.reduce((s, u) => s + Object.values(u.valores).filter((v) => v !== null).length, 0)
    console.log(`${comp}${parcial ? ' (parcial)' : ''} → ${caminho} · ${n} campo(s) com valor`)
  }
}

main().catch((e) => { console.error(`falhou: ${e.message}`); process.exit(1) })
