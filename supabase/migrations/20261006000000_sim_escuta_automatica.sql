-- Escuta automática do Realizado: o job diário passa a rodar de verdade (e a falhar de forma visível), as estimativas
-- (taxa de cartão, impostos, fixos) têm onde viver e o mês anterior fecha sozinho.
--
-- - sim_validar_ops_key / sim_config_projeto_b: a Edge Function lê as chaves do Vault, sem secrets de função copiados à mão.
-- - sim_cron_sincronizar: dispara todo dia (mês corrente sempre; mês anterior até fechar) e registra erro em sim_sincronizacao
--   quando não consegue disparar (antes retornava 'skip' em silêncio e o pg_cron marcava "succeeded").
-- - status de campo 'estimado': valor calculado por regra/modelo, nunca sobrescreve 'ok', 'parcial' nem 'manual'.
-- - taxas_cartao: MDR estimado do mês (nenhum sistema registra a taxa da maquininha).
-- - sim_modelo_custos: modelo recorrente por empresa (taxas de cartão, alíquota de impostos, aluguel, fixos).
-- - sim_fechar_realizado_auto: fechamento automático do mês anterior pelo cron (service_role).

-- ---------------------------------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------------------------------
alter table public.sim_realizado_mensal add column if not exists taxas_cartao numeric(14,2);
alter table public.sim_realizado_mensal add column if not exists fechado_em timestamptz;
alter table public.sim_realizado_mensal add column if not exists fechado_por text;

create or replace function public.sim_realizado_colunas() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'receita_bruta','receita_servicos','receita_produtos','descontos','cancelamentos','qtd_pedidos',
    'receita_dinheiro','receita_pix','receita_debito','receita_credito','receita_voucher','receita_prazo','inadimplencia','glosas',
    'compras','frete','comissoes','impostos_vendas','taxas_cartao','ir_csll',
    'folha','encargos','temporarios','pro_labore','repasses_terapeutas',
    'aluguel','manutencao','fixos_outros','marketing','distribuicao',
    'caixa_final','contas_receber','contas_pagar','estoque','passivo_prepago','quebra_caixa'
  ]::text[]
$$;

-- Status da linha: 'estimado' conta como informação presente porém não confirmada (igual a 'parcial').
create or replace function public.sim_realizado_status(p_campos jsonb) returns text
language sql immutable set search_path = '' as $$
  with s as (select value->>'status' as st from jsonb_each(coalesce(p_campos, '{}'::jsonb)))
  select case
    when not exists (select 1 from s where st in ('ok','manual','parcial','estimado')) then 'vazio'
    when exists (select 1 from s where st in ('sem_dados','parcial','estimado')) then 'parcial'
    else 'ok' end
$$;

-- ---------------------------------------------------------------------------------------------
-- Gravação: mesma regra de antes + 'estimado' não sobrescreve valor ok/parcial vindo de fonte + coluna taxas_cartao
-- ---------------------------------------------------------------------------------------------
create or replace function public.sim_gravar_realizado(
  p_empresa_id uuid, p_competencia date, p_valores jsonb, p_campos jsonb, p_sobrescrever boolean default false, p_detalhes jsonb default null
) returns public.sim_realizado_mensal
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_comp date := date_trunc('month', p_competencia)::date;
  v_linha public.sim_realizado_mensal;
  v_valores jsonb := '{}'::jsonb;
  v_campos jsonb := '{}'::jsonb;
  v_atual text;
  k text; v jsonb;
begin
  insert into sim_realizado_mensal (empresa_id, competencia) values (p_empresa_id, v_comp) on conflict do nothing;
  select * into v_linha from sim_realizado_mensal where empresa_id = p_empresa_id and competencia = v_comp for update;

  if v_linha.fechado and not p_sobrescrever then return v_linha; end if;

  for k, v in select * from jsonb_each(coalesce(p_valores, '{}'::jsonb)) loop
    if not (k = any (sim_realizado_colunas())) then continue; end if;
    v_atual := v_linha.campos->k->>'status';
    if not p_sobrescrever then
      if v_atual = 'manual' then continue; end if;
      if p_campos->k->>'status' = 'estimado' and v_atual in ('ok', 'parcial') then continue; end if;
    end if;
    v_valores := v_valores || jsonb_build_object(k, v);
    if p_campos ? k then v_campos := v_campos || jsonb_build_object(k, p_campos->k); end if;
  end loop;

  v_linha := jsonb_populate_record(v_linha, v_valores);
  v_linha.campos := coalesce(v_linha.campos, '{}'::jsonb) || v_campos;
  v_linha.detalhes := coalesce(v_linha.detalhes, '{}'::jsonb) || coalesce(p_detalhes, '{}'::jsonb);
  v_linha.status := sim_realizado_status(v_linha.campos);
  v_linha.sincronizado_em := now();
  v_linha.updated_at := now();

  update sim_realizado_mensal set
    receita_bruta = v_linha.receita_bruta, receita_servicos = v_linha.receita_servicos, receita_produtos = v_linha.receita_produtos,
    descontos = v_linha.descontos, cancelamentos = v_linha.cancelamentos, qtd_pedidos = v_linha.qtd_pedidos,
    receita_dinheiro = v_linha.receita_dinheiro, receita_pix = v_linha.receita_pix, receita_debito = v_linha.receita_debito,
    receita_credito = v_linha.receita_credito, receita_voucher = v_linha.receita_voucher, receita_prazo = v_linha.receita_prazo,
    inadimplencia = v_linha.inadimplencia, glosas = v_linha.glosas,
    compras = v_linha.compras, frete = v_linha.frete, comissoes = v_linha.comissoes, impostos_vendas = v_linha.impostos_vendas,
    taxas_cartao = v_linha.taxas_cartao, ir_csll = v_linha.ir_csll,
    folha = v_linha.folha, encargos = v_linha.encargos, temporarios = v_linha.temporarios, pro_labore = v_linha.pro_labore, repasses_terapeutas = v_linha.repasses_terapeutas,
    aluguel = v_linha.aluguel, manutencao = v_linha.manutencao, fixos_outros = v_linha.fixos_outros, marketing = v_linha.marketing, distribuicao = v_linha.distribuicao,
    caixa_final = v_linha.caixa_final, contas_receber = v_linha.contas_receber, contas_pagar = v_linha.contas_pagar, estoque = v_linha.estoque,
    passivo_prepago = v_linha.passivo_prepago, quebra_caixa = v_linha.quebra_caixa,
    campos = v_linha.campos, detalhes = v_linha.detalhes, status = v_linha.status, sincronizado_em = v_linha.sincronizado_em, updated_at = v_linha.updated_at
  where empresa_id = p_empresa_id and competencia = v_comp;
  return v_linha;
end $$;
revoke all on function public.sim_gravar_realizado(uuid, date, jsonb, jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.sim_gravar_realizado(uuid, date, jsonb, jsonb, boolean, jsonb) to service_role;

-- Fechamento manual (painel) passa a registrar quem e quando; o automático (cron) é uma função só de service_role.
create or replace function public.sim_fechar_realizado(p_empresa_id uuid, p_competencia date, p_fechado boolean)
returns public.sim_realizado_mensal
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_comp date := date_trunc('month', p_competencia)::date;
  v_linha public.sim_realizado_mensal;
begin
  if not public.sim_autorizado() then raise exception 'não autorizado'; end if;
  if not exists (select 1 from sim_empresa where id = p_empresa_id) then raise exception 'empresa não encontrada'; end if;
  insert into sim_realizado_mensal (empresa_id, competencia) values (p_empresa_id, v_comp) on conflict do nothing;
  update sim_realizado_mensal
     set fechado = p_fechado, updated_at = now(),
         fechado_em = case when p_fechado then now() end,
         fechado_por = case when p_fechado then coalesce(auth.jwt() ->> 'email', 'usuário') end
   where empresa_id = p_empresa_id and competencia = v_comp returning * into v_linha;
  return v_linha;
end $$;
revoke all on function public.sim_fechar_realizado(uuid, date, boolean) from public, anon;
grant execute on function public.sim_fechar_realizado(uuid, date, boolean) to authenticated, service_role;

create or replace function public.sim_fechar_realizado_auto(p_empresa_id uuid, p_competencia date) returns void
language sql security definer set search_path = public, pg_temp as $$
  update sim_realizado_mensal
     set fechado = true, fechado_em = now(), fechado_por = 'cron', updated_at = now()
   where empresa_id = p_empresa_id and competencia = date_trunc('month', p_competencia)::date and not fechado
$$;
revoke all on function public.sim_fechar_realizado_auto(uuid, date) from public, anon, authenticated;
grant execute on function public.sim_fechar_realizado_auto(uuid, date) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Modelo de custos por empresa (estimativas): amount null = "não estimar"
-- ---------------------------------------------------------------------------------------------
create table if not exists public.sim_modelo_custos (
  empresa_id uuid primary key references public.sim_empresa(id) on delete cascade,
  -- taxa da maquininha (% sobre o valor recebido em cada forma)
  taxa_debito numeric(6,3) not null default 1.0 check (taxa_debito between 0 and 15),
  taxa_credito numeric(6,3) not null default 3.0 check (taxa_credito between 0 and 15),
  taxa_pix numeric(6,3) not null default 0 check (taxa_pix between 0 and 15),
  taxa_voucher numeric(6,3) not null default 0 check (taxa_voucher between 0 and 15),
  -- % sobre a receita bruta (alíquota efetiva do Simples) e % da folha CLT
  aliquota_impostos numeric(6,3) check (aliquota_impostos between 0 and 40),
  pct_encargos numeric(6,3) check (pct_encargos between 0 and 120),
  -- aluguel = maior entre o mínimo e o % do faturamento, + condomínio + fundo de promoção
  aluguel_minimo numeric(14,2) check (aluguel_minimo >= 0),
  aluguel_pct_receita numeric(6,3) check (aluguel_pct_receita between 0 and 40),
  condominio numeric(14,2) check (condominio >= 0),
  fundo_promocao numeric(14,2) check (fundo_promocao >= 0),
  manutencao numeric(14,2) check (manutencao >= 0),
  marketing numeric(14,2) check (marketing >= 0),
  fixos_outros numeric(14,2) check (fixos_outros >= 0),
  updated_at timestamptz not null default now()
);
alter table public.sim_modelo_custos enable row level security;
drop policy if exists sim_modelo_custos_autorizados on public.sim_modelo_custos;
create policy sim_modelo_custos_autorizados on public.sim_modelo_custos
  for all to authenticated using (public.sim_autorizado()) with check (public.sim_autorizado());

-- Alíquota inicial 6% (Simples, 1ª faixa do Anexo III) e encargos 28% (FGTS + provisões de 13º e férias, sem CPP:
-- no Simples a contribuição patronal já está dentro do DAS). Ajuste com o contador.
insert into public.sim_modelo_custos (empresa_id, aliquota_impostos, pct_encargos)
select id, 6.0, 28.0 from public.sim_empresa
on conflict (empresa_id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Chaves no Vault (somente service_role)
-- ---------------------------------------------------------------------------------------------
create or replace function public.sim_validar_ops_key(p_chave text) returns boolean
language sql stable security definer set search_path = public, vault, pg_temp as $$
  select coalesce(p_chave, '') <> '' and exists (select 1 from vault.decrypted_secrets where name = 'sim_ops_key' and decrypted_secret = p_chave)
$$;
revoke all on function public.sim_validar_ops_key(text) from public, anon, authenticated;
grant execute on function public.sim_validar_ops_key(text) to service_role;

-- Config do projeto B (RH + Clínica): {"url","anon","hub_key"}. Segredos 'sim_b_url', 'sim_b_anon', 'sim_hub_key'.
create or replace function public.sim_config_projeto_b() returns jsonb
language sql stable security definer set search_path = public, vault, pg_temp as $$
  select jsonb_build_object(
    'url', (select decrypted_secret from vault.decrypted_secrets where name = 'sim_b_url'),
    'anon', (select decrypted_secret from vault.decrypted_secrets where name = 'sim_b_anon'),
    'hub_key', (select decrypted_secret from vault.decrypted_secrets where name = 'sim_hub_key'))
$$;
revoke all on function public.sim_config_projeto_b() from public, anon, authenticated;
grant execute on function public.sim_config_projeto_b() to service_role;

-- ---------------------------------------------------------------------------------------------
-- Escuta: todo dia às 03:15 (Belém). A Edge Function sincroniza o mês corrente sempre e o anterior até fechar
-- (fechamento automático a partir do dia 2). Falha ao disparar fica registrada em sim_sincronizacao.
-- Segredos no Vault: sim_ops_key (chave do cron) — ver docs/REALIZADO.md.
-- ---------------------------------------------------------------------------------------------
create or replace function public.sim_cron_sincronizar(p_forcar boolean default false) returns text
language plpgsql security definer set search_path = public, extensions, vault, pg_temp as $$
declare
  v_hoje date := (now() at time zone 'America/Belem')::date;
  v_chave text;
  v_req bigint;
  v_msg text;
begin
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'sim_ops_key';
  if v_chave is null then
    v_msg := 'segredo sim_ops_key ausente no Vault: a escuta automática não disparou';
    insert into sim_sincronizacao (competencias, origem, disparado_por, status, erro, concluido_em)
    values (array[date_trunc('month', v_hoje)::date], 'cron', 'cron', 'erro', v_msg, now());
    return 'erro: ' || v_msg;
  end if;
  begin
    select net.http_post(
      url := 'https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/sim-sincronizar',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-ops-key', v_chave),
      body := jsonb_build_object('origem', 'cron'),
      timeout_milliseconds := 120000
    ) into v_req;
  exception when others then
    v_msg := 'falha ao disparar a Edge Function: ' || sqlerrm;
    insert into sim_sincronizacao (competencias, origem, disparado_por, status, erro, concluido_em)
    values (array[date_trunc('month', v_hoje)::date], 'cron', 'cron', 'erro', v_msg, now());
    return 'erro: ' || v_msg;
  end;
  return format('disparado (net request %s)', v_req);
end $$;
revoke all on function public.sim_cron_sincronizar(boolean) from public, anon, authenticated;
