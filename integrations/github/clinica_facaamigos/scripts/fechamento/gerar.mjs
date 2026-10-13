#!/usr/bin/env node
/**
 * Publica o fechamento mensal da Clínica FaçaAmigos em `fechamento/AAAA-MM.json`.
 *
 * As consultas abaixo são o mesmo recorte que a Edge Function `sim-sincronizar` usa ao vivo
 * (`extrairClinica`, no projeto do Simulador) — mesmas tabelas, mesmos filtros, mesma marcação de
 * status por campo. Não há RPC a instalar: o gerador fala direto com o PostgREST deste projeto.
 *
 * Regime de caixa por `paid_at`. As posições de fim de mês (contas a receber, contas a pagar,
 * inadimplência) só fazem sentido no mês corrente e vêm marcadas como `parcial`.
 *
 * Secrets (Settings → Secrets and variables → Actions):
 *   FECHAMENTO_SUPABASE_URL                URL do projeto Supabase deste sistema
 *   FECHAMENTO_SUPABASE_SERVICE_ROLE_KEY   service_role (leitura das tabelas financeiras)
 *
 * Uso: node scripts/fechamento/gerar.mjs [--competencia=AAAA-MM]
 */
import {
  competencia, competenciasAlvo, consultar, escreverFechamento, exigir, esqueleto, janela, r2, selecionar, somaDe,
} from './lib.mjs'

const REPO = 'brunofreitasbm-web/clinica_facaamigos'
const SISTEMA = 'clinica'
const SEM_FONTE = 'o sistema da clínica não registra este dado'
/** Campos que o sistema da clínica simplesmente não tem. */
const AUSENTES = [
  'descontos', 'cancelamentos', 'qtd_pedidos', 'frete', 'comissoes', 'ir_csll', 'encargos', 'temporarios',
  'pro_labore', 'distribuicao', 'caixa_final', 'estoque', 'passivo_prepago', 'quebra_caixa',
]

async function extrairClinica(url, chave, clinicId, comp) {
  const j = janela(comp)
  const corrente = comp === competencia(0)
  const { valores, campos } = esqueleto(SEM_FONTE)
  const def = (k, v, status, obs = null) => { valores[k] = v; campos[k] = { status, obs } }

  const [bi, pc, ci, ap, po, rl] = await Promise.all([
    consultar(url, chave, 'billing_items', [
      ['select', 'amount,paid_at,billing_periods!inner(insurers!inner(clinic_id))'],
      ['status', 'eq.pago'], ['billing_periods.insurers.clinic_id', `eq.${clinicId}`],
      ['paid_at', `gte.${j.iniTs}`], ['paid_at', `lt.${j.proxTs}`],
    ]),
    consultar(url, chave, 'patient_charges', [
      ['select', 'amount,paid_at,pix_code,patients!inner(clinic_id)'],
      ['status', 'eq.pago'], ['patients.clinic_id', `eq.${clinicId}`],
      ['paid_at', `gte.${j.iniTs}`], ['paid_at', `lt.${j.proxTs}`],
    ]),
    consultar(url, chave, 'contract_invoices', [
      ['select', 'amount,paid_at,pix_code,boleto_url,patient_contracts!inner(clinic_id)'],
      ['status', 'eq.pago'], ['patient_contracts.clinic_id', `eq.${clinicId}`],
      ['paid_at', `gte.${j.iniTs}`], ['paid_at', `lt.${j.proxTs}`],
    ]),
    consultar(url, chave, 'accounts_payable', [
      ['select', 'category,amount'],
      ['clinic_id', `eq.${clinicId}`], ['status', 'eq.pago'],
      ['paid_at', `gte.${j.iniTs}`], ['paid_at', `lt.${j.proxTs}`],
    ]),
    consultar(url, chave, 'payouts', [
      ['select', 'gross_amount,adjustments,profiles!inner(clinic_id)'],
      ['profiles.clinic_id', `eq.${clinicId}`], ['competence_month', `eq.${j.ini}`],
      ['status', 'in.(aprovado,pago)'],
    ]),
    consultar(url, chave, 'insurance_remittance_lines', [
      ['select', 'glosa_amount'],
      ['clinic_id', `eq.${clinicId}`], ['competence_month', `eq.${j.ini}`], ['consolidated', 'is.true'],
    ]),
  ])

  const convenio = somaDe(bi), particular = somaDe(pc), contratos = somaDe(ci)
  const receita = r2(convenio + particular + contratos)
  const nRec = bi.length + pc.length + ci.length
  if (nRec === 0) {
    for (const k of ['receita_bruta', 'receita_servicos', 'receita_prazo', 'receita_pix']) def(k, null, 'sem_dados', 'nenhum recebimento no mês')
  } else {
    def('receita_bruta', receita, 'ok', 'convênio + particular + mensalidades pagas no mês')
    def('receita_servicos', receita, 'ok', 'a clínica só vende serviço')
    const boletos = ci.filter((x) => x.boleto_url)
    def('receita_prazo', r2(convenio + somaDe(boletos)), 'parcial', 'convênio (faturado→pago) + mensalidades por boleto tratados como venda a prazo')
    const pix = [...pc, ...ci.filter((x) => !x.boleto_url)].filter((x) => x.pix_code)
    def('receita_pix', somaDe(pix), 'parcial', 'cobranças pagas que tinham código Pix')
  }
  def('receita_produtos', 0, 'ok', 'a clínica não vende produto')
  for (const k of ['receita_dinheiro', 'receita_debito', 'receita_credito', 'receita_voucher']) def(k, null, 'sem_fonte', 'o sistema da clínica não registra a forma de pagamento')

  if (rl.length === 0) def('glosas', null, 'sem_dados', 'sem extrato de convênio consolidado na competência')
  else def('glosas', r2(rl.reduce((s, x) => s + Number(x.glosa_amount ?? 0), 0)), 'ok', 'extratos de convênio consolidados')

  const categoria = (k, c, status = 'ok', obs = null) => {
    const linhas = ap.filter((x) => x.category === c)
    if (linhas.length === 0) def(k, null, 'sem_dados', `nenhuma conta '${c}' paga no mês`)
    else def(k, somaDe(linhas), status, obs ?? `contas a pagar '${c}' pagas no mês`)
  }
  categoria('aluguel', 'aluguel'); categoria('manutencao', 'manutencao'); categoria('marketing', 'marketing'); categoria('fixos_outros', 'outros')
  categoria('compras', 'fornecedores', 'parcial', 'contas de fornecedores pagas (não é compra por competência)')
  categoria('impostos_vendas', 'impostos', 'parcial', 'todos os tributos pagos, não só os sobre vendas')
  categoria('folha', 'folha', 'parcial', "contas a pagar 'folha' (o RH sobrescreve quando tem documento)")

  if (po.length === 0) def('repasses_terapeutas', null, 'sem_dados', 'nenhum repasse aprovado/pago na competência')
  else def('repasses_terapeutas', somaDe(po, 'gross_amount'), 'ok', 'repasses a terapeutas por competência')

  if (corrente) {
    const [p1, p2, p3, apPend, inad1, inad2] = await Promise.all([
      consultar(url, chave, 'billing_items', [
        ['select', 'amount,billing_periods!inner(insurers!inner(clinic_id))'],
        ['status', 'in.(pendente,enviado,recursado)'], ['billing_periods.insurers.clinic_id', `eq.${clinicId}`],
      ]),
      consultar(url, chave, 'patient_charges', [
        ['select', 'amount,patients!inner(clinic_id)'], ['status', 'eq.pendente'], ['patients.clinic_id', `eq.${clinicId}`],
      ]),
      consultar(url, chave, 'contract_invoices', [
        ['select', 'amount,patient_contracts!inner(clinic_id)'], ['status', 'in.(pendente,atrasado)'], ['patient_contracts.clinic_id', `eq.${clinicId}`],
      ]),
      consultar(url, chave, 'accounts_payable', [
        ['select', 'amount'], ['clinic_id', `eq.${clinicId}`], ['status', 'in.(pendente,atrasado)'], ['due_date', `lte.${j.fimDia}`],
      ]),
      consultar(url, chave, 'patient_charges', [
        ['select', 'amount,patients!inner(clinic_id)'], ['status', 'eq.pendente'], ['patients.clinic_id', `eq.${clinicId}`], ['due_date', `lt.${j.fimDia}`],
      ]),
      consultar(url, chave, 'contract_invoices', [
        ['select', 'amount,patient_contracts!inner(clinic_id)'], ['status', 'eq.atrasado'], ['patient_contracts.clinic_id', `eq.${clinicId}`],
      ]),
    ])
    def('contas_receber', r2(somaDe(p1) + somaDe(p2) + somaDe(p3)), 'parcial', 'em aberto na data da geração')
    def('contas_pagar', somaDe(apPend), 'parcial', 'contas pendentes com vencimento até o fim do mês (foto na geração)')
    def('inadimplencia', r2(somaDe(inad1) + somaDe(inad2)), 'parcial', 'cobranças vencidas e não pagas (foto na geração)')
  } else {
    for (const k of ['contas_receber', 'contas_pagar', 'inadimplencia']) def(k, null, 'sem_dados', 'posição só é lida no mês corrente')
  }

  return { valores, campos, detalhes: { clinica: { convenio, particular, contratos } } }
}

async function main() {
  const { FECHAMENTO_SUPABASE_URL: url, FECHAMENTO_SUPABASE_SERVICE_ROLE_KEY: chave } =
    exigir(['FECHAMENTO_SUPABASE_URL', 'FECHAMENTO_SUPABASE_SERVICE_ROLE_KEY'])
  const raiz = process.cwd()

  const clinicas = await selecionar(url, chave, 'clinics', 'select=id,name&order=name')
  if (clinicas.length === 0) throw new Error('nenhuma clínica em clinics')
  console.log(`Clínica: ${clinicas.length} unidade(s) — ${clinicas.map((c) => c.name ?? c.id).join(', ')}`)

  for (const { comp, parcial } of competenciasAlvo()) {
    const saida = []
    for (const c of clinicas) {
      const ext = await extrairClinica(url, chave, c.id, comp)
      saida.push({ chave: c.id, rotulo: c.name ?? undefined, valores: ext.valores, campos: ext.campos, detalhes: { ...ext.detalhes, parcial } })
    }
    const caminho = await escreverFechamento(raiz, { sistema: SISTEMA, repo: REPO, competencia: comp, unidades: saida, parcial })
    const n = saida.reduce((s, u) => s + Object.values(u.valores).filter((v) => v !== null).length, 0)
    console.log(`${comp}${parcial ? ' (parcial)' : ''} → ${caminho} · ${n} campo(s) com valor`)
  }
}

main().catch((e) => { console.error(`falhou: ${e.message}`); process.exit(1) })
