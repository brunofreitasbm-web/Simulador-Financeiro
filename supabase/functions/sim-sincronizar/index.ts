// Sincronização do Realizado: lê os sistemas-fonte e espelha em sim_realizado_mensal, mês a mês.
//
// POST { competencias?: ['YYYY-MM'], empresa_id?: uuid, sobrescrever?: boolean } -> { sincronizacao_id, status, resultado }
//   - sem competencias: mês anterior + mês corrente (America/Belem). Mês fechado é pulado (salvo sobrescrever).
//   - disparo do cron (sem competencias): a partir do dia 2, o mês anterior sincronizado sem erro e com receita e folha é FECHADO
//     automaticamente (sem folha ou sem receita não fecha: o aviso fica em resultado/nao_fechados).
//
// Auth (uma das duas):
//   - header x-ops-key = chave do Vault `sim_ops_key` (validada por sim_validar_ops_key) ou, se existir, o secret SIM_OPS_KEY
//   - Authorization: Bearer <jwt> de usuário autorizado no simulador (public.sim_autorizado())
//
// Fontes:
//   - pdv     → RPC sim_extrair_pdv (mesmo projeto, fa_kiosk_*)
//   - clinica → RPC sim_extrair_clinica no projeto B (só totais; protegida pela chave sim_hub_key do Vault)
//   - rh      → RPC sim_extrair_rh no projeto B (idem)
//   Config do projeto B (url, chave publicável, sim_hub_key) vem de sim_config_projeto_b(): nenhuma service-role de outro projeto.
// Depois das fontes, as ESTIMATIVAS (taxa de cartão, impostos, fixos, encargos) preenchem só o que as fontes não trouxeram,
// a partir de sim_modelo_custos, com status 'estimado'.
// Tudo é gravado pela RPC sim_gravar_realizado, que respeita células manuais e meses fechados.
//
// Deploy com verify_jwt=false (a autenticação é feita aqui).

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

type Status = "ok" | "sem_fonte" | "sem_dados" | "parcial" | "manual" | "estimado";
type Campo = { fonte: string; status: Status; obs: string | null; atualizado_em: string };
type Extracao = { valores: Record<string, number | null>; campos: Record<string, Campo>; detalhes?: Record<string, unknown> };
type Fonte = { id: string; empresa_id: string; tipo: "pdv" | "clinica" | "rh"; ativo: boolean; config: Record<string, string> };
type Modelo = {
  taxa_debito: number; taxa_credito: number; taxa_pix: number; taxa_voucher: number;
  aliquota_impostos: number | null; pct_encargos: number | null;
  aluguel_minimo: number | null; aluguel_pct_receita: number | null; condominio: number | null; fundo_promocao: number | null;
  manutencao: number | null; marketing: number | null; fixos_outros: number | null;
};
type Linha = Record<string, unknown> & { fechado?: boolean; campos?: Record<string, { status?: Status }> };
type Slot = { ok: boolean; campos?: number; erro?: string; ignorado?: string };

const COLUNAS = [
  "receita_bruta", "receita_servicos", "receita_produtos", "descontos", "cancelamentos", "qtd_pedidos",
  "receita_dinheiro", "receita_pix", "receita_debito", "receita_credito", "receita_voucher", "receita_prazo", "inadimplencia", "glosas",
  "compras", "frete", "comissoes", "impostos_vendas", "taxas_cartao", "ir_csll",
  "folha", "encargos", "temporarios", "pro_labore", "repasses_terapeutas",
  "aluguel", "manutencao", "fixos_outros", "marketing", "distribuicao",
  "caixa_final", "contas_receber", "contas_pagar", "estoque", "passivo_prepago", "quebra_caixa",
] as const;

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-ops-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors() } });
}

function igualSeguro(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let d = 0;
  for (let i = 0; i < ea.length; i++) d |= ea[i] ^ eb[i];
  return d === 0;
}

/** Competência 'YYYY-MM' de hoje em Belém, deslocada `delta` meses. */
function competenciaBelem(delta = 0): string {
  const agora = new Date(Date.now() - 3 * 3600 * 1000);
  const idx = agora.getUTCFullYear() * 12 + agora.getUTCMonth() + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
const diaBelem = () => new Date(Date.now() - 3 * 3600 * 1000).getUTCDate();
const proximoMes = (comp: string) => {
  const [y, m] = comp.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};
const r2 = (x: number) => Math.round(x * 100) / 100;
const brl = (x: number) => x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const campo = (fonte: string, status: Status, obs: string | null = null): Campo => ({ fonte, status, obs, atualizado_em: new Date().toISOString() });
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// ---------------------------------------------------------------------------------------------
// Estimativas: preenchem só o que nenhuma fonte trouxe (sem_fonte / sem_dados / estimado anterior)
// ---------------------------------------------------------------------------------------------
const FONTE_EST = "modelo";
function estimar(linha: Linha, m: Modelo): Extracao {
  const valores: Record<string, number | null> = {};
  const campos: Record<string, Campo> = {};
  const elegivel = (k: string) => {
    const st = linha.campos?.[k]?.status;
    return st === undefined || st === "sem_fonte" || st === "sem_dados" || st === "estimado";
  };
  const set = (k: string, v: number, obs: string) => {
    if (!elegivel(k)) return;
    valores[k] = r2(v); campos[k] = campo(FONTE_EST, "estimado", obs);
  };
  const v = (k: string) => num(linha[k]);

  // taxa de cartão: só com débito/crédito conhecidos (a clínica, por exemplo, não tem a forma de pagamento)
  if (v("receita_debito") !== null || v("receita_credito") !== null) {
    const partes: [string, number | null, number][] = [
      ["débito", v("receita_debito"), m.taxa_debito], ["crédito", v("receita_credito"), m.taxa_credito],
      ["pix", v("receita_pix"), m.taxa_pix], ["voucher", v("receita_voucher"), m.taxa_voucher],
    ];
    const usados = partes.filter(([, base, t]) => base !== null && base > 0 && t > 0);
    const total = partes.reduce((s, [, base, t]) => s + (base ?? 0) * t / 100, 0);
    set("taxas_cartao", total, usados.length
      ? `estimado: ${usados.map(([n, b, t]) => `${n} R$ ${brl(b!)} × ${t}%`).join(" + ")} (taxas do modelo de custos, não do extrato da adquirente)`
      : "estimado: sem valores nas formas de pagamento taxadas");
  }

  const rb = v("receita_bruta");
  if (m.aliquota_impostos !== null && rb !== null) {
    set("impostos_vendas", rb * m.aliquota_impostos / 100, `estimado: receita bruta R$ ${brl(rb)} × alíquota efetiva ${m.aliquota_impostos}% (modelo de custos)`);
  }

  if ([m.aluguel_minimo, m.aluguel_pct_receita, m.condominio, m.fundo_promocao].some((x) => x !== null)) {
    const pct = m.aluguel_pct_receita !== null && rb !== null ? rb * m.aluguel_pct_receita / 100 : 0;
    const base = Math.max(m.aluguel_minimo ?? 0, pct);
    const total = base + (m.condominio ?? 0) + (m.fundo_promocao ?? 0);
    set("aluguel", total, `estimado: maior entre mínimo R$ ${brl(m.aluguel_minimo ?? 0)} e ${m.aluguel_pct_receita ?? 0}% da receita (R$ ${brl(pct)}) = R$ ${brl(base)}`
      + ` + condomínio R$ ${brl(m.condominio ?? 0)} + fundo de promoção R$ ${brl(m.fundo_promocao ?? 0)}`);
  }
  for (const k of ["manutencao", "marketing", "fixos_outros"] as const) {
    if (m[k] !== null) set(k, m[k]!, "estimado: valor fixo mensal do modelo de custos");
  }

  const folha = v("folha");
  if (m.pct_encargos !== null && folha !== null) {
    set("encargos", folha * m.pct_encargos / 100, `estimado: folha R$ ${brl(folha)} × ${m.pct_encargos}% (modelo de custos; o documento do contador substitui)`);
  }
  return { valores, campos };
}

// ---------------------------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
  if (req.method !== "POST") return json({ error: "método não suportado" }, 405);

  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "serviço indisponível" }, 500);
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  // --- auth
  let origem: "cron" | "manual" = "manual";
  let disparadoPor = "";
  const envKey = Deno.env.get("SIM_OPS_KEY") ?? "";
  const headerKey = req.headers.get("x-ops-key") ?? "";
  let chaveOk = !!(envKey && headerKey && igualSeguro(headerKey, envKey));
  if (!chaveOk && headerKey) {
    const { data } = await admin.rpc("sim_validar_ops_key", { p_chave: headerKey });
    chaveOk = data === true;
  }
  if (chaveOk) {
    origem = "cron"; disparadoPor = "cron";
  } else {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "não autorizado" }, 401);
    const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: ok, error } = await sbUser.rpc("sim_autorizado");
    if (error || ok !== true) return json({ error: "não autorizado" }, 403);
    const { data: u } = await sbUser.auth.getUser(auth.slice(7));
    disparadoPor = u?.user?.email ?? "usuário autorizado";
  }

  let body: { competencias?: unknown; empresa_id?: unknown; sobrescrever?: unknown } = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }
  const explicitas = Array.isArray(body.competencias) && body.competencias.length > 0;
  const competencias = explicitas
    ? (body.competencias as unknown[]).filter((c): c is string => typeof c === "string" && /^\d{4}-\d{2}$/.test(c)).slice(0, 24)
    : [competenciaBelem(-1), competenciaBelem(0)];
  if (competencias.length === 0) return json({ error: "competências inválidas (use YYYY-MM)" }, 400);
  const empresaId = typeof body.empresa_id === "string" ? body.empresa_id : null;
  const sobrescrever = body.sobrescrever === true;
  const corrente = competenciaBelem(0);
  const anterior = competenciaBelem(-1);
  // fechamento automático: só no disparo do cron sem competências explícitas, a partir do dia 2 (o dia de negócio 31 fecha às 04h do dia 1)
  const fechaAnterior = origem === "cron" && !explicitas && !sobrescrever && diaBelem() >= 2;

  // --- guarda contra execução concorrente
  const { data: rodando } = await admin.from("sim_sincronizacao").select("id").eq("status", "executando")
    .gte("iniciado_em", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
  if (rodando && rodando.length) return json({ error: "já existe uma sincronização em andamento" }, 409);

  const { data: log, error: logErr } = await admin.from("sim_sincronizacao").insert({
    empresa_id: empresaId, competencias: competencias.map((c) => `${c}-01`), origem, disparado_por: disparadoPor,
  }).select("id").single();
  if (logErr || !log) return json({ error: `não consegui abrir o log: ${logErr?.message}` }, 500);

  const finalizar = async (status: string, erro: string | null, resultado: unknown = {}) => {
    await admin.from("sim_sincronizacao").update({ status, erro, resultado, concluido_em: new Date().toISOString() }).eq("id", log.id);
  };

  let q = admin.from("sim_fonte_dados").select("id, empresa_id, tipo, ativo, config, sim_empresa!inner(razao_social, nome_fantasia)").eq("ativo", true);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data: fontesRaw, error: fErr } = await q;
  if (fErr) { await finalizar("erro", fErr.message); return json({ error: fErr.message }, 500); }
  const fontes = (fontesRaw ?? []) as unknown as (Fonte & { sim_empresa: { razao_social: string; nome_fantasia: string | null } })[];

  // --- projeto B (RH + Clínica): só RPCs de totais, com a chave do hub
  let projetoB: SupabaseClient | null = null;
  let hubKey = "";
  if (fontes.some((f) => f.tipo !== "pdv")) {
    const { data: cfg } = await admin.rpc("sim_config_projeto_b");
    const c = cfg as { url?: string; anon?: string; hub_key?: string } | null;
    if (c?.url && c.anon && c.hub_key) {
      projetoB = createClient(c.url, c.anon, { auth: { persistSession: false, autoRefreshToken: false } });
      hubKey = c.hub_key;
    }
  }
  const semProjetoB = "projeto B não configurado: faltam os segredos sim_b_url, sim_b_anon e sim_hub_key no Vault";

  // --- modelos de custos e meses já fechados
  const { data: modelosRaw } = await admin.from("sim_modelo_custos").select("*");
  const modelos = new Map<string, Modelo>((modelosRaw ?? []).map((m: Record<string, unknown>) => [m.empresa_id as string, {
    taxa_debito: Number(m.taxa_debito), taxa_credito: Number(m.taxa_credito), taxa_pix: Number(m.taxa_pix), taxa_voucher: Number(m.taxa_voucher),
    aliquota_impostos: num(m.aliquota_impostos), pct_encargos: num(m.pct_encargos),
    aluguel_minimo: num(m.aluguel_minimo), aluguel_pct_receita: num(m.aluguel_pct_receita), condominio: num(m.condominio), fundo_promocao: num(m.fundo_promocao),
    manutencao: num(m.manutencao), marketing: num(m.marketing), fixos_outros: num(m.fixos_outros),
  }]));
  const { data: fechadosRaw } = await admin.from("sim_realizado_mensal").select("empresa_id, competencia")
    .eq("fechado", true).in("competencia", competencias.map((c) => `${c}-01`));
  const fechados = new Set((fechadosRaw ?? []).map((r: { empresa_id: string; competencia: string }) => `${r.empresa_id}|${String(r.competencia).slice(0, 7)}`));

  const resultado: Record<string, { nome: string; fontes: Record<string, Record<string, Slot>> }> = {};
  let erros = 0, gravacoes = 0;
  const fechadosAgora: string[] = [];
  const naoFechados: string[] = [];

  // ordem por empresa: pdv/clinica antes, rh por último (RH sobrescreve folha quando tem documento)
  const ordem = { pdv: 0, clinica: 0, rh: 1 } as const;
  const porEmpresa = new Map<string, typeof fontes>();
  for (const f of fontes) porEmpresa.set(f.empresa_id, [...(porEmpresa.get(f.empresa_id) ?? []), f]);

  for (const [eid, lista] of porEmpresa) {
    lista.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
    const nome = lista[0].sim_empresa.nome_fantasia ?? lista[0].sim_empresa.razao_social;
    resultado[eid] = { nome, fontes: {} };
    for (const comp of competencias) {
      const jaFechado = !sobrescrever && fechados.has(`${eid}|${comp}`);
      let errosMes = 0;
      for (const f of lista) {
        const slot = (resultado[eid].fontes[f.tipo] ??= {});
        if (jaFechado) { slot[comp] = { ok: true, ignorado: "mês fechado" }; continue; }
        try {
          let ext: Extracao;
          if (f.tipo === "pdv") {
            const { data, error } = await admin.rpc("sim_extrair_pdv", { p_unit_id: f.config.unit_id, p_competencia: `${comp}-01` });
            if (error) throw new Error(error.message);
            ext = data as Extracao;
            // quebra de caixa é líquida (sobras − faltas): mostra as duas pontas
            const { data: turnos } = await admin.from("fa_kiosk_shifts").select("cash_break_cents")
              .eq("unit_id", f.config.unit_id).eq("status", "FECHADO").gte("business_date", `${comp}-01`).lt("business_date", proximoMes(comp));
            if (turnos && turnos.length && ext.campos.quebra_caixa) {
              const sobras = turnos.reduce((s, t) => s + Math.max(Number(t.cash_break_cents ?? 0), 0), 0) / 100;
              const faltas = turnos.reduce((s, t) => s + Math.min(Number(t.cash_break_cents ?? 0), 0), 0) / 100;
              ext.campos.quebra_caixa.obs = `${turnos.length} turno(s) fechado(s): sobras R$ ${brl(sobras)}, faltas R$ ${brl(Math.abs(faltas))} (líquido = sobras − faltas)`;
              ext.detalhes = { ...(ext.detalhes ?? {}), quebra_caixa: { turnos: turnos.length, sobras: r2(sobras), faltas: r2(faltas) } };
            }
          } else {
            if (!projetoB) throw new Error(semProjetoB);
            const rpc = f.tipo === "clinica"
              ? await projetoB.rpc("sim_extrair_clinica", { p_chave: hubKey, p_clinic_id: f.config.clinic_id, p_competencia: `${comp}-01` })
              : await projetoB.rpc("sim_extrair_rh", { p_chave: hubKey, p_unit_id: f.config.unit_id, p_competencia: `${comp}-01` });
            if (rpc.error) throw new Error(rpc.error.message);
            ext = rpc.data as Extracao;
            // o RH só entra na folha quando tem algo (documento ou salários-base): não apaga o que PDV/clínica trouxeram
            if (f.tipo === "rh" && ext.campos.folha?.status === "sem_dados") { delete ext.valores.folha; delete ext.campos.folha; }
          }
          // só colunas conhecidas
          for (const k of Object.keys(ext.valores)) if (!(COLUNAS as readonly string[]).includes(k)) { delete ext.valores[k]; delete ext.campos[k]; }
          const { error: gErr } = await admin.rpc("sim_gravar_realizado", {
            p_empresa_id: eid, p_competencia: `${comp}-01`, p_valores: ext.valores, p_campos: ext.campos, p_sobrescrever: sobrescrever, p_detalhes: ext.detalhes ?? null,
          });
          if (gErr) throw new Error(`gravar: ${gErr.message}`);
          slot[comp] = { ok: true, campos: Object.keys(ext.valores).length };
          gravacoes++;
        } catch (e) {
          erros++; errosMes++;
          slot[comp] = { ok: false, erro: e instanceof Error ? e.message : String(e) };
          console.error("sim-sincronizar", nome, f.tipo, comp, e);
        }
      }

      // estimativas sobre o que as fontes gravaram (lê a linha, inclusive células manuais)
      const slotEst = (resultado[eid].fontes["estimativas"] ??= {});
      const modelo = modelos.get(eid);
      if (jaFechado) { slotEst[comp] = { ok: true, ignorado: "mês fechado" }; }
      else if (!modelo) { slotEst[comp] = { ok: true, ignorado: "empresa sem modelo de custos" }; }
      else {
        try {
          const { data: linha, error: lErr } = await admin.from("sim_realizado_mensal").select("*").eq("empresa_id", eid).eq("competencia", `${comp}-01`).maybeSingle();
          if (lErr) throw new Error(lErr.message);
          if (!linha) { slotEst[comp] = { ok: true, ignorado: "sem linha para estimar" }; }
          else {
            const est = estimar(linha as Linha, modelo);
            if (Object.keys(est.valores).length) {
              const { error: gErr } = await admin.rpc("sim_gravar_realizado", {
                p_empresa_id: eid, p_competencia: `${comp}-01`, p_valores: est.valores, p_campos: est.campos, p_sobrescrever: false, p_detalhes: null,
              });
              if (gErr) throw new Error(`gravar estimativas: ${gErr.message}`);
            }
            slotEst[comp] = { ok: true, campos: Object.keys(est.valores).length };
          }
        } catch (e) {
          erros++; errosMes++;
          slotEst[comp] = { ok: false, erro: e instanceof Error ? e.message : String(e) };
          console.error("sim-sincronizar estimativas", nome, comp, e);
        }
      }

      // fecha o mês anterior quando tudo da empresa nele deu certo E há receita e folha (não congela mês com buraco essencial)
      if (fechaAnterior && comp === anterior && !jaFechado && errosMes === 0) {
        const { data: l } = await admin.from("sim_realizado_mensal").select("receita_bruta, folha").eq("empresa_id", eid).eq("competencia", `${comp}-01`).maybeSingle();
        const faltam = [l?.receita_bruta == null ? "receita_bruta" : null, l?.folha == null ? "folha" : null].filter(Boolean);
        if (faltam.length) {
          resultado[eid].fontes["estimativas"][comp].ignorado = `não fechado automaticamente: sem ${faltam.join(" e ")}`;
          naoFechados.push(`${nome} ${comp}: sem ${faltam.join(" e ")}`);
        } else {
          const { error: cErr } = await admin.rpc("sim_fechar_realizado_auto", { p_empresa_id: eid, p_competencia: `${comp}-01` });
          if (cErr) { erros++; resultado[eid].fontes["estimativas"][comp] = { ok: false, erro: `fechar: ${cErr.message}` }; }
          else fechadosAgora.push(`${nome} ${comp}`);
        }
      }
    }
  }

  const status = erros === 0 ? "ok" : gravacoes === 0 ? "erro" : "parcial";
  await finalizar(status, erros ? `${erros} etapa(s) falharam` : null, resultado);
  return json({ sincronizacao_id: log.id, status, competencias, fechados: fechadosAgora, nao_fechados: naoFechados, resultado });
});
