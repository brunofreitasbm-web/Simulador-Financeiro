-- =============================================================================================
-- Fonte de dados 'github' — o Simulador lê o fechamento publicado pelos repositórios-fonte.
--
-- Cada sistema do grupo versiona `fechamento/AAAA-MM.json` no próprio repositório (ver
-- docs/FECHAMENTO-GITHUB.md). A Edge Function sim-sincronizar busca esse arquivo e grava em
-- sim_realizado_mensal pela mesma RPC sim_gravar_realizado, com as mesmas regras de mesclagem
-- (célula 'manual' não é sobrescrita; mês fechado não é tocado).
--
-- Duas mudanças de schema:
--   1. o tipo aceita 'github';
--   2. `(empresa_id, tipo)` deixa de ser único — a mesma empresa pode ter o PDV de um repositório
--      e a folha de outro (Playground: faca_amigos + controle-de-estagiario). A unicidade passa a
--      ser `(empresa_id, tipo, chave)`, onde `chave` é a identidade da unidade naquela fonte.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- 1. O tipo aceita 'github'
--    A tabela foi criada com a lista antiga; o drop pelo nome cobre o caso normal. O bloco abaixo
--    remove qualquer outra check que ainda restrinja `tipo`, para uma constraint com nome
--    inesperado não passar batido e recusar 'github' em silêncio.
-- ---------------------------------------------------------------------------------------------
alter table public.sim_fonte_dados drop constraint if exists sim_fonte_dados_tipo_check;

do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public' and rel.relname = 'sim_fonte_dados'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%tipo%pdv%'
  loop
    execute format('alter table public.sim_fonte_dados drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.sim_fonte_dados
  add constraint sim_fonte_dados_tipo_check check (tipo in ('pdv', 'clinica', 'rh', 'github'));

-- ---------------------------------------------------------------------------------------------
-- 2. Chave natural da fonte e nova unicidade
-- ---------------------------------------------------------------------------------------------
alter table public.sim_fonte_dados add column if not exists chave text not null default '';

-- Retrocompatibilidade: as fontes que já existiam passam a ter chave explícita.
update public.sim_fonte_dados
   set chave = case
                 when tipo in ('pdv', 'rh') then coalesce(config->>'unit_id', '')
                 when tipo = 'clinica'      then coalesce(config->>'clinic_id', '')
                 else ''
               end
 where chave = '';

alter table public.sim_fonte_dados drop constraint if exists sim_fonte_dados_empresa_id_tipo_key;
alter table public.sim_fonte_dados drop constraint if exists sim_fonte_dados_empresa_tipo_chave_key;
alter table public.sim_fonte_dados
  add constraint sim_fonte_dados_empresa_tipo_chave_key unique (empresa_id, tipo, chave);

comment on column public.sim_fonte_dados.chave is
  'Identidade da unidade na fonte. pdv/rh: unit_id · clinica: clinic_id · github: repo (owner/nome).';
comment on column public.sim_fonte_dados.config is
  'Parâmetros da fonte. pdv: {"unit_id"} · clinica: {"clinic_id"} · rh: {"unit_id"} · '
  'github: {"repo":"owner/nome","unidade":"<chave no artefato>","branch":"main","caminho":"fechamento/AAAA-MM.json"}. '
  'Em github, `unidade` casa com unidades[].chave (ou o rótulo) do fechamento publicado.';

-- ---------------------------------------------------------------------------------------------
-- 3. O importador de unidades do PDV passa a gravar a chave
--    Sem isso, a fonte criada por ele ficaria com chave '' e a próxima gravação pela tela
--    (que usa o unit_id como chave) criaria uma linha duplicada antes de limpar a antiga.
--    `create or replace` mantém a assinatura; só a lista de colunas do insert muda.
-- ---------------------------------------------------------------------------------------------
create or replace function public.sim_importar_unidades_pdv()
returns table (empresa_id uuid, cnpj text, unidade text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u record;
  v_id uuid;
begin
  if not public.sim_autorizado() then raise exception 'não autorizado'; end if;
  for u in
    select * from fa_kiosk_units k
     where not exists (select 1 from sim_fonte_dados f where f.tipo = 'pdv' and f.config->>'unit_id' = k.id::text)
     order by k.name
  loop
    insert into sim_empresa (razao_social, nome_fantasia, cnpj, segmento, regime_tributario, uf, cidade, telefone)
    values (
      coalesce(nullif(trim(u.razao_social), ''), u.name),
      u.name,
      nullif(regexp_replace(coalesce(u.cnpj, ''), '\D', '', 'g'), ''),
      'outro',
      case when u.crt = 3 then 'presumido' else 'simples' end,
      nullif(upper(left(coalesce(u.end_uf, ''), 2)), ''),
      nullif(initcap(lower(coalesce(u.end_municipio_nome, ''))), ''),
      nullif(coalesce(u.fone, u.phone), '')
    ) returning id into v_id;
    insert into sim_fonte_dados (empresa_id, tipo, chave, config, rotulo)
    values (v_id, 'pdv', u.id::text, jsonb_build_object('unit_id', u.id::text), 'PDV — ' || u.name);
    empresa_id := v_id; cnpj := nullif(regexp_replace(coalesce(u.cnpj, ''), '\D', '', 'g'), ''); unidade := u.name;
    return next;
  end loop;
end $$;
revoke all on function public.sim_importar_unidades_pdv() from public, anon;
grant execute on function public.sim_importar_unidades_pdv() to authenticated, service_role;
