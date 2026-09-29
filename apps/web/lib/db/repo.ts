import type { Cliente } from '../supabase/server'
import { calcular, paraEntradaSeguro } from '../motor'
import type { CenarioForm, ContingenciaForm, DividaForm, EventoForm, Rascunho } from '../rascunho'
import { rascunhoVazio } from '../rascunho'

/** Acesso a dados via Supabase (PostgREST). O RLS do banco restringe tudo aos e-mails autorizados. */
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function ok(r: { data: unknown; error: { message: string } | null }): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (r.error) throw new Error(r.error.message)
  return r.data
}

// ---------- empresas ----------
export interface EmpresaInput {
  razaoSocial: string
  cnpj?: string | null
  segmento?: string | null
  regime: 'simples' | 'presumido' | 'real' | 'mei'
  atividadePresumido?: 'comercio_industria' | 'servicos' | null
  uf?: string | null
  cidade?: string | null
  anoInicio?: number | null
  nomeFantasia?: string | null
  porte?: 'mei' | 'micro' | 'pequena' | 'media' | 'grande' | '' | null
  responsavel?: string | null
  emailContato?: string | null
  telefone?: string | null
  site?: string | null
  descricaoAtividade?: string | null
  /** true = registra o consentimento agora; false = remove */
  consentimento?: boolean | null
}

export interface EmpresaRow {
  id: string; razaoSocial: string; cnpj: string | null; segmento: string | null
  regimeTributario: 'simples' | 'presumido' | 'real' | 'mei'; atividadePresumido: 'comercio_industria' | 'servicos' | null
  uf: string | null; cidade: string | null; anoInicio: number | null
  nomeFantasia: string | null; porte: string | null; responsavel: string | null; emailContato: string | null
  telefone: string | null; site: string | null; descricaoAtividade: string | null; consentimentoEm: string | null
}
const mapEmpresa = (e: Row): EmpresaRow => ({
  id: e.id, razaoSocial: e.razao_social, cnpj: e.cnpj, segmento: e.segmento, regimeTributario: e.regime_tributario,
  atividadePresumido: e.atividade_presumido, uf: e.uf, cidade: e.cidade, anoInicio: e.ano_inicio,
  nomeFantasia: e.nome_fantasia, porte: e.porte, responsavel: e.responsavel, emailContato: e.email_contato,
  telefone: e.telefone, site: e.site, descricaoAtividade: e.descricao_atividade, consentimentoEm: e.consentimento_em,
})

function camposExtras(i: Partial<EmpresaInput>): Row {
  const v: Row = {}
  if (i.nomeFantasia !== undefined) v.nome_fantasia = i.nomeFantasia || null
  if (i.porte !== undefined) v.porte = i.porte || null
  if (i.responsavel !== undefined) v.responsavel = i.responsavel || null
  if (i.emailContato !== undefined) v.email_contato = i.emailContato || null
  if (i.telefone !== undefined) v.telefone = i.telefone || null
  if (i.site !== undefined) v.site = i.site || null
  if (i.descricaoAtividade !== undefined) v.descricao_atividade = i.descricaoAtividade || null
  if (i.consentimento === true) v.consentimento_em = new Date().toISOString()
  if (i.consentimento === false) v.consentimento_em = null
  return v
}

export async function listarEmpresas(sb: Cliente) {
  const rows = ok(await sb.from('sim_empresa').select('*, sim_simulacao(count)').order('razao_social'))
  return (rows as Row[]).map((e) => ({ ...mapEmpresa(e), nSimulacoes: Number(e.sim_simulacao?.[0]?.count ?? 0) }))
}

export async function obterEmpresa(sb: Cliente, id: string) {
  const e = ok(await sb.from('sim_empresa').select('*').eq('id', id).maybeSingle())
  return e ? mapEmpresa(e as Row) : null
}

export async function criarEmpresa(sb: Cliente, i: EmpresaInput) {
  const e = ok(await sb.from('sim_empresa').insert({
    razao_social: i.razaoSocial, cnpj: i.cnpj || null, segmento: i.segmento || null, regime_tributario: i.regime,
    atividade_presumido: i.regime === 'presumido' ? i.atividadePresumido ?? 'comercio_industria' : null,
    uf: i.uf || null, cidade: i.cidade || null, ano_inicio: i.anoInicio ?? null, ...camposExtras(i),
  }).select().single())
  return mapEmpresa(e as Row)
}

export async function atualizarEmpresa(sb: Cliente, id: string, i: Partial<EmpresaInput>) {
  const v: Row = camposExtras(i)
  if (i.razaoSocial !== undefined) v.razao_social = i.razaoSocial
  if (i.cnpj !== undefined) v.cnpj = i.cnpj || null
  if (i.segmento !== undefined) v.segmento = i.segmento || null
  if (i.regime !== undefined) {
    v.regime_tributario = i.regime
    v.atividade_presumido = i.regime === 'presumido' ? i.atividadePresumido ?? 'comercio_industria' : null
  }
  if (i.uf !== undefined) v.uf = i.uf || null
  if (i.cidade !== undefined) v.cidade = i.cidade || null
  if (i.anoInicio !== undefined) v.ano_inicio = i.anoInicio
  const e = ok(await sb.from('sim_empresa').update(v).eq('id', id).select().maybeSingle())
  return e ? mapEmpresa(e as Row) : null
}

/** LGPD: exclusão em cascata de empresa e de todas as suas simulações. */
export async function excluirEmpresa(sb: Cliente, id: string) {
  ok(await sb.from('sim_empresa').delete().eq('id', id))
}

// ---------- simulações ----------
export async function criarSimulacao(sb: Cliente, empresaId: string, nome?: string): Promise<string> {
  const emp = await obterEmpresa(sb, empresaId)
  if (!emp) throw new Error('Empresa não encontrada')
  const r = rascunhoVazio({ razaoSocial: emp.razaoSocial, regime: emp.regimeTributario, atividadePresumido: emp.atividadePresumido }, nome ?? 'Nova simulação')
  const s = ok(await sb.from('sim_simulacao').insert({ empresa_id: empresaId, nome: r.nome, data_base: r.dataBase, horizonte_meses: r.horizonte }).select('id').single())
  await salvarRascunho(sb, (s as Row).id, r)
  return (s as Row).id
}

export async function duplicarSimulacao(sb: Cliente, id: string): Promise<string | null> {
  const c = await carregarRascunho(sb, id)
  if (!c) return null
  const nome = `${c.rascunho.nome} (cópia)`
  const s = ok(await sb.from('sim_simulacao').insert({ empresa_id: c.empresaId, nome, data_base: c.rascunho.dataBase, horizonte_meses: c.rascunho.horizonte }).select('id').single())
  await salvarRascunho(sb, (s as Row).id, { ...c.rascunho, nome })
  return (s as Row).id
}

export async function excluirSimulacao(sb: Cliente, id: string) {
  ok(await sb.from('sim_simulacao').delete().eq('id', id))
}

export async function carregarRascunho(sb: Cliente, id: string): Promise<{ empresaId: string; rascunho: Rascunho } | null> {
  const s = ok(await sb.from('sim_simulacao').select('*').eq('id', id).maybeSingle()) as Row | null
  if (!s) return null
  const emp = await obterEmpresa(sb, s.empresa_id)
  if (!emp) return null
  const [p, dv, ct, ev, cn] = await Promise.all([
    sb.from('sim_premissas').select('*').eq('simulacao_id', id).maybeSingle(),
    sb.from('sim_divida').select('*').eq('simulacao_id', id).order('ordem'),
    sb.from('sim_contingencia').select('*').eq('simulacao_id', id).order('ordem'),
    sb.from('sim_evento').select('*').eq('simulacao_id', id).order('ordem'),
    sb.from('sim_cenario').select('*').eq('simulacao_id', id).order('ordem'),
  ])
  const prem = ok(p) as Row | null
  const dividas: DividaForm[] = (ok(dv) as Row[]).map((d) => ({
    tipo: d.tipo, descricao: d.descricao ?? undefined, saldo: Number(d.saldo), taxa: Number(d.taxa), unidadeTaxa: d.unidade_taxa,
    prazoMeses: d.prazo_meses, sistema: d.sistema, carenciaMeses: d.carencia_meses, mesInicio: d.mes_inicio, parcelada: d.parcelada,
  }))
  const contingencias: ContingenciaForm[] = (ok(ct) as Row[]).map((c) => ({
    natureza: c.natureza, polo: c.polo, valor: Number(c.valor), probabilidade: c.probabilidade, mesDesfecho: c.mes_desfecho ?? undefined,
  }))
  const eventos = (ok(ev) as Row[]).map((e): EventoForm => {
    const val = Number(e.valor)
    if (e.tipo === 'capex') return { tipo: 'capex', mes: e.mes, valor: val, vidaUtilMeses: e.parametros?.vidaUtilMeses }
    if (e.tipo === 'contratacao') return { tipo: 'contratacao', mes: e.mes, custoMensalComEncargos: val }
    if (e.tipo === 'reajusteFolha') return { tipo: 'reajusteFolha', mes: e.mes, pct: val }
    return { tipo: 'aporte', mes: e.mes, valor: val }
  })
  const cenarios: CenarioForm[] = (ok(cn) as Row[]).map((c) => ({ id: c.tipo === 'custom' ? c.id : c.tipo, tipo: c.tipo, nome: c.nome, descricao: c.descricao ?? undefined, alavancas: c.alavancas }))
  const base = rascunhoVazio({ razaoSocial: emp.razaoSocial, regime: emp.regimeTributario, atividadePresumido: emp.atividadePresumido })
  const rascunho: Rascunho = {
    nome: s.nome, dataBase: String(s.data_base).slice(0, 10), horizonte: s.horizonte_meses, empresa: base.empresa,
    historico: prem?.historico_12m ?? base.historico,
    abertura: { ...(prem?.abertura ?? base.abertura), dividas, contingencias },
    projecao: { ...(prem?.projecao ?? base.projecao), eventos },
    cenarios: cenarios.length ? cenarios : base.cenarios,
  }
  return { empresaId: s.empresa_id, rascunho }
}

/** Salva o rascunho completo numa transação (função SQL sim_salvar_rascunho). */
export async function salvarRascunho(sb: Cliente, id: string, r: Rascunho) {
  const { dividas, contingencias, ...abertura } = r.abertura
  const { eventos, ...projecao } = r.projecao
  const payload = {
    nome: r.nome, dataBase: r.dataBase, horizonte: r.horizonte,
    historico: r.historico, abertura, projecao, dividas, contingencias,
    eventos: eventos.map((e) => ({
      tipo: e.tipo, mes: e.mes,
      valor: e.tipo === 'contratacao' ? e.custoMensalComEncargos : e.tipo === 'reajusteFolha' ? e.pct : e.valor,
      parametros: e.tipo === 'capex' ? { vidaUtilMeses: e.vidaUtilMeses } : {},
    })),
    cenarios: r.cenarios.map((c) => ({ tipo: c.tipo, nome: c.nome, descricao: c.descricao ?? '', alavancas: c.alavancas })),
  }
  const { error } = await sb.rpc('sim_salvar_rascunho', { p_id: id, p: payload })
  if (error) throw new Error(error.message)
}

export interface ResumoSimulacao {
  id: string; nome: string; dataBase: string; updatedAt: string
  caixaFinal: number | null; alertaCritico: string | null; erro: boolean
}

export async function listarSimulacoes(sb: Cliente, empresaId: string): Promise<ResumoSimulacao[]> {
  const rows = ok(await sb.from('sim_simulacao').select('id, nome, data_base, updated_at').eq('empresa_id', empresaId).order('updated_at', { ascending: false })) as Row[]
  return Promise.all(rows.map(async (s) => {
    const c = await carregarRascunho(sb, s.id)
    let caixaFinal: number | null = null, alertaCritico: string | null = null, erro = true
    if (c) {
      const r = calcular(paraEntradaSeguro(c.rascunho), {}, { horizonte: c.rascunho.horizonte })
      if (r) {
        erro = false
        caixaFinal = r.meses[r.meses.length - 1].bp.caixa
        alertaCritico = r.alertas.find((a) => a.nivel === 'critico')?.mensagem ?? null
      }
    }
    return { id: s.id, nome: s.nome, dataBase: String(s.data_base).slice(0, 10), updatedAt: s.updated_at, caixaFinal, alertaCritico, erro }
  }))
}
