-- Fontes GitHub das quatro operações. Entram **inativas**: nada muda no fechamento até serem
-- ligadas na tela Realizado → Fontes de dados (ou por um update aqui).
--
-- Por que existe esta via, além das fontes ao vivo:
--   · a Clínica e o RH vivem no projeto Supabase B, que só é alcançado com os secrets
--     CLINICA_SUPABASE_URL / CLINICA_SUPABASE_SERVICE_ROLE_KEY. Sem eles, o fechamento publicado
--     no repositório é a única via de alimentação dessas duas origens;
--   · o fechamento fica versionado no repositório, então cada mês tem um retrato auditável.
--
-- Precedência na gravação: github roda ANTES de pdv/clinica/rh, e célula 'manual' e mês fechado
-- nunca são sobrescritos. Ligar as fontes de PDV aqui só tem efeito onde a fonte ao vivo não
-- escreve. Ver docs/FECHAMENTO-GITHUB.md.

insert into public.sim_fonte_dados (empresa_id, tipo, chave, ativo, config, rotulo) values
  -- Playground (Parque Shopping): PDV em faca_amigos, folha em controle-de-estagiario
  ('a0000000-0000-4000-8000-000000000001', 'github', 'brunofreitasbm-web/faca_amigos', false,
   '{"repo": "brunofreitasbm-web/faca_amigos", "unidade": "11111111-1111-1111-1111-111111111111", "branch": "main"}',
   'GitHub — PDV Playground (Parque Shopping)'),
  ('a0000000-0000-4000-8000-000000000001', 'github', 'brunofreitasbm-web/controle-de-estagiario', false,
   '{"repo": "brunofreitasbm-web/controle-de-estagiario", "unidade": "faca-amigos-parque-shopping", "branch": "main"}',
   'GitHub — RH Playground (Parque Shopping)'),

  -- Circuito (Parque Shopping): só PDV
  ('a0000000-0000-4000-8000-000000000002', 'github', 'brunofreitasbm-web/faca_amigos', false,
   '{"repo": "brunofreitasbm-web/faca_amigos", "unidade": "e43ba7a8-bd5f-47ad-b81d-dae7ea19d504", "branch": "main"}',
   'GitHub — PDV Circuito (Parque Shopping)'),

  -- Playground (Bosque Grão-Pará): PDV e RH
  ('a0000000-0000-4000-8000-000000000003', 'github', 'brunofreitasbm-web/faca_amigos', false,
   '{"repo": "brunofreitasbm-web/faca_amigos", "unidade": "5fc99a57-81ee-4232-a105-1fcb4634cef4", "branch": "main"}',
   'GitHub — PDV Playground (Bosque Grão-Pará)'),
  ('a0000000-0000-4000-8000-000000000003', 'github', 'brunofreitasbm-web/controle-de-estagiario', false,
   '{"repo": "brunofreitasbm-web/controle-de-estagiario", "unidade": "faca-amigos-grao-para", "branch": "main"}',
   'GitHub — RH Playground (Bosque Grão-Pará)'),

  -- Clínica: sistema da clínica e RH
  ('a0000000-0000-4000-8000-000000000004', 'github', 'brunofreitasbm-web/clinica_facaamigos', false,
   '{"repo": "brunofreitasbm-web/clinica_facaamigos", "unidade": "c0000000-0000-0000-0000-000000000001", "branch": "main"}',
   'GitHub — Sistema da Clínica'),
  ('a0000000-0000-4000-8000-000000000004', 'github', 'brunofreitasbm-web/controle-de-estagiario', false,
   '{"repo": "brunofreitasbm-web/controle-de-estagiario", "unidade": "clinica-a", "branch": "main"}',
   'GitHub — RH Clínica (clinica-a)')
on conflict (empresa_id, tipo, chave) do nothing;
