-- BASELINE — retrato do schema do Simulador que já estava aplicado em produção
-- (projeto ivjvpdzsfjdpyabbzzuj) antes de o repositório passar a versionar migrations.
--
-- Já está aplicado. Ao inicializar o histórico local, registrar sem executar:
--   supabase migration repair --status applied 20260901000000
-- Tudo aqui é idempotente (if not exists / or replace) por segurança.

create or replace function public.sim_autorizado()
returns boolean language sql stable set search_path = '' as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in ('brunofreitasbm@gmail.com', 'isabella.vgoncalves@gmail.com')
$$;

create table if not exists public.sim_empresa (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  razao_social text not null,
  cnpj text,
  segmento text,
  regime_tributario text not null check (regime_tributario in ('simples','presumido','real','mei')),
  atividade_presumido text check (atividade_presumido in ('comercio_industria','servicos')),
  uf char(2),
  cidade text,
  ano_inicio smallint,
  created_at timestamptz not null default now(),
  nome_fantasia text,
  porte text check (porte in ('mei','micro','pequena','media','grande')),
  responsavel text,
  email_contato text,
  telefone text,
  site text,
  descricao_atividade text,
  consentimento_em timestamptz
);
-- índice único parcial em cnpj: removido em 20261005000000_sim_realizado.sql (operações distintas podem dividir o CNPJ)
create unique index if not exists sim_empresa_cnpj_key on public.sim_empresa (cnpj) where cnpj is not null;

create table if not exists public.sim_simulacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.sim_empresa(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id),
  nome text not null,
  data_base date not null,
  horizonte_meses smallint not null default 12 check (horizonte_meses between 1 and 60),
  schema_version smallint not null default 1,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sim_simulacao_empresa_id_idx on public.sim_simulacao (empresa_id);

create table if not exists public.sim_premissas (
  simulacao_id uuid primary key references public.sim_simulacao(id) on delete cascade,
  historico_12m jsonb not null,
  abertura jsonb not null,
  projecao jsonb not null
);

create table if not exists public.sim_divida (
  id uuid primary key default gen_random_uuid(),
  simulacao_id uuid not null references public.sim_simulacao(id) on delete cascade,
  ordem smallint not null default 0,
  tipo text not null check (tipo in ('bancaria','tributaria')),
  descricao text,
  saldo numeric(18,2) not null check (saldo > 0),
  taxa numeric(10,6) not null check (taxa >= 0),
  unidade_taxa text not null check (unidade_taxa in ('am','aa')),
  prazo_meses smallint not null check (prazo_meses > 0),
  sistema text not null default 'price' check (sistema in ('price','sac','bullet')),
  carencia_meses smallint not null default 0,
  mes_inicio smallint not null default 0,
  parcelada boolean not null default true
);
create index if not exists sim_divida_simulacao_id_idx on public.sim_divida (simulacao_id);

create table if not exists public.sim_contingencia (
  id uuid primary key default gen_random_uuid(),
  simulacao_id uuid not null references public.sim_simulacao(id) on delete cascade,
  ordem smallint not null default 0,
  natureza text not null check (natureza in ('trabalhista','civel','tributaria')),
  polo text not null check (polo in ('ativo','passivo')),
  valor numeric(18,2) not null,
  probabilidade text not null check (probabilidade in ('provavel','possivel','remota')),
  mes_desfecho smallint
);
create index if not exists sim_contingencia_simulacao_id_idx on public.sim_contingencia (simulacao_id);

create table if not exists public.sim_evento (
  id uuid primary key default gen_random_uuid(),
  simulacao_id uuid not null references public.sim_simulacao(id) on delete cascade,
  ordem smallint not null default 0,
  tipo text not null check (tipo in ('capex','aporte','contratacao','reajusteFolha','vendaAtivo')),
  mes smallint not null check (mes >= 1),
  valor numeric(18,2) not null,
  parametros jsonb not null default '{}'::jsonb
);
create index if not exists sim_evento_simulacao_id_idx on public.sim_evento (simulacao_id);

create table if not exists public.sim_cenario (
  id uuid primary key default gen_random_uuid(),
  simulacao_id uuid not null references public.sim_simulacao(id) on delete cascade,
  tipo text not null check (tipo in ('atual','pessimista','otimista','custom')),
  nome text not null,
  descricao text,
  alavancas jsonb not null,
  ordem smallint not null default 0
);
create unique index if not exists sim_cenario_padrao on public.sim_cenario (simulacao_id, tipo) where tipo <> 'custom';

create table if not exists public.sim_versao (
  id uuid primary key default gen_random_uuid(),
  simulacao_id uuid not null references public.sim_simulacao(id) on delete cascade,
  numero integer not null,
  label text,
  snapshot jsonb not null,
  engine_version text not null,
  resultado jsonb not null,
  created_at timestamptz not null default now(),
  unique (simulacao_id, numero)
);

-- RLS: tudo restrito aos e-mails autorizados
do $$
declare t text;
begin
  foreach t in array array['sim_empresa','sim_simulacao','sim_premissas','sim_divida','sim_contingencia','sim_evento','sim_cenario','sim_versao'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_autorizados') then
      execute format('create policy %I on public.%I for all to authenticated using (public.sim_autorizado()) with check (public.sim_autorizado())', t || '_autorizados', t);
    end if;
  end loop;
end $$;

-- Salva o rascunho completo numa transação (PUT /api/simulacoes/:id).
-- Versão original; reemitida em 20261005000000_sim_realizado.sql para gravar config.alimentacao.
create or replace function public.sim_salvar_rascunho(p_id uuid, p jsonb)
returns void language plpgsql set search_path = public as $$
begin
  if not public.sim_autorizado() then raise exception 'não autorizado'; end if;
  update sim_simulacao
     set nome = p->>'nome', data_base = (p->>'dataBase')::date,
         horizonte_meses = (p->>'horizonte')::smallint, updated_at = now()
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
