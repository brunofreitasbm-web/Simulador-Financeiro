-- Realizado: alimentação mês a mês do Simulador pelos sistemas-fonte (PDV FaçaAmigos, Clínica, RH).
--
-- - sim_fonte_dados: quais sistemas alimentam cada empresa (1:N).
-- - sim_realizado_mensal: uma linha por empresa × competência, uma coluna por driver (espelha o histórico do
--   motor) e a proveniência de cada campo em `campos` ({campo: {fonte, status, obs, atualizado_em}}).
--   status por campo: ok | sem_fonte (o sistema não tem esse dado) | sem_dados (tem, mas o mês veio vazio)
--   | parcial (estimativa, snapshot ou mês em andamento) | manual (digitado no painel; vence a sincronização).
-- - sim_sincronizacao: log de cada execução (cron ou manual).
-- - sim_extrair_pdv: extração das unidades do PDV (mesmo projeto). Clínica e RH vivem no projeto B e são lidos
--   pela Edge Function sim-sincronizar, que grava tudo via sim_gravar_realizado.
-- - sim_cron_sincronizar: disparo diário que só age no 4º último dia do mês.

-- Playground e Circuito (Parque Shopping) dividem o CNPJ mas são empresas distintas no simulador.
drop index if exists public.sim_empresa_cnpj_key;

-- ---------------------------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------------------------
create table if not exists public.sim_fonte_dados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.sim_empresa(id) on delete cascade,
  tipo text not null check (tipo in ('pdv','clinica','rh')),
  ativo boolean not null default true,
  -- pdv: {"unit_id": uuid} · clinica: {"clinic_id": uuid} · rh: {"unit_id": text (slug em units.id)}
  config jsonb not null default '{}'::jsonb,
  rotulo text,
  created_at timestamptz not null default now(),
  unique (empresa_id, tipo)
);

create table if not exists public.sim_realizado_mensal (
  empresa_id uuid not null references public.sim_empresa(id) on delete cascade,
  competencia date not null check (competencia = date_trunc('month', competencia)::date),
  -- Receita (R$, regime de caixa pelo dia do negócio / pagamento)
  receita_bruta numeric(14,2), receita_servicos numeric(14,2), receita_produtos numeric(14,2),
  descontos numeric(14,2), cancelamentos numeric(14,2), qtd_pedidos integer,
  -- Mix de pagamento (R$ recebidos no mês)
  receita_dinheiro numeric(14,2), receita_pix numeric(14,2), receita_debito numeric(14,2),
  receita_credito numeric(14,2), receita_voucher numeric(14,2), receita_prazo numeric(14,2),
  inadimplencia numeric(14,2), glosas numeric(14,2),
  -- Custos variáveis
  compras numeric(14,2), frete numeric(14,2), comissoes numeric(14,2), impostos_vendas numeric(14,2), ir_csll numeric(14,2),
  -- Pessoal (competência)
  folha numeric(14,2), encargos numeric(14,2), temporarios numeric(14,2), pro_labore numeric(14,2), repasses_terapeutas numeric(14,2),
  -- Fixos
  aluguel numeric(14,2), manutencao numeric(14,2), fixos_outros numeric(14,2), marketing numeric(14,2), distribuicao numeric(14,2),
  -- Posições no fim do mês (snapshot)
  caixa_final numeric(14,2), contas_receber numeric(14,2), contas_pagar numeric(14,2), estoque numeric(14,2),
  passivo_prepago numeric(14,2), quebra_caixa numeric(14,2),
  campos jsonb not null default '{}'::jsonb,
  detalhes jsonb not null default '{}'::jsonb,
  status text not null default 'vazio' check (status in ('vazio','parcial','ok')),
  fechado boolean not null default false,
  sincronizado_em timestamptz,
  updated_at timestamptz not null default now(),
  primary key (empresa_id, competencia)
);

create table if not exists public.sim_sincronizacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.sim_empresa(id) on delete cascade,
  competencias date[] not null,
  origem text not null check (origem in ('cron','manual')),
  disparado_por text,
  status text not null default 'executando' check (status in ('executando','ok','parcial','erro')),
  resultado jsonb not null default '{}'::jsonb,
  erro text,
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz
);
create index if not exists sim_sincronizacao_empresa_idx on public.sim_sincronizacao (empresa_id, iniciado_em desc);
create index if not exists sim_sincronizacao_iniciado_idx on public.sim_sincronizacao (iniciado_em desc);

alter table public.sim_fonte_dados enable row level security;
alter table public.sim_realizado_mensal enable row level security;
alter table public.sim_sincronizacao enable row level security;

drop policy if exists sim_fonte_dados_autorizados on public.sim_fonte_dados;
create policy sim_fonte_dados_autorizados on public.sim_fonte_dados
  for all to authenticated using (public.sim_autorizado()) with check (public.sim_autorizado());
-- realizado e log: leitura para autorizados; escrita só pelas funções abaixo / service_role
drop policy if exists sim_realizado_mensal_select on public.sim_realizado_mensal;
create policy sim_realizado_mensal_select on public.sim_realizado_mensal for select to authenticated using (public.sim_autorizado());
drop policy if exists sim_sincronizacao_select on public.sim_sincronizacao;
create policy sim_sincronizacao_select on public.sim_sincronizacao for select to authenticated using (public.sim_autorizado());

-- ---------------------------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------------------------
-- Lista branca das colunas numéricas de sim_realizado_mensal (na ordem do catálogo da UI).
create or replace function public.sim_realizado_colunas() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'receita_bruta','receita_servicos','receita_produtos','descontos','cancelamentos','qtd_pedidos',
    'receita_dinheiro','receita_pix','receita_debito','receita_credito','receita_voucher','receita_prazo','inadimplencia','glosas',
    'compras','frete','comissoes','impostos_vendas','ir_csll',
    'folha','encargos','temporarios','pro_labore','repasses_terapeutas',
    'aluguel','manutencao','fixos_outros','marketing','distribuicao',
    'caixa_final','contas_receber','contas_pagar','estoque','passivo_prepago','quebra_caixa'
  ]::text[]
$$;

-- Entrada de proveniência de um campo.
create or replace function public.sim_realizado_campo(p_fonte text, p_status text, p_obs text default null) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('fonte', p_fonte, 'status', p_status, 'obs', p_obs, 'atualizado_em', now())
$$;

-- Status da linha a partir dos campos: ok | parcial | vazio.
create or replace function public.sim_realizado_status(p_campos jsonb) returns text
language sql immutable set search_path = '' as $$
  with s as (select value->>'status' as st from jsonb_each(coalesce(p_campos, '{}'::jsonb)))
  select case
    when not exists (select 1 from s where st in ('ok','manual','parcial')) then 'vazio'
    when exists (select 1 from s where st in ('sem_dados','parcial')) then 'parcial'
    else 'ok' end
$$;

-- ---------------------------------------------------------------------------------------------
-- Extração do PDV (fa_kiosk_*): uma unidade × uma competência → {"valores": {...}, "campos": {...}}
-- Espelha lib/finance-hub/pos-data.ts da Clínica, mas separa por unit_id (o Circuito tem unidade própria).
-- ---------------------------------------------------------------------------------------------
create or replace function public.sim_extrair_pdv(p_unit_id uuid, p_competencia date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ini date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  v_corrente boolean := date_trunc('month', p_competencia)::date = date_trunc('month', (now() at time zone 'America/Belem'))::date;
  v_fonte constant text := 'pdv';
  v_valores jsonb := '{}'::jsonb;
  v_campos jsonb := '{}'::jsonb;
  v_unit_nome text;
  r record;
  v_pag record;
  v_canc numeric;
  v_compras numeric; v_n_entradas int;
  v_folha numeric;
  v_quebra numeric; v_turnos int;
  v_estoque numeric; v_prepago numeric;
  c text;
begin
  select name into v_unit_nome from fa_kiosk_units where id = p_unit_id;
  if v_unit_nome is null then raise exception 'unidade % não existe no PDV', p_unit_id; end if;

  -- Receita reconhecida: pedidos PAGA pelo dia do negócio (business_date já é America/Belem, corte 04h)
  select count(distinct o.id) as pedidos,
         coalesce(sum(i.total_cents), 0) / 100.0 as bruta,
         coalesce(sum(i.total_cents) filter (where i.item_nature = 'SERVICO'), 0) / 100.0 as servicos,
         coalesce(sum(i.total_cents) filter (where i.item_nature = 'PRODUTO'), 0) / 100.0 as produtos,
         coalesce(sum(greatest(coalesce(i.list_unit_price_cents, i.unit_price_cents) - i.unit_price_cents, 0) * i.quantity), 0) / 100.0 as descontos
    into r
    from fa_kiosk_orders o join fa_kiosk_order_items i on i.order_id = o.id
   where o.unit_id = p_unit_id and o.status = 'PAGA' and o.business_date >= v_ini and o.business_date < v_fim;

  if r.pedidos = 0 then
    foreach c in array array['receita_bruta','receita_servicos','receita_produtos','descontos','qtd_pedidos',
                             'receita_dinheiro','receita_pix','receita_debito','receita_credito','receita_voucher','receita_prazo'] loop
      v_valores := v_valores || jsonb_build_object(c, null);
      v_campos := v_campos || jsonb_build_object(c, sim_realizado_campo(v_fonte, 'sem_dados', 'nenhum pedido pago no mês'));
    end loop;
  else
    v_valores := v_valores || jsonb_build_object(
      'receita_bruta', r.bruta, 'receita_servicos', r.servicos, 'receita_produtos', r.produtos,
      'descontos', r.descontos, 'qtd_pedidos', r.pedidos);
    foreach c in array array['receita_bruta','receita_servicos','receita_produtos','qtd_pedidos'] loop
      v_campos := v_campos || jsonb_build_object(c, sim_realizado_campo(v_fonte, 'ok', 'pedidos pagos por dia do negócio'));
    end loop;
    v_campos := v_campos || jsonb_build_object('descontos', sim_realizado_campo(v_fonte, 'ok', 'preço de lista − preço praticado'));

    -- Mix por forma de pagamento (regime de caixa) dos mesmos pedidos
    select coalesce(sum(p.amount_cents) filter (where p.method = 'DINHEIRO'), 0) / 100.0 as dinheiro,
           coalesce(sum(p.amount_cents) filter (where p.method = 'PIX'), 0) / 100.0 as pix,
           coalesce(sum(p.amount_cents) filter (where p.method = 'DEBITO'), 0) / 100.0 as debito,
           coalesce(sum(p.amount_cents) filter (where p.method = 'CREDITO'), 0) / 100.0 as credito,
           coalesce(sum(p.amount_cents) filter (where p.method = 'VOUCHER'), 0) / 100.0 as voucher,
           coalesce(sum(p.amount_cents) filter (where p.method not in ('DINHEIRO','PIX','DEBITO','CREDITO','VOUCHER')), 0) / 100.0 as outros
      into v_pag
      from fa_kiosk_payments p join fa_kiosk_orders o on o.id = p.order_id
     where o.unit_id = p_unit_id and o.status = 'PAGA' and o.business_date >= v_ini and o.business_date < v_fim;
    v_valores := v_valores || jsonb_build_object(
      'receita_dinheiro', v_pag.dinheiro, 'receita_pix', v_pag.pix, 'receita_debito', v_pag.debito,
      'receita_credito', v_pag.credito, 'receita_voucher', v_pag.voucher, 'receita_prazo', 0);
    foreach c in array array['receita_dinheiro','receita_pix','receita_debito','receita_credito','receita_voucher'] loop
      v_campos := v_campos || jsonb_build_object(c, sim_realizado_campo(v_fonte, 'ok', 'fa_kiosk_payments.method'));
    end loop;
    v_campos := v_campos || jsonb_build_object('receita_prazo', sim_realizado_campo(v_fonte, 'ok', 'o PDV não vende a prazo'));
    if v_pag.outros > 0 then
      v_campos := v_campos || jsonb_build_object('receita_voucher', sim_realizado_campo(v_fonte, 'parcial', format('R$ %s em métodos não mapeados', v_pag.outros)));
    end if;
  end if;

  -- Cancelamentos
  select coalesce(sum(o.total_cents), 0) / 100.0 into v_canc
    from fa_kiosk_orders o
   where o.unit_id = p_unit_id and o.status = 'CANCELADA' and o.business_date >= v_ini and o.business_date < v_fim;
  v_valores := v_valores || jsonb_build_object('cancelamentos', v_canc);
  v_campos := v_campos || jsonb_build_object('cancelamentos', sim_realizado_campo(v_fonte, 'ok', 'pedidos cancelados no mês'));

  -- Compras: entradas de estoque × custo cadastrado (proxy)
  select count(*), coalesce(sum(m.delta * coalesce(p.cost_cents, 0)), 0) / 100.0
    into v_n_entradas, v_compras
    from fa_kiosk_stock_movements m join fa_kiosk_products p on p.id = m.product_id
   where p.unit_id = p_unit_id and m.delta > 0
     and to_timestamp(m.at_ms / 1000.0) at time zone 'America/Belem' >= v_ini
     and to_timestamp(m.at_ms / 1000.0) at time zone 'America/Belem' < v_fim;
  if v_n_entradas = 0 then
    v_valores := v_valores || jsonb_build_object('compras', null);
    v_campos := v_campos || jsonb_build_object('compras', sim_realizado_campo(v_fonte, 'sem_dados', 'nenhuma entrada de estoque registrada no mês'));
  else
    v_valores := v_valores || jsonb_build_object('compras', v_compras);
    v_campos := v_campos || jsonb_build_object('compras', sim_realizado_campo(v_fonte, 'parcial', 'entradas de estoque × custo cadastrado do produto'));
  end if;

  -- Folha: fechamento de folha do PDV
  select sum(total_cents) / 100.0 into v_folha
    from fa_kiosk_payroll_runs
   where unit_id = p_unit_id and year = extract(year from v_ini)::int and month = extract(month from v_ini)::int;
  if v_folha is null then
    v_valores := v_valores || jsonb_build_object('folha', null);
    v_campos := v_campos || jsonb_build_object('folha', sim_realizado_campo(v_fonte, 'sem_dados', 'sem fechamento de folha no PDV para o mês'));
  else
    v_valores := v_valores || jsonb_build_object('folha', v_folha);
    v_campos := v_campos || jsonb_build_object('folha', sim_realizado_campo(v_fonte, 'parcial', 'fechamento de folha do PDV (sem encargos)'));
  end if;

  -- Quebra de caixa dos turnos fechados
  select count(*), coalesce(sum(cash_break_cents), 0) / 100.0 into v_turnos, v_quebra
    from fa_kiosk_shifts
   where unit_id = p_unit_id and status = 'FECHADO' and business_date >= v_ini and business_date < v_fim;
  if v_turnos = 0 then
    v_valores := v_valores || jsonb_build_object('quebra_caixa', null);
    v_campos := v_campos || jsonb_build_object('quebra_caixa', sim_realizado_campo(v_fonte, 'sem_dados', 'nenhum turno fechado no mês'));
  else
    v_valores := v_valores || jsonb_build_object('quebra_caixa', v_quebra);
    v_campos := v_campos || jsonb_build_object('quebra_caixa', sim_realizado_campo(v_fonte, 'ok', format('%s turno(s) fechado(s)', v_turnos)));
  end if;

  -- Posições (só fazem sentido no mês corrente: são a foto de agora)
  if v_corrente then
    select coalesce(sum(stock * coalesce(cost_cents, 0)), 0) / 100.0 into v_estoque from fa_kiosk_products where unit_id = p_unit_id and active;
    select coalesce(sum(round(charged_cents::numeric * remaining_minutes / greatest(minutes_total, 1))), 0) / 100.0 into v_prepago
      from fa_kiosk_child_time_credits where unit_id = p_unit_id and cancelled_at_ms is null and remaining_minutes > 0;
    v_valores := v_valores || jsonb_build_object('estoque', v_estoque, 'passivo_prepago', v_prepago);
    v_campos := v_campos
      || jsonb_build_object('estoque', sim_realizado_campo(v_fonte, 'parcial', 'estoque atual × custo cadastrado (foto na sincronização)'))
      || jsonb_build_object('passivo_prepago', sim_realizado_campo(v_fonte, 'parcial', 'créditos de tempo pré-pagos ainda não consumidos (foto na sincronização)'));
  else
    v_valores := v_valores || jsonb_build_object('estoque', null, 'passivo_prepago', null);
    v_campos := v_campos
      || jsonb_build_object('estoque', sim_realizado_campo(v_fonte, 'sem_dados', 'o PDV não guarda a posição de estoque de meses passados'))
      || jsonb_build_object('passivo_prepago', sim_realizado_campo(v_fonte, 'sem_dados', 'o PDV não guarda a posição de créditos de meses passados'));
  end if;

  -- O PDV não tem estes dados
  foreach c in array array['inadimplencia','glosas','frete','comissoes','impostos_vendas','ir_csll','encargos','temporarios','pro_labore',
                           'repasses_terapeutas','aluguel','manutencao','fixos_outros','marketing','distribuicao',
                           'caixa_final','contas_receber','contas_pagar'] loop
    v_valores := v_valores || jsonb_build_object(c, null);
    v_campos := v_campos || jsonb_build_object(c, sim_realizado_campo(v_fonte, 'sem_fonte', 'o PDV não registra este dado'));
  end loop;

  return jsonb_build_object('valores', v_valores, 'campos', v_campos, 'unidade', v_unit_nome);
end $$;
revoke all on function public.sim_extrair_pdv(uuid, date) from public, anon, authenticated;
grant execute on function public.sim_extrair_pdv(uuid, date) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Gravação com regras de mesclagem (só service_role / Edge Function)
--   - campo com status 'manual' não é sobrescrito, salvo p_sobrescrever
--   - mês fechado não é tocado, salvo p_sobrescrever
--   - chaves fora da lista branca são ignoradas
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
  k text; v jsonb;
begin
  insert into sim_realizado_mensal (empresa_id, competencia) values (p_empresa_id, v_comp) on conflict do nothing;
  select * into v_linha from sim_realizado_mensal where empresa_id = p_empresa_id and competencia = v_comp for update;

  if v_linha.fechado and not p_sobrescrever then return v_linha; end if;

  for k, v in select * from jsonb_each(coalesce(p_valores, '{}'::jsonb)) loop
    if not (k = any (sim_realizado_colunas())) then continue; end if;
    if not p_sobrescrever and v_linha.campos->k->>'status' = 'manual' then continue; end if;
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
    compras = v_linha.compras, frete = v_linha.frete, comissoes = v_linha.comissoes, impostos_vendas = v_linha.impostos_vendas, ir_csll = v_linha.ir_csll,
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

-- ---------------------------------------------------------------------------------------------
-- Edição manual de uma célula (usuário autorizado). p_valor null limpa e volta a 'sem_dados'.
-- ---------------------------------------------------------------------------------------------
create or replace function public.sim_editar_realizado(p_empresa_id uuid, p_competencia date, p_campo text, p_valor numeric, p_obs text default null)
returns public.sim_realizado_mensal
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_comp date := date_trunc('month', p_competencia)::date;
  v_linha public.sim_realizado_mensal;
  v_campo jsonb;
  v_fonte text;
begin
  if not public.sim_autorizado() then raise exception 'não autorizado'; end if;
  if not (p_campo = any (sim_realizado_colunas())) then raise exception 'campo inválido: %', p_campo; end if;
  if not exists (select 1 from sim_empresa where id = p_empresa_id) then raise exception 'empresa não encontrada'; end if;

  insert into sim_realizado_mensal (empresa_id, competencia) values (p_empresa_id, v_comp) on conflict do nothing;
  select * into v_linha from sim_realizado_mensal where empresa_id = p_empresa_id and competencia = v_comp for update;
  v_fonte := coalesce(v_linha.campos->p_campo->>'fonte', 'manual');

  if p_valor is null then
    v_campo := sim_realizado_campo(v_fonte, 'sem_dados', coalesce(p_obs, 'limpo manualmente'));
  else
    v_campo := sim_realizado_campo('manual', 'manual', coalesce(p_obs, 'digitado no painel Realizado'));
  end if;

  execute format('update sim_realizado_mensal set %I = $1, campos = campos || $2, updated_at = now() where empresa_id = $3 and competencia = $4', p_campo)
    using p_valor, jsonb_build_object(p_campo, v_campo), p_empresa_id, v_comp;
  update sim_realizado_mensal set status = sim_realizado_status(campos) where empresa_id = p_empresa_id and competencia = v_comp
    returning * into v_linha;
  return v_linha;
end $$;
revoke all on function public.sim_editar_realizado(uuid, date, text, numeric, text) from public, anon;
grant execute on function public.sim_editar_realizado(uuid, date, text, numeric, text) to authenticated, service_role;

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
  update sim_realizado_mensal set fechado = p_fechado, updated_at = now()
   where empresa_id = p_empresa_id and competencia = v_comp returning * into v_linha;
  return v_linha;
end $$;
revoke all on function public.sim_fechar_realizado(uuid, date, boolean) from public, anon;
grant execute on function public.sim_fechar_realizado(uuid, date, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- sim_salvar_rascunho: reemitida para persistir config.alimentacao (proveniência dos campos alimentados)
-- ---------------------------------------------------------------------------------------------
create or replace function public.sim_salvar_rascunho(p_id uuid, p jsonb)
returns void language plpgsql set search_path = public as $$
begin
  if not public.sim_autorizado() then raise exception 'não autorizado'; end if;
  update sim_simulacao
     set nome = p->>'nome', data_base = (p->>'dataBase')::date,
         horizonte_meses = (p->>'horizonte')::smallint, updated_at = now(),
         config = jsonb_set(coalesce(config, '{}'::jsonb), '{alimentacao}', coalesce(p->'alimentacao', 'null'::jsonb))
   where id = p_id;
  if not found then raise exception 'simulação não encontrada'; end if;

  insert into sim_premissas(simulacao_id, historico_12m, abertura, projecao)
  values (p_id, p->'historico', p->'abertura', p->'projecao')
  on conflict (simulacao_id) do update
    set historico_12m = excluded.historico_12m, abertura = excluded.abertura, projecao = excluded.projecao;

  delete from sim_divida where simulacao_id = p_id;
  delete from sim_contingencia where simulacao_id = p_id;
  delete from sim_evento where simulacao_id = p_id;
  delete from sim_cenario where simulacao_id = p_id;

  insert into sim_divida(simulacao_id, ordem, tipo, descricao, saldo, taxa, unidade_taxa, prazo_meses, sistema, carencia_meses, mes_inicio, parcelada)
  select p_id, (o-1)::smallint, d->>'tipo', d->>'descricao', (d->>'saldo')::numeric,
         coalesce((d->>'taxa')::numeric, 0), d->>'unidadeTaxa', (d->>'prazoMeses')::smallint,
         coalesce(d->>'sistema', 'price'), coalesce((d->>'carenciaMeses')::smallint, 0),
         coalesce((d->>'mesInicio')::smallint, 0), coalesce((d->>'parcelada')::boolean, true)
    from jsonb_array_elements(coalesce(p->'dividas', '[]'::jsonb)) with ordinality as t(d, o)
   where coalesce((d->>'saldo')::numeric, 0) > 0 and coalesce((d->>'prazoMeses')::int, 0) > 0;

  insert into sim_contingencia(simulacao_id, ordem, natureza, polo, valor, probabilidade, mes_desfecho)
  select p_id, (o-1)::smallint, c->>'natureza', c->>'polo', coalesce((c->>'valor')::numeric, 0),
         c->>'probabilidade', (c->>'mesDesfecho')::smallint
    from jsonb_array_elements(coalesce(p->'contingencias', '[]'::jsonb)) with ordinality as t(c, o);

  insert into sim_evento(simulacao_id, ordem, tipo, mes, valor, parametros)
  select p_id, (o-1)::smallint, e->>'tipo', (e->>'mes')::smallint, coalesce((e->>'valor')::numeric, 0),
         coalesce(e->'parametros', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p->'eventos', '[]'::jsonb)) with ordinality as t(e, o);

  insert into sim_cenario(simulacao_id, ordem, tipo, nome, descricao, alavancas)
  select p_id, (o-1)::smallint, k->>'tipo', k->>'nome', nullif(k->>'descricao', ''), k->'alavancas'
    from jsonb_array_elements(coalesce(p->'cenarios', '[]'::jsonb)) with ordinality as t(k, o);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Escuta mensal: o job roda todo dia às 03:15 (Belém); a função só dispara no 4º último dia do mês.
-- Segredo `sim_ops_key` no Vault (ops manual):
--   select vault.create_secret('<chave>', 'sim_ops_key', 'x-ops-key do sim-sincronizar');
-- ---------------------------------------------------------------------------------------------
create or replace function public.sim_cron_sincronizar(p_forcar boolean default false) returns text
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_hoje date := (now() at time zone 'America/Belem')::date;
  v_ultimo date := (date_trunc('month', (now() at time zone 'America/Belem')) + interval '1 month - 1 day')::date;
  v_chave text;
  v_req bigint;
begin
  if not p_forcar and v_hoje <> v_ultimo - 3 then
    return format('skip: %s não é o 4º último dia do mês (%s)', v_hoje, v_ultimo - 3);
  end if;
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'sim_ops_key';
  if v_chave is null then return 'skip: segredo sim_ops_key ausente no Vault'; end if;
  select net.http_post(
    url := 'https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/sim-sincronizar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ops-key', v_chave),
    body := jsonb_build_object('origem', 'cron'),
    timeout_milliseconds := 60000
  ) into v_req;
  return format('disparado (net request %s)', v_req);
end $$;
revoke all on function public.sim_cron_sincronizar(boolean) from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'sim-sincronizar-mensal';
  -- 06:15 UTC = 03:15 America/Belem (sem horário de verão)
  perform cron.schedule('sim-sincronizar-mensal', '15 6 * * *', $cron$ select public.sim_cron_sincronizar(); $cron$);
end $$;
