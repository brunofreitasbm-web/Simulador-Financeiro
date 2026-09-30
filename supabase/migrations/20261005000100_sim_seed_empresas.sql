-- As quatro operações alimentadas automaticamente. Cada uma é uma empresa própria no simulador,
-- mesmo dividindo CNPJ (Playground e Circuito do Parque Shopping).
-- Ids externos verificados em 2026-09-30 (ver docs/REALIZADO.md).

with dono as (select id from auth.users where lower(email) = 'brunofreitasbm@gmail.com' limit 1)
insert into public.sim_empresa (id, owner_id, razao_social, nome_fantasia, cnpj, segmento, regime_tributario, uf, cidade, descricao_atividade)
select v.id::uuid, dono.id, v.razao, v.fantasia, v.cnpj, v.segmento, 'simples', 'PA', 'Belém', v.descricao
  from dono, (values
    ('a0000000-0000-4000-8000-000000000001', 'FAÇA AMIGOS BRINQUEDOTECA LTDA', 'FaçaAmigos Playground (Parque Shopping)', '66318630000117', 'outro', 'Playground inclusivo no Parque Shopping Belém. Alimentado pelo PDV (unidade 11111111-…) e pelo RH (faca-amigos-parque-shopping).'),
    ('a0000000-0000-4000-8000-000000000002', 'FAÇA AMIGOS BRINQUEDOTECA LTDA', 'FaçaAmigos Circuito (Parque Shopping)', '66318630000117', 'outro', 'Circuito de carrinhos no Parque Shopping Belém. Mesmo CNPJ do Playground, operação separada. Alimentado pelo PDV (unidade e43ba7a8-…).'),
    ('a0000000-0000-4000-8000-000000000003', 'FAÇA AMIGOS BRINQUEDOTECA LTDA', 'FaçaAmigos Playground (Bosque Grão-Pará)', '66318630000117', 'outro', 'Playground no Shopping Bosque Grão-Pará. Alimentado pelo PDV (unidade 5fc99a57-…) e pelo RH (faca-amigos-grao-para).'),
    ('a0000000-0000-4000-8000-000000000004', 'FAÇA AMIGOS CENTRO DE TERAPIA COMPORTAMENTAL', 'Clínica FaçaAmigos', null, 'saude', 'Clínica TEA/TDAH. Alimentada pelo sistema da Clínica (projeto B) e pelo RH (clinica-a). CNPJ e regime a confirmar no cadastro.')
  ) as v(id, razao, fantasia, cnpj, segmento, descricao)
on conflict (id) do nothing;

insert into public.sim_fonte_dados (empresa_id, tipo, config, rotulo) values
  ('a0000000-0000-4000-8000-000000000001', 'pdv',     '{"unit_id": "11111111-1111-1111-1111-111111111111"}', 'PDV — FaçaAmigos Playground (Parque Shopping)'),
  ('a0000000-0000-4000-8000-000000000001', 'rh',      '{"unit_id": "faca-amigos-parque-shopping"}',            'RH — FaçaAmigos Parque Shopping'),
  ('a0000000-0000-4000-8000-000000000002', 'pdv',     '{"unit_id": "e43ba7a8-bd5f-47ad-b81d-dae7ea19d504"}', 'PDV — FaçaAmigos Circuito (Parque Shopping)'),
  ('a0000000-0000-4000-8000-000000000003', 'pdv',     '{"unit_id": "5fc99a57-81ee-4232-a105-1fcb4634cef4"}', 'PDV — Playground (Bosque Grão-Pará)'),
  ('a0000000-0000-4000-8000-000000000003', 'rh',      '{"unit_id": "faca-amigos-grao-para"}',                  'RH — FaçaAmigos Grão Pará'),
  ('a0000000-0000-4000-8000-000000000004', 'clinica', '{"clinic_id": "c0000000-0000-0000-0000-000000000001"}', 'Clínica — FaçaAmigos Centro de Terapia Comportamental'),
  ('a0000000-0000-4000-8000-000000000004', 'rh',      '{"unit_id": "clinica-a"}',                              'RH — Clínica (clinica-a)')
on conflict (empresa_id, tipo) do nothing;
