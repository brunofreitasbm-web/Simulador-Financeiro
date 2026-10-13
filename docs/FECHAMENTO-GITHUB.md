# Fechamento mensal publicado no GitHub

O Simulador passa a poder ler o realizado direto dos outros repositórios: cada sistema publica, no
fim do mês, um arquivo `fechamento/AAAA-MM.json` no próprio repositório, e o Simulador lê esse
arquivo no fechamento. É uma segunda via de alimentação, ao lado das fontes ao vivo (PDV no mesmo
projeto Supabase, Clínica e RH no projeto B).

## Por que existe

- **Clínica e RH** vivem no projeto Supabase B, alcançado só com os secrets
  `CLINICA_SUPABASE_URL` / `CLINICA_SUPABASE_SERVICE_ROLE_KEY`. Sem eles, o fechamento publicado no
  repositório é a **única** via de alimentação dessas duas origens.
- O fechamento fica **versionado no repositório**: cada mês tem um retrato auditável, com autor,
  data e diff.
- Não depende de o Simulador ter credencial do banco de cada sistema.

## O contrato

Arquivo: `fechamento/AAAA-MM.json`, na raiz do repositório, em qualquer branch (padrão `main`).

```json
{
  "schema": "sf.fechamento/1",
  "competencia": "2026-09",
  "gerado_em": "2026-09-27T06:20:00.000Z",
  "sistema": "pdv",
  "repo": "brunofreitasbm-web/faca_amigos",
  "parcial": false,
  "unidades": [
    {
      "chave": "11111111-1111-1111-1111-111111111111",
      "rotulo": "FaçaAmigos Playground (Parque Shopping)",
      "valores": { "receita_bruta": 35265.58, "receita_pix": 12000.0, "folha": null },
      "campos": {
        "receita_bruta": { "status": "ok", "obs": "total cobrado no mês" },
        "folha": { "status": "sem_fonte", "obs": "o PDV não registra folha" }
      }
    }
  ]
}
```

| Campo | Regra |
|---|---|
| `schema` | `sf.fechamento/1`. Versão diferente = erro explícito, não leitura silenciosa. |
| `competencia` | `AAAA-MM`. Precisa casar com o mês que o Simulador está lendo. |
| `sistema` | `pdv` \| `clinica` \| `rh`. Governa a precedência (ver abaixo). |
| `unidades[].chave` | Identidade da unidade na fonte. `config.unidade` da fonte github casa com isto (ou com o rótulo). |
| `unidades[].valores` | Colunas de `sim_realizado_mensal` em snake_case. `null` = ausência declarada. |
| `unidades[].campos` | Proveniência por coluna: `status` (`ok`/`sem_fonte`/`sem_dados`/`parcial`/`manual`) e `obs`. |

O JSON Schema completo está em [`integrations/fechamento/fechamento.schema.json`](../integrations/fechamento/fechamento.schema.json)
e o contrato executável (tipos, validação e mapeamento) em
[`packages/engine/src/fechamento.ts`](../packages/engine/src/fechamento.ts).

### As três regras que protegem os dados

1. **O que o artefato não citou fica intocado.** Só as colunas presentes em `valores` são gravadas.
2. **`sem_fonte` não zera nada.** É declaração de ausência de fonte, não afirmação sobre o campo —
   por isso é ignorada. Sem essa regra, o RH (que não conhece receita) publicaria
   `receita_bruta: null / sem_fonte` e apagaria a receita que o PDV trouxe.
3. **Arquivo ausente (404) não é erro.** A fonte existe e o mês ainda não foi publicado: o mês
   inteiro entra como `sem_dados`, com o motivo na observação de cada campo.

E as regras que já existiam continuam valendo: **célula `manual` não é sobrescrita** e
**mês `fechado` não é tocado**, salvo com "sobrescrever".

### Precedência

Por empresa, a gravação acontece nesta ordem: **github → pdv/clinica → rh**.

Ou seja, o dado vivo sempre ganha do fechamento publicado, e o RH continua por último porque
sobrescreve a folha quando tem o documento do contador. Na prática a fonte GitHub serve para
**preencher o que a fonte ao vivo não alcança** (projeto B sem secrets, por exemplo) — nunca para
contradizer um número lido direto do sistema.

Um detalhe que vale a pena conhecer: se o artefato for de `sistema: "rh"` e a folha não estiver
`ok` (isto é, foi estimada pelos salários-base), o Simulador **não** grava a folha — a mesma guarda
que a fonte RH ao vivo já aplica.

## Como instalar nos repositórios-fonte

Os arquivos prontos estão em [`integrations/github/`](../integrations/github/). Instruções e
secrets: [`integrations/README.md`](../integrations/README.md).

Resumo: cada repositório recebe

- `scripts/fechamento/{lib.mjs,gerar.mjs}` — gerador sem dependências (usa `fetch` do Node 20+);
- `.github/workflows/fechamento.yml` — roda todo dia às 03:00 de Belém, gera o mês anterior
  (definitivo) e o corrente (parcial), e só faz commit quando algum número mudou.

O Simulador dispara no **4º último dia do mês** (06:15 UTC = 03:15 Belém). A Action roda às
06:00 UTC, meia hora antes, então o fechamento do dia já está publicado quando a sincronização lê.

## Como o Simulador lê

1. A Edge Function `sim-sincronizar` busca `https://raw.githubusercontent.com/<repo>/<branch>/fechamento/<AAAA-MM>.json`
   (repositório público, sem token) ou a Contents API com `GITHUB_TOKEN` (repositório privado).
2. Valida envelope, competência e unidade; mapeia para `(valores, campos)` com as três regras acima.
3. Grava pela RPC `sim_gravar_realizado` — o mesmo caminho das fontes ao vivo.

Configuração da fonte, na tabela `sim_fonte_dados` (ou pela tela Realizado → Fontes de dados):

```json
{
  "repo": "brunofreitasbm-web/faca_amigos",
  "unidade": "11111111-1111-1111-1111-111111111111",
  "branch": "main"
}
```

`caminho` é opcional e existe para um teste pontual (`"caminho": "fechamento/2026-08.json"`).
Uma empresa pode ter **mais de uma** fonte github — é assim que o Playground recebe o PDV de
`faca_amigos` e a folha de `controle-de-estagiario`.

## Fontes registradas

A migration `20261007000100_sim_seed_fontes_github` registra as fontes abaixo **inativas**: nada
muda no fechamento até serem ligadas na tela Realizado → Fontes de dados.

| Empresa | Repositório | `unidade` | O que acrescenta |
|---|---|---|---|
| Playground (Parque Shopping) | `faca_amigos` | `11111111-1111-…` | redundante com o PDV ao vivo |
| Playground (Parque Shopping) | `controle-de-estagiario` | `faca-amigos-parque-shopping` | folha, encargos, temporários |
| Circuito (Parque Shopping) | `faca_amigos` | `e43ba7a8-bd5f-…` | redundante com o PDV ao vivo |
| Playground (Bosque Grão-Pará) | `faca_amigos` | `5fc99a57-81ee-…` | redundante com o PDV ao vivo |
| Playground (Bosque Grão-Pará) | `controle-de-estagiario` | `faca-amigos-grao-para` | folha, encargos, temporários |
| Clínica | `clinica_facaamigos` | `c0000000-0000-0000-…-000000000001` | receita, glosas, repasses, fixos |
| Clínica | `controle-de-estagiario` | `clinica-a` | folha, encargos, temporários |

Ligar as de PDV só tem efeito onde a fonte ao vivo não escreve (é o caso de uma empresa cujo PDV
não esteja no projeto A). As de folha e as da Clínica são as que **realmente acrescentam**, porque
dependem do projeto B.

Para ligar uma fonte:

```sql
update public.sim_fonte_dados set ativo = true
 where tipo = 'github' and chave = 'brunofreitasbm-web/controle-de-estagiario';
```

## Verificação

```bash
pnpm fechamento:verificar   # contrato das colunas, janela de competência e artefato de amostra
pnpm test                   # 62 testes do motor, incluindo o leitor do fechamento
pnpm typecheck
```

`fechamento:verificar` é o alarme de divergência: os geradores (JavaScript puro, copiados para
outros repositórios) e o motor (TypeScript) mantêm a mesma lista de colunas em dois lugares. Se
alguém adicionar um driver no motor e esquecer os geradores, esse comando falha em vez de o campo
sumir do fechamento em silêncio.

Para testar um mês sem esperar o cron, na tela Realizado use **Sincronizar agora** escolhendo a
competência — a Edge Function aceita `{"competencias": ["2026-09"], "empresa_id": "…"}`.

## Limites conhecidos

- O gerador da Clínica e o do RH falam direto com o PostgREST do projeto B, replicando as consultas
  da Edge Function. **São duas cópias da mesma regra.** Se a regra de extração mudar no Simulador,
  os geradores precisam mudar junto — mesmo tipo de acoplamento que já existe entre
  `extrairClinica` e a RPC `sim_extrair_pdv`. `pnpm fechamento:verificar` cobre a lista de colunas,
  não a regra de negócio de cada sistema.
- O artefato é gerado a partir do banco do próprio sistema. Se o banco estiver atrasado (folha não
  lançada, por exemplo), o fechamento publica o atraso — com o status certo (`sem_dados`/`parcial`),
  mas publica.
- As Actions dos três repositórios **ainda não foram instaladas**: os arquivos estão prontos em
  `integrations/`, mas precisam ser copiados e ter os secrets configurados (ver
  `integrations/README.md`). Enquanto isso, a fonte GitHub responde `sem_dados` — sem erro.
