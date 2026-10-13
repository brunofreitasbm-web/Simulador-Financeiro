#!/usr/bin/env node
/**
 * Verifica o contrato do fechamento antes de copiar estes arquivos para os repositórios-fonte.
 *
 *   1. Deriva a lista de colunas de `packages/engine/src/realizado.ts` e compara com `COLUNAS`
 *      daqui. É o único ponto em que o contrato existe em dois lugares (motor em TypeScript,
 *      geradores em JavaScript puro) — se alguém adicionar um driver no motor e esquecer os
 *      geradores, este teste falha em vez de o campo sumir do fechamento em silêncio.
 *   2. Exercita `janela()` nas viradas de mês e ano (dezembro, fevereiro, bissexto), que é onde
 *      um recorte errado produziria um total plausível e falso.
 *   3. Gera um artefato de amostra com `esqueleto()` + sobrescritas e confere o envelope e as
 *      chaves contra `COLUNAS`.
 *
 * Uso: node integrations/fechamento/verificar.mjs
 */
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { COLUNAS, competencia, escreverFechamento, esqueleto, janela } from './lib.mjs'

let falhas = 0
const ok = (nome, cond, detalhe = '') => {
  if (cond) { console.log(`  ok    ${nome}`) } else { falhas++; console.error(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ''}`) }
}

// ---------------------------------------------------------------------------------------------
// 1. Contrato de colunas
// ---------------------------------------------------------------------------------------------
console.log('contrato de colunas')
{
  const fonte = await readFile(new URL('../../packages/engine/src/realizado.ts', import.meta.url), 'utf8')
  const bloco = fonte.match(/CAMPOS_REALIZADO\s*=\s*\[([\s\S]*?)\]\s*as const/)
  ok('achei CAMPOS_REALIZADO em realizado.ts', Boolean(bloco), 'o regex do extrator parou de casar — atualize este script')
  if (bloco) {
    const doMotor = [...bloco[1].matchAll(/'([A-Za-z]+)'/g)]
      .map((m) => m[1].replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`))
    const iguais = doMotor.length === COLUNAS.length && doMotor.every((c, i) => c === COLUNAS[i])
    ok(`COLUNAS cobre as ${doMotor.length} colunas do motor, na mesma ordem`, iguais,
      iguais ? '' : `motor=[${doMotor.filter((c) => !COLUNAS.includes(c)).join(',')}] geradores=[${COLUNAS.filter((c) => !doMotor.includes(c)).join(',')}]`)
    ok('sem coluna repetida em COLUNAS', new Set(COLUNAS).size === COLUNAS.length)
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Janela de competência
// ---------------------------------------------------------------------------------------------
console.log('janela de competência')
{
  const fev = janela('2028-02') // bissexto
  ok('fev/2028 termina em 29', fev.fimDia === '2028-02-29', fev.fimDia)
  ok('fev/2028 avança para março', fev.prox === '2028-03-01', fev.prox)
  const naoBissexto = janela('2026-02')
  ok('fev/2026 termina em 28', naoBissexto.fimDia === '2026-02-28', naoBissexto.fimDia)
  const dez = janela('2026-12')
  ok('dez vira o ano', dez.prox === '2027-01-01', dez.prox)
  ok('dez termina em 31', dez.fimDia === '2026-12-31', dez.fimDia)
  ok('recorte em horário de Belém', dez.iniTs === '2026-12-01T00:00:00-03:00' && dez.proxTs === '2027-01-01T00:00:00-03:00', dez.iniTs)
  ok('competencia(0) tem formato YYYY-MM', /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia(0)))
  const [anoAtual, mesAtual] = competencia(0).split('-')
  ok('competencia(-12) é o mesmo mês do ano anterior', competencia(-12) === `${Number(anoAtual) - 1}-${mesAtual}`, competencia(-12))
  ok('competencia(12) é o mesmo mês do ano seguinte', competencia(12) === `${Number(anoAtual) + 1}-${mesAtual}`, competencia(12))
  ok('competencia(-1) fica antes de competencia(0)', competencia(-1) < competencia(0), competencia(-1))
}

// ---------------------------------------------------------------------------------------------
// 3. Artefato de amostra
// ---------------------------------------------------------------------------------------------
console.log('artefato de amostra')
{
  const raiz = join(tmpdir(), `fechamento-check-${process.pid}`)
  const { valores, campos } = esqueleto('este sistema não registra este dado')
  valores.receita_bruta = 35265.58
  campos.receita_bruta = { status: 'ok', obs: 'total cobrado no mês' }
  valores.folha = null
  campos.folha = { status: 'sem_dados', obs: 'nenhum documento de folha na competência' }

  const comp = '2026-09'
  const caminho = await escreverFechamento(raiz, {
    sistema: 'pdv', repo: 'exemplo/repo', competencia: comp, parcial: false,
    unidades: [{ chave: 'u-1', rotulo: 'Unidade 1', valores, campos }],
  })
  const lido = JSON.parse(await readFile(caminho, 'utf8'))

  ok('caminho é fechamento/AAAA-MM.json', caminho.endsWith(join('fechamento', `${comp}.json`)), caminho)
  ok('schema correto', lido.schema === 'sf.fechamento/1', String(lido.schema))
  ok('competência preservada', lido.competencia === comp)
  ok('sistema válido', ['pdv', 'clinica', 'rh'].includes(lido.sistema))
  ok('gerado_em é data ISO', !Number.isNaN(Date.parse(lido.gerado_em)))
  ok('uma unidade', lido.unidades.length === 1)
  ok('chave e rótulo preservados', lido.unidades[0].chave === 'u-1' && lido.unidades[0].rotulo === 'Unidade 1')

  const u = lido.unidades[0]
  ok('valores cobre todas as colunas', Object.keys(u.valores).length === COLUNAS.length)
  ok('campos cobre todas as colunas', Object.keys(u.campos).length === COLUNAS.length)
  const desconhecidas = [...Object.keys(u.valores), ...Object.keys(u.campos)].filter((k) => !COLUNAS.includes(k))
  ok('nenhuma coluna fora do contrato', desconhecidas.length === 0, desconhecidas.join(','))
  ok('só número ou null em valores', Object.values(u.valores).every((v) => v === null || typeof v === 'number'))
  ok('status dentro do enum', Object.values(u.campos).every((c) => ['ok', 'sem_fonte', 'sem_dados', 'parcial', 'manual'].includes(c.status)))
  ok('sobrescrita aplicada', u.valores.receita_bruta === 35265.58 && u.campos.receita_bruta.status === 'ok')
  ok('ausência declarada', u.valores.folha === null && u.campos.folha.status === 'sem_dados')

  await rm(raiz, { recursive: true, force: true })
}

console.log(falhas === 0 ? '\ncontrato ok' : `\n${falhas} verificação(ões) falharam`)
process.exit(falhas === 0 ? 0 : 1)
