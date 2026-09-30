import { expect, test } from '@playwright/test'

test('criar empresa → preencher → balanço fechado → relatório', async ({ page }) => {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()) })

  await page.goto('/empresas')
  await page.getByRole('button', { name: /Nova empresa/ }).click().catch(() => {})
  const nome = `E2E ${Date.now()}`
  await page.getByLabel('Razão social *').fill(nome)
  await page.getByRole('button', { name: 'Criar empresa' }).click()
  await page.getByRole('link', { name: new RegExp(nome) }).click()
  await page.getByRole('button', { name: 'Nova simulação' }).click()
  await page.waitForURL(/\/simulacoes\//)

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Carregar exemplo' }).click()
  await expect(page.getByText('Balanço fechado')).toBeVisible()

  await page.getByRole('button', { name: 'Balanço', exact: true }).click()
  await expect(page.getByText('✓ Balanço fechado em todos os meses')).toBeVisible()
  await page.getByRole('button', { name: 'DRE', exact: true }).click()
  await expect(page.getByText('= Receita líquida')).toBeVisible()
  await page.getByRole('button', { name: 'Indicadores' }).click()
  await expect(page.getByText('Liquidez corrente')).toBeVisible()
  await page.getByRole('button', { name: 'Comparar' }).click()
  await expect(page.getByText('Caixa mês a mês')).toBeVisible()
  await page.screenshot({ path: 'e2e/comparar.png', fullPage: true })

  await page.waitForTimeout(2600) // autosave
  await expect(page.getByText('Salvo')).toBeVisible()
  const url = page.url().replace('/simulacoes/', '/relatorio/')
  await page.goto(url)
  await expect(page.getByText('Sumário executivo')).toBeVisible()
  expect(erros, erros.join('\n')).toEqual([])
})

test('realizado: painel sinaliza célula vazia, edição manual e alimentação da simulação', async ({ page }) => {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()) })

  await page.goto('/empresas')
  await page.getByRole('button', { name: /Nova empresa/ }).click().catch(() => {})
  const nome = `E2E Realizado ${Date.now()}`
  await page.getByLabel('Razão social *').fill(nome)
  await page.getByRole('button', { name: 'Criar empresa' }).click()
  await page.getByRole('link', { name: new RegExp(nome) }).click()

  // painel Realizado: empresa nova não tem fonte → células "sem dados" sinalizadas
  await page.getByRole('link', { name: /Realizado mês a mês/ }).click()
  await expect(page.getByRole('heading', { name: 'Realizado' })).toBeVisible()
  await expect(page.getByText('sem dados').first()).toBeVisible()
  await expect(page.getByText('Cadastre uma fonte de dados abaixo')).toBeVisible()

  // edição manual da receita bruta do último mês: vira "manual"
  const linha = page.getByRole('row', { name: /^Receita bruta/ })
  await linha.getByRole('button').last().click()
  await page.getByLabel('valor').fill('1000')
  await page.getByLabel('valor').press('Enter')
  await expect(linha.getByText('manual')).toBeVisible()

  // simulação: "Alimentar com realizado" mostra as lacunas (só 1 mês tem dado)
  await page.goBack()
  await page.getByRole('button', { name: 'Nova simulação' }).click()
  await page.waitForURL(/\/simulacoes\//)
  await page.getByRole('button', { name: 'Alimentar com realizado' }).click()
  await expect(page.getByText('Sem fonte no realizado')).toBeVisible()
  expect(erros, erros.join('\n')).toEqual([])
})
