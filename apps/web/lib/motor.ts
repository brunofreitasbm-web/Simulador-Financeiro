import { calcular as calcularMotor, validar, type AlavancasBruta, type Config, type Resultado } from '@sf/engine'
import { paraEntrada, type Rascunho } from './rascunho'
import { ROTULOS } from './rotulos'

export { paraEntrada as paraEntradaSeguro }

export type Simulado = { ok: true; resultado: Resultado } | { ok: false; erros: string[] }

/** Traduz "historico.rb12: Too small…" para "Faturamento bruto 12m: …". */
export function amigavel(erro: string): string {
  const i = erro.indexOf(': ')
  if (i < 0) return erro
  const caminho = erro.slice(0, i)
  const msg = erro.slice(i + 2)
  const chave = caminho.replace(/\.\d+\./g, '.').replace(/\.\d+$/, '')
  const rot = ROTULOS[chave]
  if (!rot) return erro
  const m = /^Too small: expected number to be >?(=?)(\S+)/.exec(msg)
  if (m) return `${rot}: informe um valor ${m[1] ? 'a partir de' : 'maior que'} ${m[2]}.`
  if (/expected number, received (undefined|nan)|Invalid input: expected number/i.test(msg)) return `${rot}: preencha este campo.`
  if (/Too big/i.test(msg)) return `${rot}: valor acima do máximo permitido.`
  return `${rot}: ${msg}`
}

export function simular(r: Rascunho, alavancas: AlavancasBruta = {}): Simulado {
  const entrada = paraEntrada(r)
  const cfg: Partial<Config> = { horizonte: r.horizonte }
  const v = validar(entrada)
  if (!v.ok) return { ok: false, erros: v.erros.map(amigavel) }
  return { ok: true, resultado: calcularMotor(entrada, alavancas, cfg) }
}

/** Para listagens: resultado do cenário Atual ou null se a entrada estiver incompleta. */
export function calcular(entrada: ReturnType<typeof paraEntrada>, alavancas: AlavancasBruta = {}, cfg: Partial<Config> = {}): Resultado | null {
  const v = validar(entrada)
  if (!v.ok) return null
  return calcularMotor(entrada, alavancas, cfg)
}
