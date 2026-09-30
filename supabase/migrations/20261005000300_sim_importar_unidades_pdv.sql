-- Cria uma empresa (e a fonte PDV) para cada unidade do PDV que ainda não é alimentada.
-- Os dados cadastrais vêm da própria unidade (razão social, CNPJ, endereço, telefone, CRT);
-- o app completa o resto (porte, início, atividade) consultando o CNPJ na Receita.
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
    insert into sim_fonte_dados (empresa_id, tipo, config, rotulo)
    values (v_id, 'pdv', jsonb_build_object('unit_id', u.id::text), 'PDV — ' || u.name);
    empresa_id := v_id; cnpj := nullif(regexp_replace(coalesce(u.cnpj, ''), '\D', '', 'g'), ''); unidade := u.name;
    return next;
  end loop;
end $$;
revoke all on function public.sim_importar_unidades_pdv() from public, anon;
grant execute on function public.sim_importar_unidades_pdv() to authenticated, service_role;
