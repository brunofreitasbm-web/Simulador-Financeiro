-- PROJETO B (vththexblpxwocbowhsv: Gestão de Pessoas + Clínica) — aplicar lá, não no projeto do Simulador (ivjvpdzsfjdpyabbzzuj).
--
-- Extração restrita para o Simulador Financeiro. A Edge Function `sim-sincronizar` chama estas duas RPCs com a chave do hub
-- (Vault, segredo `sim_hub_key`); elas devolvem só TOTAIS do mês, no mesmo formato de sim_extrair_pdv
-- ({"valores": {...}, "campos": {...}}). Nenhum dado de paciente, funcionário ou fornecedor sai daqui, e o Simulador
-- não precisa mais da service-role deste projeto.
--
-- Pré-requisito: segredo no Vault deste projeto
--   select vault.create_secret('<mesma chave do projeto do Simulador (sim_hub_key)>', 'sim_hub_key', 'chave do hub financeiro');

-- ---------------------------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------------------------
create or replace function public.sim_hub_chave_ok(p_chave text) returns void
language plpgsql stable security definer set search_path = public, vault, pg_temp as $$
begin
  if coalesce(p_chave, '') = '' or not exists (select 1 from vault.decrypted_secrets where name = 'sim_hub_key' and decrypted_secret = p_chave) then
    raise exception 'chave do hub inválida' using errcode = '28000';
  end if;
end $$;
revoke all on function public.sim_hub_chave_ok(text) from public, anon, authenticated;

-- Aceita '1234.56', '1.234,56' e 'R$ 1.234,56'; devolve null se não for número.
create or replace function public.sim_hub_num(p text) returns numeric
language plpgsql immutable set search_path = '' as $$
declare s text := regexp_replace(coalesce(p, ''), '[^0-9,.\-]', '', 'g');
begin
  if s = '' then return null; end if;
  if position(',' in s) > 0 then s := replace(replace(s, '.', ''), ',', '.'); end if;
  if s ~ '^-?[0-9]+(\.[0-9]+)?$' then return s::numeric; end if;
  return null;
end $$;

-- Acumulador {"valores":{},"campos":{}}: grava valor + proveniência de um campo.
create or replace function public.sim_hub_put(p_acc jsonb, p_k text, p_val numeric, p_fonte text, p_status text, p_obs text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'valores', coalesce(p_acc->'valores', '{}'::jsonb) || jsonb_build_object(p_k, p_val),
    'campos', coalesce(p_acc->'campos', '{}'::jsonb) || jsonb_build_object(p_k,
      jsonb_build_object('fonte', p_fonte, 'status', p_status, 'obs', p_obs, 'atualizado_em', now())))
$$;

-- ---------------------------------------------------------------------------------------------
-- RH: folha (CLT), encargos e temporários (estagiários + freelances) de uma unidade em uma competência
--   - folha:      documento do contador (ok) → senão Σ salário-base dos ativos (estimado)
--   - encargos:   documento do contador (ok) → senão sem_dados (o Simulador estima folha × % do modelo de custos)
--   - temporarios: freelances pagos no mês (ok) + bolsas dos estagiários ativos (estimado)
--   Posições de hoje (salário-base, bolsas) só valem para o mês corrente e o anterior: meses antigos NÃO são
--   preenchidos com o quadro atual.
-- ---------------------------------------------------------------------------------------------
create or replace function public.sim_extrair_rh(p_chave text, p_unit_id text, p_competencia date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ini date := date_trunc('month', p_competencia)::date;
  v_ts_ini timestamptz := v_ini::timestamp at time zone 'America/Belem';
  v_ts_fim timestamptz := (v_ini + interval '1 month')::timestamp at time zone 'America/Belem';
  v_comp text := to_char(v_ini, 'YYYY-MM');
  v_recente boolean := v_ini >= date_trunc('month', (now() at time zone 'America/Belem') - interval '1 month')::date;
  v_acc jsonb := jsonb_build_object('valores', '{}'::jsonb, 'campos', '{}'::jsonb);
  v_folha_docs numeric; v_n_folha int; v_enc_docs numeric; v_n_enc int; v_sem_valor int;
  v_base numeric; v_n_emp int;
  v_freela numeric; v_n_freela int; v_bolsas numeric; v_n_bolsas int; v_temp numeric;
begin
  perform sim_hub_chave_ok(p_chave);

  select coalesce(sum(sim_hub_num(meta->>'valor')) filter (where meta->>'tipo_folha' in ('mensal','adiantamento','decimo_terceiro','rescisao')), 0),
         count(*) filter (where meta->>'tipo_folha' in ('mensal','adiantamento','decimo_terceiro','rescisao') and sim_hub_num(meta->>'valor') is not null),
         coalesce(sum(sim_hub_num(meta->>'valor')) filter (where meta->>'tipo_folha' = 'encargos'), 0),
         count(*) filter (where meta->>'tipo_folha' = 'encargos' and sim_hub_num(meta->>'valor') is not null),
         count(*) filter (where meta->>'tipo_folha' in ('mensal','adiantamento','decimo_terceiro','rescisao','encargos') and sim_hub_num(meta->>'valor') is null)
    into v_folha_docs, v_n_folha, v_enc_docs, v_n_enc, v_sem_valor
    from unit_payroll_documents where unit_id = p_unit_id and meta->>'competencia' = v_comp;

  -- folha
  if v_n_folha > 0 then
    v_acc := sim_hub_put(v_acc, 'folha', round(v_folha_docs, 2), 'rh', 'ok', format('%s documento(s) de folha do contador', v_n_folha));
  elsif v_recente then
    select coalesce(sum(base_salary), 0), count(*) filter (where base_salary > 0)
      into v_base, v_n_emp
      from employees where unit_id = p_unit_id and status in ('ativo', 'ferias', 'afastado', 'aviso_previo');
    if v_base > 0 then
      v_acc := sim_hub_put(v_acc, 'folha', round(v_base, 2), 'rh', 'estimado', format('salário-base de %s CLT ativo(s); sem documento de folha do contador', v_n_emp));
    else
      v_acc := sim_hub_put(v_acc, 'folha', null, 'rh', 'sem_dados', 'sem documento de folha e sem salário-base cadastrado nos CLT ativos');
    end if;
  else
    v_acc := sim_hub_put(v_acc, 'folha', null, 'rh', 'sem_dados', 'sem documento de folha; o quadro atual não vale para meses antigos');
  end if;
  if v_sem_valor > 0 then
    v_acc := jsonb_set(v_acc, '{campos,folha,obs}', to_jsonb(coalesce(v_acc->'campos'->'folha'->>'obs', '') || format(' · %s documento(s) sem valor legível em meta.valor', v_sem_valor)));
  end if;

  -- encargos
  if v_n_enc > 0 then
    v_acc := sim_hub_put(v_acc, 'encargos', round(v_enc_docs, 2), 'rh', 'ok', 'documento de encargos do contador');
  else
    v_acc := sim_hub_put(v_acc, 'encargos', null, 'rh', 'sem_dados', 'sem documento de encargos na competência');
  end if;

  -- temporários = freelances pagos no mês + bolsas dos estagiários ativos
  select coalesce(sum(gross_amount), 0), count(*) into v_freela, v_n_freela
    from freelance_jobs where unit_id = p_unit_id and status = 'pago' and paid_at >= v_ts_ini and paid_at < v_ts_fim;
  v_bolsas := 0; v_n_bolsas := 0;
  if v_recente then
    select coalesce(sum(allowance), 0), count(*) filter (where allowance > 0) into v_bolsas, v_n_bolsas
      from interns where unit_id = p_unit_id and active;
  end if;
  v_temp := v_freela + v_bolsas;
  if v_temp > 0 then
    v_acc := sim_hub_put(v_acc, 'temporarios', round(v_temp, 2), 'rh',
      case when v_bolsas > 0 then 'estimado' else 'ok' end,
      format('%s freelance(s) pago(s) no mês (R$ %s)%s', v_n_freela, round(v_freela, 2),
             case when v_bolsas > 0 then format(' + bolsa de %s estagiário(s) ativo(s) (R$ %s, quadro atual)', v_n_bolsas, round(v_bolsas, 2)) else '' end));
  else
    v_acc := sim_hub_put(v_acc, 'temporarios', null, 'rh', 'sem_dados', 'nenhum freelance pago no mês e nenhuma bolsa de estagiário ativa');
  end if;

  return v_acc;
end $$;
revoke all on function public.sim_extrair_rh(text, text, date) from public;
grant execute on function public.sim_extrair_rh(text, text, date) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Clínica: receita por recebimento (regime de caixa, paid_at), custos por conta paga, repasses por competência
-- ---------------------------------------------------------------------------------------------
create or replace function public.sim_extrair_clinica(p_chave text, p_clinic_id uuid, p_competencia date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ini date := date_trunc('month', p_competencia)::date;
  v_fim date := (v_ini + interval '1 month')::date;
  v_ts_ini timestamptz := v_ini::timestamp at time zone 'America/Belem';
  v_ts_fim timestamptz := v_fim::timestamp at time zone 'America/Belem';
  v_hoje date := (now() at time zone 'America/Belem')::date;
  v_corrente boolean := v_ini = date_trunc('month', (now() at time zone 'America/Belem'))::date;
  v_acc jsonb := jsonb_build_object('valores', '{}'::jsonb, 'campos', '{}'::jsonb);
  v_conv numeric; v_n_conv int;
  v_part numeric; v_n_part int; v_part_pix numeric;
  v_contr numeric; v_n_contr int; v_contr_boleto numeric; v_contr_pix numeric;
  v_receita numeric;
  v_glosa numeric; v_n_glosa int;
  v_repasse numeric; v_n_repasse int;
  v_rec numeric; v_n int;
  k text; c text;
begin
  perform sim_hub_chave_ok(p_chave);

  select coalesce(sum(bi.amount), 0), count(*) into v_conv, v_n_conv
    from billing_items bi join billing_periods bp on bp.id = bi.billing_period_id join insurers i on i.id = bp.insurer_id
   where bi.status = 'pago' and i.clinic_id = p_clinic_id and bi.paid_at >= v_ts_ini and bi.paid_at < v_ts_fim;
  select coalesce(sum(pc.amount), 0), count(*), coalesce(sum(pc.amount) filter (where pc.paid_method ilike '%pix%'), 0) into v_part, v_n_part, v_part_pix
    from patient_charges pc join patients p on p.id = pc.patient_id
   where pc.status = 'pago' and p.clinic_id = p_clinic_id and pc.paid_at >= v_ts_ini and pc.paid_at < v_ts_fim;
  select coalesce(sum(ci.amount), 0), count(*),
         coalesce(sum(ci.amount) filter (where ci.boleto_url is not null), 0),
         coalesce(sum(ci.amount) filter (where ci.paid_method ilike '%pix%' or (ci.paid_method is null and ci.pix_code is not null and ci.boleto_url is null)), 0)
    into v_contr, v_n_contr, v_contr_boleto, v_contr_pix
    from contract_invoices ci join patient_contracts pk on pk.id = ci.contract_id
   where ci.status = 'pago' and pk.clinic_id = p_clinic_id and ci.paid_at >= v_ts_ini and ci.paid_at < v_ts_fim;

  v_receita := round(v_conv + v_part + v_contr, 2);
  if v_n_conv + v_n_part + v_n_contr = 0 then
    foreach k in array array['receita_bruta','receita_servicos','receita_prazo','receita_pix'] loop
      v_acc := sim_hub_put(v_acc, k, null, 'clinica', 'sem_dados', 'nenhum recebimento no mês');
    end loop;
  else
    v_acc := sim_hub_put(v_acc, 'receita_bruta', v_receita, 'clinica', 'ok', 'convênio + particular + mensalidades pagas no mês');
    v_acc := sim_hub_put(v_acc, 'receita_servicos', v_receita, 'clinica', 'ok', 'a clínica só vende serviço');
    v_acc := sim_hub_put(v_acc, 'receita_prazo', round(v_conv + v_contr_boleto, 2), 'clinica', 'parcial', 'convênio (faturado→pago) + mensalidades por boleto tratados como venda a prazo');
    v_acc := sim_hub_put(v_acc, 'receita_pix', round(v_part_pix + v_contr_pix, 2), 'clinica', 'parcial', 'cobranças pagas com forma de pagamento Pix (ou código Pix, nas mensalidades)');
  end if;
  v_acc := sim_hub_put(v_acc, 'receita_produtos', 0, 'clinica', 'ok', 'a clínica não vende produto');
  foreach k in array array['receita_dinheiro','receita_debito','receita_credito','receita_voucher'] loop
    v_acc := sim_hub_put(v_acc, k, null, 'clinica', 'sem_fonte', 'o sistema da clínica não registra a forma de pagamento de forma confiável (paid_method não é preenchido)');
  end loop;

  select coalesce(sum(glosa_amount), 0), count(*) into v_glosa, v_n_glosa
    from insurance_remittance_lines where clinic_id = p_clinic_id and competence_month = v_ini and consolidated;
  if v_n_glosa = 0 then v_acc := sim_hub_put(v_acc, 'glosas', null, 'clinica', 'sem_dados', 'sem extrato de convênio consolidado na competência');
  else v_acc := sim_hub_put(v_acc, 'glosas', round(v_glosa, 2), 'clinica', 'ok', 'extratos de convênio consolidados'); end if;

  -- custos: contas a pagar pagas no mês, por categoria
  for k, c in values ('aluguel', 'aluguel'), ('manutencao', 'manutencao'), ('marketing', 'marketing'), ('fixos_outros', 'outros'),
                     ('compras', 'fornecedores'), ('impostos_vendas', 'impostos'), ('folha', 'folha') loop
    select coalesce(sum(amount), 0), count(*) into v_rec, v_n
      from accounts_payable where clinic_id = p_clinic_id and category = c and status = 'pago' and paid_at >= v_ts_ini and paid_at < v_ts_fim;
    if v_n = 0 then
      v_acc := sim_hub_put(v_acc, k, null, 'clinica', 'sem_dados', format('nenhuma conta ''%s'' paga no mês', c));
    else
      v_acc := sim_hub_put(v_acc, k, round(v_rec, 2),  'clinica',
        case when k in ('compras', 'impostos_vendas', 'folha') then 'parcial' else 'ok' end,
        case k when 'compras' then 'contas de fornecedores pagas (não é compra por competência)'
               when 'impostos_vendas' then 'todos os tributos pagos, não só os sobre vendas'
               when 'folha' then 'contas a pagar ''folha'' (o RH sobrescreve quando tem documento)'
               else format('contas a pagar ''%s'' pagas no mês', c) end);
    end if;
  end loop;

  select coalesce(sum(po.gross_amount + coalesce(po.adjustments, 0)), 0), count(*) into v_repasse, v_n_repasse
    from payouts po join profiles pr on pr.id = po.therapist_id
   where pr.clinic_id = p_clinic_id and po.competence_month = v_ini and po.status in ('aprovado', 'pago');
  if v_n_repasse = 0 then v_acc := sim_hub_put(v_acc, 'repasses_terapeutas', null, 'clinica', 'sem_dados', 'nenhum repasse aprovado/pago na competência');
  else v_acc := sim_hub_put(v_acc, 'repasses_terapeutas', round(v_repasse, 2), 'clinica', 'ok', 'repasses a terapeutas por competência'); end if;

  -- posições: só no mês corrente (foto de agora)
  if v_corrente then
    select coalesce((select sum(bi.amount) from billing_items bi join billing_periods bp on bp.id = bi.billing_period_id join insurers i on i.id = bp.insurer_id
                      where bi.status in ('pendente', 'enviado', 'recursado') and i.clinic_id = p_clinic_id), 0)
         + coalesce((select sum(pc.amount) from patient_charges pc join patients p on p.id = pc.patient_id where pc.status = 'pendente' and p.clinic_id = p_clinic_id), 0)
         + coalesce((select sum(ci.amount) from contract_invoices ci join patient_contracts pk on pk.id = ci.contract_id
                      where ci.status in ('pendente', 'atrasado') and pk.clinic_id = p_clinic_id), 0)
      into v_rec;
    v_acc := sim_hub_put(v_acc, 'contas_receber', round(v_rec, 2), 'clinica', 'parcial', 'em aberto na data da sincronização');
    select coalesce(sum(amount), 0) into v_rec from accounts_payable
     where clinic_id = p_clinic_id and status in ('pendente', 'atrasado') and due_date < v_fim;
    v_acc := sim_hub_put(v_acc, 'contas_pagar', round(v_rec, 2), 'clinica', 'parcial', 'contas pendentes com vencimento até o fim do mês (foto na sincronização)');
    select coalesce((select sum(pc.amount) from patient_charges pc join patients p on p.id = pc.patient_id
                      where pc.status = 'pendente' and p.clinic_id = p_clinic_id and pc.due_date < v_hoje), 0)
         + coalesce((select sum(ci.amount) from contract_invoices ci join patient_contracts pk on pk.id = ci.contract_id
                      where ci.status = 'atrasado' and pk.clinic_id = p_clinic_id), 0)
      into v_rec;
    v_acc := sim_hub_put(v_acc, 'inadimplencia', round(v_rec, 2), 'clinica', 'parcial', 'cobranças vencidas e não pagas (foto na sincronização)');
  else
    foreach k in array array['contas_receber','contas_pagar','inadimplencia'] loop
      v_acc := sim_hub_put(v_acc, k, null, 'clinica', 'sem_dados', 'posição só é lida no mês corrente');
    end loop;
  end if;

  foreach k in array array['descontos','cancelamentos','qtd_pedidos','frete','comissoes','ir_csll','encargos','temporarios','pro_labore',
                           'distribuicao','caixa_final','estoque','passivo_prepago','quebra_caixa'] loop
    v_acc := sim_hub_put(v_acc, k, null, 'clinica', 'sem_fonte', 'o sistema da clínica não registra este dado');
  end loop;

  return v_acc || jsonb_build_object('detalhes', jsonb_build_object('clinica',
    jsonb_build_object('convenio', round(v_conv, 2), 'particular', round(v_part, 2), 'contratos', round(v_contr, 2))));
end $$;
revoke all on function public.sim_extrair_clinica(text, uuid, date) from public;
grant execute on function public.sim_extrair_clinica(text, uuid, date) to anon, authenticated, service_role;
