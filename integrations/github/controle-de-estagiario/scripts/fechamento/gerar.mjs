#!/usr/bin/env node
/**
 * Publica o fechamento mensal de folha/RH em `fechamento/AAAA-MM.json`.
 *
 * As consultas abaixo são o mesmo recorte que a Edge Function `sim-sincronizar` usa ao vivo
 * (`extrairRh`, no projeto do Simulador) — mesmas tabelas, mesmos filtros, mesma marcação de
 * status por campo. Não há RPC a instalar: o gerador fala direto com o PostgREST deste projeto.
 *
 * O documento de folha do contador manda. Sem ele, o valor cai para a soma dos salários-base e
 * bolsas ativos, marcado como `parcial` — e o Simulador sabe que um `parcial` de RH não deve
 * sobrescrever a folha que outra fonte já trouxe.
 *
 * Secrets (Settings → Secrets and variables → Actions):
 *   FECHAMENTO_SUPABASE_URL                URL do projeto Supabase deste sistema
 *   FECHAMENTO_SUPABASE_SERVICE_ROLE_KEY   service_role (leitura das tabelas de pessoal)
 *
 * Uso: node scripts/fechamento/gerar.mjs [--competencia=AAAA-MM]
 */
import {
  competenciasAlvo, consultar, escreverFechamento, exigir, esqueleto, janela, r2, selecionar, somaDe,
} from './lib.mjs'

const REPO = 'brunofreitasbm-web/controle-de-estagiario'
const SISTEMA = 'rh'
const SEM_FONTE = 'o sistema de RH não registra este dado'
const TIPOS_FOLHA = ['mensal', 'adiantamento', 'decimo_terceiro', 'rescisao']

async function extrairRh(url, chave, unitId, comp) {
  const j = janela(comp)
  const { valores, campos } = esqueleto(SEM_FONTE)
  const def = (k, v, status, obs = null) => { valores[k] = v; campos[k] = { status, obs } }

  const [docs, emp, bolsistas, fl] = await Promise.all([
    consultar(url, chave, 'unit_payroll_documents', [
      ['select', 'meta'], ['unit_id', `eq.${unitId}`], ['meta->>competencia', `eq.${comp}`],
    ]),
    consultar(url, chave, 'employees', [
      ['select', 'base_salary'], ['unit_id', `eq.${unitId}`], ['status', 'in.(ativo,ferias,afastado,aviso_previo)'],
    ]),
    consultar(url, chave, 'interns', [
      ['select', 'allowance'], ['unit_id', `eq.${unitId}`], ['active', 'is.true'],
    ]),
    consultar(url, chave, 'freelance_jobs', [
      ['select', 'gross_amount'], ['unit_id', `eq.${unitId}`], ['status', 'eq.pago'],
      ['paid_at', `gte.${j.iniTs}`], ['paid_at', `lt.${j.proxTs}`],
    ]),
  ])

  const metas = docs.map((d) => d.meta ?? {})
  const folhaDocs = metas.filter((m) => TIPOS_FOLHA.includes(m.tipo_folha ?? ''))
  const encDocs = metas.filter((m) => m.tipo_folha === 'encargos')
  const somaMeta = (l) => r2(l.reduce((s, m) => s + Number(m.valor ?? 0), 0))

  if (folhaDocs.length > 0) {
    def('folha', somaMeta(folhaDocs), 'ok', `${folhaDocs.length} documento(s) de folha do contador`)
  } else {
    const base = r2(emp.reduce((s, e) => s + Number(e.base_salary ?? 0), 0) + bolsistas.reduce((s, i) => s + Number(i.allowance ?? 0), 0))
    if (base > 0) def('folha', base, 'parcial', 'estimado pelos salários-base e bolsas ativos (sem documento de folha)')
    else def('folha', null, 'sem_dados', 'sem documento de folha e sem salários-base cadastrados')
  }

  if (encDocs.length > 0) def('encargos', somaMeta(encDocs), 'ok', 'documento de encargos do contador')
  else def('encargos', null, 'sem_dados', 'sem documento de encargos na competência')

  if (fl.length > 0) def('temporarios', somaDe(fl, 'gross_amount'), 'ok', 'freelances pagos no mês')
  else def('temporarios', null, 'sem_dados', 'nenhum freelance pago no mês')

  return {
    valores, campos,
    detalhes: { rh: { documentos: metas.length, documentos_folha: folhaDocs.length, documentos_encargos: encDocs.length } },
  }
}

async function main() {
  const { FECHAMENTO_SUPABASE_URL: url, FECHAMENTO_SUPABASE_SERVICE_ROLE_KEY: chave } =
    exigir(['FECHAMENTO_SUPABASE_URL', 'FECHAMENTO_SUPABASE_SERVICE_ROLE_KEY'])
  const raiz = process.cwd()

  const unidades = await selecionar(url, chave, 'units', 'select=id,name&order=name')
  if (unidades.length === 0) throw new Error('nenhuma unidade em units')
  console.log(`RH: ${unidades.length} unidade(s) — ${unidades.map((u) => u.name ?? u.id).join(', ')}`)

  for (const { comp, parcial } of competenciasAlvo()) {
    const saida = []
    for (const u of unidades) {
      const ext = await extrairRh(url, chave, u.id, comp)
      saida.push({ chave: u.id, rotulo: u.name ?? undefined, valores: ext.valores, campos: ext.campos, detalhes: { ...ext.detalhes, parcial } })
    }
    const caminho = await escreverFechamento(raiz, { sistema: SISTEMA, repo: REPO, competencia: comp, unidades: saida, parcial })
    const n = saida.reduce((s, u) => s + Object.values(u.valores).filter((v) => v !== null).length, 0)
    console.log(`${comp}${parcial ? ' (parcial)' : ''} → ${caminho} · ${n} campo(s) com valor`)
  }
}

main().catch((e) => { console.error(`falhou: ${e.message}`); process.exit(1) })
