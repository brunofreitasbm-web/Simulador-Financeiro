/** Consulta de CNPJ na Receita (via BrasilAPI) e mapeamento para o cadastro da empresa. */

export interface DadosCnpj {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string | null
  uf: string | null
  cidade: string | null
  anoInicio: number | null
  porte: 'mei' | 'micro' | 'pequena' | 'media' | null
  /** null quando a Receita não diz (lucro presumido e real não aparecem na consulta pública). */
  regime: 'mei' | 'simples' | null
  segmento: string
  telefone: string | null
  email: string | null
  descricaoAtividade: string | null
  situacao: string | null
}

const SITUACAO: Record<number, string> = { 1: 'nula', 2: 'ativa', 3: 'suspensa', 4: 'inapta', 8: 'baixada' }

/** Divisão CNAE (2 primeiros dígitos) → segmento do cadastro. */
function segmentoDoCnae(cnae: number | null): string {
  const d = cnae ? Number(String(cnae).padStart(7, '0').slice(0, 2)) : -1
  if (d >= 45 && d <= 47) return 'comércio'
  if (d >= 10 && d <= 33) return 'indústria'
  if (d === 55 || d === 56) return 'alimentação'
  if (d >= 86 && d <= 88) return 'saúde'
  if (d >= 58 && d <= 82) return 'serviços'
  return 'outro'
}

export const soDigitos = (v: string) => v.replace(/\D/g, '')

/** Lança Error com mensagem legível; retorna null se o CNPJ não existe. */
export async function consultarCnpj(cnpjBruto: string): Promise<DadosCnpj | null> {
  const cnpj = soDigitos(cnpjBruto)
  if (cnpj.length !== 14) throw new Error('CNPJ deve ter 14 dígitos.')
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: { accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (res.status === 404 || res.status === 400) return null
  if (!res.ok) throw new Error(`Consulta de CNPJ indisponível (${res.status}). Tente novamente em instantes.`)
  const j = await res.json()
  const cnae: number | null = j.cnae_fiscal ?? null
  const porteTxt = String(j.porte ?? '').toUpperCase()
  const porte = j.opcao_pelo_mei ? 'mei' : porteTxt.includes('MICRO') ? 'micro' : porteTxt.includes('PEQUENO') ? 'pequena' : porteTxt.includes('DEMAIS') ? 'media' : null
  const ano = j.data_inicio_atividade ? Number(String(j.data_inicio_atividade).slice(0, 4)) : null
  const cap = (s: string) => s.toLowerCase().replace(/(^|\s|-)\S/g, (m: string) => m.toUpperCase())
  return {
    cnpj,
    razaoSocial: String(j.razao_social ?? '').trim(),
    nomeFantasia: j.nome_fantasia ? cap(String(j.nome_fantasia)) : null,
    uf: j.uf ?? null,
    cidade: j.municipio ? cap(String(j.municipio)) : null,
    anoInicio: ano && ano > 1900 ? ano : null,
    porte,
    regime: j.opcao_pelo_mei ? 'mei' : j.opcao_pelo_simples ? 'simples' : null,
    segmento: segmentoDoCnae(cnae),
    telefone: j.ddd_telefone_1 ? String(j.ddd_telefone_1) : null,
    email: j.email ? String(j.email).toLowerCase() : null,
    descricaoAtividade: j.cnae_fiscal_descricao ? String(j.cnae_fiscal_descricao) : null,
    situacao: typeof j.situacao_cadastral === 'number' ? SITUACAO[j.situacao_cadastral] ?? null : null,
  }
}
