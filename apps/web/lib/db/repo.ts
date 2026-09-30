import { CAMPOS_REALIZADO, COLUNA_REALIZADO, competenciasAte, type CampoRealizado, type ProvenienciaCampo, type RealizadoMensal } from '@sf/engine'
import type { Cliente } from '../supabase/server'
import { calcular, paraEntradaSeguro } from '../motor'
import type { AlimentacaoRegistro, CenarioForm, ContingenciaForm, DividaForm, EventoForm, Rascunho } from '../rascunho'
import { rascunhoVazio } from '../rascunho'
import type { FonteInput } from '../realizadoSchema'

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
    alimentacao: (s.config?.alimentacao as AlimentacaoRegistro | null | undefined) ?? null,
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
    alimentacao: r.alimentacao ?? null,
  }
  const { error } = await sb.rpc('sim_salvar_rascunho', { p_id: id, p: payload })
  if (error) throw new Error(error.message)
}

// ---------- realizado (alimentação mês a mês) ----------
export interface FonteDados { id: string; empresaId: string; tipo: 'pdv' | 'clinica' | 'rh'; ativo: boolean; config: Record<string, string>; rotulo: string | null }
export interface Sincronizacao {
  id: string; empresaId: string | null; competencias: string[]; origem: 'cron' | 'manual'; disparadoPor: string | null
  status: 'executando' | 'ok' | 'parcial' | 'erro'; resultado: Record<string, unknown>; erro: string | null; iniciadoEm: string; concluidoEm: string | null
}

const CAMPO_DA_COLUNA = Object.fromEntries(CAMPOS_REALIZADO.map((c) => [COLUNA_REALIZADO[c], c])) as Record<string, CampoRealizado>

function mapRealizado(row: Row): RealizadoMensal {
  const valores: RealizadoMensal['valores'] = {}
  for (const c of CAMPOS_REALIZADO) {
    const v = row[COLUNA_REALIZADO[c]]
    valores[c] = v === null || v === undefined ? null : Number(v)
  }
  const campos: RealizadoMensal['campos'] = {}
  for (const [col, p] of Object.entries((row.campos ?? {}) as Record<string, Row>)) {
    const c = CAMPO_DA_COLUNA[col]
    if (c) campos[c] = { fonte: p.fonte, status: p.status, obs: p.obs ?? null, atualizadoEm: p.atualizado_em ?? null } as ProvenienciaCampo
  }
  return { competencia: String(row.competencia).slice(0, 7), valores, campos, status: row.status, fechado: !!row.fechado }
}

const mesVazio = (competencia: string): RealizadoMensal => ({ competencia, valores: {}, campos: {}, status: 'vazio', fechado: false })

/** Meses da janela que termina em `ate` ('YYYY-MM'); meses sem linha no banco vêm como 'vazio'. */
export async function listarRealizado(sb: Cliente, empresaId: string, o: { ate: string; meses: number }): Promise<RealizadoMensal[]> {
  const janela = competenciasAte(o.ate, o.meses)
  const rows = ok(await sb.from('sim_realizado_mensal').select('*').eq('empresa_id', empresaId)
    .gte('competencia', `${janela[0]}-01`).lte('competencia', `${janela[janela.length - 1]}-01`).order('competencia')) as Row[]
  const mapa = new Map(rows.map((r) => { const m = mapRealizado(r); return [m.competencia, m] }))
  return janela.map((c) => mapa.get(c) ?? mesVazio(c))
}

export async function contarMesesRealizado(sb: Cliente, empresaId: string): Promise<number> {
  const { count, error } = await sb.from('sim_realizado_mensal').select('competencia', { count: 'exact', head: true }).eq('empresa_id', empresaId).neq('status', 'vazio')
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function editarRealizado(sb: Cliente, empresaId: string, competencia: string, campo: CampoRealizado, valor: number | null, obs?: string | null): Promise<RealizadoMensal> {
  const row = ok(await sb.rpc('sim_editar_realizado', { p_empresa_id: empresaId, p_competencia: `${competencia}-01`, p_campo: COLUNA_REALIZADO[campo], p_valor: valor, p_obs: obs ?? null }))
  return mapRealizado(row as Row)
}

export async function fecharRealizado(sb: Cliente, empresaId: string, competencia: string, fechado: boolean): Promise<RealizadoMensal> {
  const row = ok(await sb.rpc('sim_fechar_realizado', { p_empresa_id: empresaId, p_competencia: `${competencia}-01`, p_fechado: fechado }))
  return mapRealizado(row as Row)
}

const mapFonte = (f: Row): FonteDados => ({ id: f.id, empresaId: f.empresa_id, tipo: f.tipo, ativo: f.ativo, config: f.config ?? {}, rotulo: f.rotulo ?? null })

export async function listarFontes(sb: Cliente, empresaId: string): Promise<FonteDados[]> {
  const rows = ok(await sb.from('sim_fonte_dados').select('*').eq('empresa_id', empresaId).order('tipo')) as Row[]
  return rows.map(mapFonte)
}

/** Substitui o conjunto de fontes da empresa (uma por tipo). */
export async function salvarFontes(sb: Cliente, empresaId: string, fontes: FonteInput[]): Promise<FonteDados[]> {
  const tipos = fontes.map((f) => f.tipo)
  if (fontes.length) {
    ok(await sb.from('sim_fonte_dados').upsert(
      fontes.map((f) => ({ empresa_id: empresaId, tipo: f.tipo, ativo: f.ativo, config: f.config, rotulo: f.rotulo ?? null })),
      { onConflict: 'empresa_id,tipo' },
    ))
  }
  let del = sb.from('sim_fonte_dados').delete().eq('empresa_id', empresaId)
  if (tipos.length) del = del.not('tipo', 'in', `(${tipos.join(',')})`)
  ok(await del)
  return listarFontes(sb, empresaId)
}

const mapSinc = (s: Row): Sincronizacao => ({
  id: s.id, empresaId: s.empresa_id ?? null, competencias: (s.competencias as string[] ?? []).map((c) => String(c).slice(0, 7)), origem: s.origem,
  disparadoPor: s.disparado_por ?? null, status: s.status, resultado: s.resultado ?? {}, erro: s.erro ?? null, iniciadoEm: s.iniciado_em, concluidoEm: s.concluido_em ?? null,
})

/** Últimas execuções que tocaram a empresa (as gerais, sem empresa, também contam). */
export async function listarSincronizacoes(sb: Cliente, empresaId: string, limite = 5): Promise<Sincronizacao[]> {
  const rows = ok(await sb.from('sim_sincronizacao').select('*').or(`empresa_id.eq.${empresaId},empresa_id.is.null`).order('iniciado_em', { ascending: false }).limit(limite)) as Row[]
  return rows.map(mapSinc)
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
