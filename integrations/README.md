# Integração dos repositórios-fonte

Aqui ficam os arquivos que cada sistema do grupo precisa receber para publicar o próprio
`fechamento/AAAA-MM.json`. O contrato e o desenho completo estão em
[`docs/FECHAMENTO-GITHUB.md`](../docs/FECHAMENTO-GITHUB.md).

O motivo de os arquivos morarem **neste** repositório e não nos outros: a escrita aqui é limitada ao
Simulador. Copie cada pasta para o repositório correspondente.

## O que copiar

| Repositório | Copiar para a raiz do repo | Secrets (Settings → Secrets and variables → Actions) |
|---|---|---|
| `brunofreitasbm-web/faca_amigos` | `.github/workflows/fechamento.yml`<br>`scripts/fechamento/lib.mjs`<br>`scripts/fechamento/gerar.mjs` | `PDV_SUPABASE_URL`<br>`PDV_SUPABASE_SERVICE_ROLE_KEY` |
| `brunofreitasbm-web/clinica_facaamigos` | `.github/workflows/fechamento.yml`<br>`scripts/fechamento/lib.mjs`<br>`scripts/fechamento/gerar.mjs` | `FECHAMENTO_SUPABASE_URL`<br>`FECHAMENTO_SUPABASE_SERVICE_ROLE_KEY` |
| `brunofreitasbm-web/controle-de-estagiario` | `.github/workflows/fechamento.yml`<br>`scripts/fechamento/lib.mjs`<br>`scripts/fechamento/gerar.mjs` | `FECHAMENTO_SUPABASE_URL`<br>`FECHAMENTO_SUPABASE_SERVICE_ROLE_KEY` |

`lib.mjs` é idêntico nos três. Os `gerar.mjs` diferem: cada um descreve o que o seu sistema sabe.

Em `faca_amigos` a extração usa a RPC `sim_extrair_pdv` do projeto do PDV — a mesma que o Simulador
usa ao vivo, então não existe segunda implementação das regras do PDV. Em `clinica_facaamigos` e
`controle-de-estagiario` o gerador fala direto com o PostgREST do projeto B, replicando as consultas
que a Edge Function `sim-sincronizar` já roda em produção (ver "Limites conhecidos" na doc do
contrato).

## Valores dos secrets

| Secret | Valor |
|---|---|
| `PDV_SUPABASE_URL` | URL do projeto Supabase do PDV (o mesmo do Simulador: `https://ivjvpdzsfjdpyabbzzuj.supabase.co`) |
| `PDV_SUPABASE_SERVICE_ROLE_KEY` | service_role desse projeto. A RPC `sim_extrair_pdv` é restrita a ele. |
| `FECHAMENTO_SUPABASE_URL` | URL do projeto B (Clínica + RH): `https://vththexblpxwocbowhsv.supabase.co` |
| `FECHAMENTO_SUPABASE_SERVICE_ROLE_KEY` | service_role do projeto B |

`service_role` ignora RLS: trate como senha do banco. Ele fica só nos secrets da Action, nunca no
código nem no bundle do front-end.

## Como testar antes de confiar

1. Copie os arquivos e configure os secrets.
2. Actions → **Fechamento mensal** → *Run workflow*, com `competencia` = um mês fechado conhecido
   (ex.: `2026-09`). Isso evita esperar o cron.
3. Confira o arquivo gerado no commit: `fechamento/2026-09.json`. Abra e verifique se
   `receita_bruta` da unidade bate com o que o sistema mostra na tela.
4. No Simulador, na tela Realizado da empresa, use **Sincronizar agora** na mesma competência e
   compare os valores da grade.
5. Só então ligue a fonte (`ativo = true`) — ver a seção "Fontes registradas" em
   `docs/FECHAMENTO-GITHUB.md`.

## Rodar o gerador localmente

Sem instalar nada (Node 20+):

```bash
PDV_SUPABASE_URL=… PDV_SUPABASE_SERVICE_ROLE_KEY=… \
  node scripts/fechamento/gerar.mjs --competencia=2026-09
```

Grava `fechamento/2026-09.json` no diretório atual. Sem `--competencia`, gera o mês anterior e o
corrente.

## Antes de copiar: verifique o contrato

```bash
pnpm fechamento:verificar
```

Confere que a lista de colunas de `lib.mjs` continua idêntica à do motor
(`packages/engine/src/realizado.ts`), que a janela de competência acerta as viradas de mês e ano, e
que o artefato de amostra tem o envelope e as chaves certas. Rode isso depois de qualquer mudança em
`lib.mjs` ou nos drivers do motor.
