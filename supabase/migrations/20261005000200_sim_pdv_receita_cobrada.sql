-- Corrige a receita do PDV: usa o total cobrado do pedido, não a soma dos itens (que vinha valorizada a preço de lista).
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
  -- O valor reconhecido é o cobrado no pedido (o.total_cents = soma dos pagamentos). A soma dos itens NÃO serve:
  -- em pedidos de SESSAO os itens vêm valorizados a preço de lista/crédito consumido (ex.: "30 minutos" a R$ 100
  -- num pedido de R$ 60), o que inflava a receita (setembro: R$ 62 mil de itens contra R$ 35 mil cobrados).
  -- Serviços × produtos: o cobrado é rateado pela participação de cada natureza nos itens do pedido.
  select count(*) as pedidos,
         coalesce(sum(o.total_cents), 0) / 100.0 as bruta,
         coalesce(sum(o.total_cents * n.serv / nullif(n.tot, 0)), 0) / 100.0 as servicos,
         coalesce(sum(o.total_cents * n.prod / nullif(n.tot, 0)), 0) / 100.0 as produtos,
         coalesce(sum(n.desc_lista), 0) / 100.0 as descontos,
         coalesce(sum(greatest(n.tot - o.total_cents, 0)), 0) / 100.0 as itens_acima
    into r
    from fa_kiosk_orders o
    cross join lateral (
      select coalesce(sum(i.total_cents), 0) as tot,
             coalesce(sum(i.total_cents) filter (where i.item_nature = 'SERVICO'), 0) as serv,
             coalesce(sum(i.total_cents) filter (where i.item_nature = 'PRODUTO'), 0) as prod,
             coalesce(sum(greatest(coalesce(i.list_unit_price_cents, i.unit_price_cents) - i.unit_price_cents, 0) * i.quantity), 0) as desc_lista
        from fa_kiosk_order_items i where i.order_id = o.id) n
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
      v_campos := v_campos || jsonb_build_object(c, sim_realizado_campo(v_fonte, 'ok', 'total cobrado nos pedidos pagos (= pagamentos), por dia do negócio'));
    end loop;
    v_campos := v_campos || jsonb_build_object('descontos', sim_realizado_campo(v_fonte, 'ok', 'preço de lista − preço praticado nos itens (valor de itens acima do cobrado fica fora: créditos/cortesias)'));

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
