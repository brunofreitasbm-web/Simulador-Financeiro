import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: process.env.E2E_URL ?? 'http://127.0.0.1:3100', headless: true },
})
