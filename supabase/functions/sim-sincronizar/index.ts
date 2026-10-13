// Sincronização do Realizado: lê os sistemas-fonte e espelha em sim_realizado_mensal, mês a mês.
//
// POST { competencias?: ['YYYY-MM'], empresa_id?: uuid, sobrescrever?: boolean } -> { sincronizacao_id, status, resultado }
//   - sem competencias: mês anterior + mês corrente (America/Belem)
//
// Auth (uma das duas):
//   - header x-ops-key igual ao secret SIM_OPS_KEY (cron do Postgres)
//   - Authorization: Bearer <jwt> de usuário autorizado no simulador (public.sim_autorizado())
//
// Fontes:
//   - pdv     → RPC sim_extrair_pdv (mesmo projeto, fa_kiosk_*)
//   - clinica → projeto B (CLINICA_SUPABASE_URL / CLINICA_SUPABASE_SERVICE_ROLE_KEY): billing_items, patient_charges,
//               contract_invoices, accounts_payable, payouts, insurance_remittance_lines
//   - rh      → projeto B: unit_payroll_documents, employees, interns, freelance_jobs
//   - github  → fechamento/AAAA-MM.json publicado no repositório-fonte (ver docs/FECHAMENTO-GITHUB.md).
//               O contrato de leitura é `packages/engine/src/fechamento.ts`; o leitor aqui é uma cópia
//               enxuta dele, como as demais extrações já são cópias autocontidas.
//               Precedência: github grava primeiro, então pdv/clinica/rh sobrescrevem com dado vivo.
// Tudo é gravado pela RPC sim_gravar_realizado, que respeita células manuais e meses fechados.
//
// Secrets: SIM_OPS_KEY, CLINICA_SUPABASE_URL, CLINICA_SUPABASE_SERVICE_ROLE_KEY
//          GITHUB_TOKEN (opcional: só para repositório privado; os públicos usam raw.githubusercontent.com)
// (SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já vêm injetados). Deploy com verify_jwt=false.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

type Status = "ok" | "sem_fonte" | "sem_dados" | "parcial" | "manual";
type Campo = { fonte: string; status: Status; obs: string | null; atualizado_em: string };
type Extracao = { valores: Record<string, number | null>; campos: Record<string, Campo>; detalhes?: Record<string, unknown> };
type Fonte = { id: string; empresa_id: string; tipo: "pdv" | "clinica" | "rh" | "github"; chave: string; ativo: boolean; config: Record<string, string> };

const TZ = "-03:00"; // America/Belem, sem horário de verão
const COLUNAS = [
  "receita_bruta", "receita_servicos", "receita_produtos", "descontos", "cancelamentos", "qtd_pedidos",
  "receita_dinheiro", "receita_pix", "receita_debito", "receita_credito", "receita_voucher", "receita_prazo", "inadimplencia", "glosas",
  "compras", "frete", "comissoes", "impostos_vendas", "ir_csll",
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
function janela(comp: string) {
  const [y, m] = comp.split("-").map(Number);
  const ini = `${comp}-01`;
  const prox = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const fimDia = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // último dia do mês
  return { ini, prox, fimDia, iniTs: `${ini}T00:00:00${TZ}`, proxTs: `${prox}T00:00:00${TZ}` };
}
const r2 = (x: number) => Math.round(x * 100) / 100;
const campo = (fonte: string, status: Status, obs: string | null = null): Campo => ({ fonte, status, obs, atualizado_em: new Date().toISOString() });
const soma = (rows: { amount?: unknown; gross_amount?: unknown; adjustments?: unknown }[] | null, k: "amount" | "gross_amount" = "amount") =>
  r2((rows ?? []).reduce((s, r) => s + Number(r[k] ?? 0) + (k === "gross_amount" ? Number(r.adjustments ?? 0) : 0), 0));

function falhou(e: { message: string } | null, oque: string) {
  if (e) throw new Error(`${oque}: ${e.message}`);
}

// ---------------------------------------------------------------------------------------------
// Fonte: Clínica (projeto B) — regime de caixa por paid_at; repasses por competência
// ---------------------------------------------------------------------------------------------
async function extrairClinica(b: SupabaseClient, clinicId: string, comp: string, corrente: boolean): Promise<Extracao> {
  const F = "clinica";
  const j = janela(comp);
  const valores: Record<string, number | null> = {};
  const campos: Record<string, Campo> = {};
  const set = (k: string, v: number | null, st: Status, obs: string | null = null) => { valores[k] = v; campos[k] = campo(F, st, obs); };

  const [bi, pc, ci, ap, po, rl] = await Promise.all([
    b.from("billing_items").select("amount, paid_at, billing_periods!inner(insurers!inner(clinic_id))")
      .eq("status", "pago").eq("billing_periods.insurers.clinic_id", clinicId).gte("paid_at", j.iniTs).lt("paid_at", j.proxTs),
    b.from("patient_charges").select("amount, paid_at, pix_code, patients!inner(clinic_id)")
      .eq("status", "pago").eq("patients.clinic_id", clinicId).gte("paid_at", j.iniTs).lt("paid_at", j.proxTs),
    b.from("contract_invoices").select("amount, paid_at, pix_code, boleto_url, patient_contracts!inner(clinic_id)")
      .eq("status", "pago").eq("patient_contracts.clinic_id", clinicId).gte("paid_at", j.iniTs).lt("paid_at", j.proxTs),
    b.from("accounts_payable").select("category, amount").eq("clinic_id", clinicId).eq("status", "pago").gte("paid_at", j.iniTs).lt("paid_at", j.proxTs),
    b.from("payouts").select("gross_amount, adjustments, profiles!inner(clinic_id)").eq("profiles.clinic_id", clinicId).eq("competence_month", j.ini).in("status", ["aprovado", "pago"]),
    b.from("insurance_remittance_lines").select("glosa_amount").eq("clinic_id", clinicId).eq("competence_month", j.ini).eq("consolidated", true),
  ]);
  falhou(bi.error, "billing_items"); falhou(pc.error, "patient_charges"); falhou(ci.error, "contract_invoices");
  falhou(ap.error, "accounts_payable"); falhou(po.error, "payouts"); falhou(rl.error, "insurance_remittance_lines");

  const convenio = soma(bi.data), particular = soma(pc.data), contratos = soma(ci.data);
  const receita = r2(convenio + particular + contratos);
  const nRec = (bi.data?.length ?? 0) + (pc.data?.length ?? 0) + (ci.data?.length ?? 0);
  if (nRec === 0) {
    for (const k of ["receita_bruta", "receita_servicos", "receita_prazo", "receita_pix"]) set(k, null, "sem_dados", "nenhum recebimento no mês");
  } else {
    set("receita_bruta", receita, "ok", "convênio + particular + mensalidades pagas no mês");
    set("receita_servicos", receita, "ok", "a clínica só vende serviço");
    const boletos = (ci.data ?? []).filter((r) => r.boleto_url);
    set("receita_prazo", r2(convenio + soma(boletos)), "parcial", "convênio (faturado→pago) + mensalidades por boleto tratados como venda a prazo");
    const pix = [...(pc.data ?? []), ...(ci.data ?? []).filter((r) => !r.boleto_url)].filter((r) => r.pix_code);
    set("receita_pix", soma(pix), "parcial", "cobranças pagas que tinham código Pix");
  }
  set("receita_produtos", 0, "ok", "a clínica não vende produto");
  for (const k of ["receita_dinheiro", "receita_debito", "receita_credito", "receita_voucher"]) set(k, null, "sem_fonte", "o sistema da clínica não registra a forma de pagamento");

  const gl = (rl.data ?? []).reduce((s, r) => s + Number(r.glosa_amount ?? 0), 0);
  if ((rl.data?.length ?? 0) === 0) set("glosas", null, "sem_dados", "sem extrato de convênio consolidado na competência");
  else set("glosas", r2(gl), "ok", "extratos de convênio consolidados");

  const porCat = (cat: string) => (ap.data ?? []).filter((r) => r.category === cat);
  const cat = (k: string, c: string, st: Status = "ok", obs: string | null = null) => {
    const rows = porCat(c);
    if (rows.length === 0) set(k, null, "sem_dados", `nenhuma conta '${c}' paga no mês`);
    else set(k, soma(rows), st, obs ?? `contas a pagar '${c}' pagas no mês`);
  };
  cat("aluguel", "aluguel"); cat("manutencao", "manutencao"); cat("marketing", "marketing"); cat("fixos_outros", "outros");
  cat("compras", "fornecedores", "parcial", "contas de fornecedores pagas (não é compra por competência)");
  cat("impostos_vendas", "impostos", "parcial", "todos os tributos pagos, não só os sobre vendas");
  cat("folha", "folha", "parcial", "contas a pagar 'folha' (o RH sobrescreve quando tem documento)");

  if ((po.data?.length ?? 0) === 0) set("repasses_terapeutas", null, "sem_dados", "nenhum repasse aprovado/pago na competência");
  else set("repasses_terapeutas", soma(po.data, "gross_amount"), "ok", "repasses a terapeutas por competência");

  if (corrente) {
    const [pend1, pend2, pend3, apPend, inad1, inad2] = await Promise.all([
      b.from("billing_items").select("amount, billing_periods!inner(insurers!inner(clinic_id))").in("status", ["pendente", "enviado", "recursado"]).eq("billing_periods.insurers.clinic_id", clinicId),
      b.from("patient_charges").select("amount, patients!inner(clinic_id)").eq("status", "pendente").eq("patients.clinic_id", clinicId),
      b.from("contract_invoices").select("amount, patient_contracts!inner(clinic_id)").in("status", ["pendente", "atrasado"]).eq("patient_contracts.clinic_id", clinicId),
      b.from("accounts_payable").select("amount").eq("clinic_id", clinicId).in("status", ["pendente", "atrasado"]).lte("due_date", j.fimDia),
      b.from("patient_charges").select("amount, patients!inner(clinic_id)").eq("status", "pendente").eq("patients.clinic_id", clinicId).lt("due_date", j.fimDia),
      b.from("contract_invoices").select("amount, patient_contracts!inner(clinic_id)").eq("status", "atrasado").eq("patient_contracts.clinic_id", clinicId),
    ]);
    for (const [r, n] of [[pend1, "billing_items"], [pend2, "patient_charges"], [pend3, "contract_invoices"], [apPend, "accounts_payable"], [inad1, "patient_charges"], [inad2, "contract_invoices"]] as const) falhou(r.error, n);
    set("contas_receber", r2(soma(pend1.data) + soma(pend2.data) + soma(pend3.data)), "parcial", "em aberto na data da sincronização");
    set("contas_pagar", soma(apPend.data), "parcial", "contas pendentes com vencimento até o fim do mês (foto na sincronização)");
    set("inadimplencia", r2(soma(inad1.data) + soma(inad2.data)), "parcial", "cobranças vencidas e não pagas (foto na sincronização)");
  } else {
    for (const k of ["contas_receber", "contas_pagar", "inadimplencia"]) set(k, null, "sem_dados", "posição só é lida no mês corrente");
  }

  for (const k of ["descontos", "cancelamentos", "qtd_pedidos", "frete", "comissoes", "ir_csll", "encargos", "temporarios", "pro_labore", "distribuicao", "caixa_final", "estoque", "passivo_prepago", "quebra_caixa"]) {
    set(k, null, "sem_fonte", "o sistema da clínica não registra este dado");
  }
  return { valores, campos, detalhes: { clinica: { convenio, particular, contratos } } };
}

// ---------------------------------------------------------------------------------------------
// Fonte: RH (projeto B) — folha por competência
// ---------------------------------------------------------------------------------------------
async function extrairRh(b: SupabaseClient, unitId: string, comp: string): Promise<Extracao> {
  const F = "rh";
  const j = janela(comp);
  const valores: Record<string, number | null> = {};
  const campos: Record<string, Campo> = {};
  const set = (k: string, v: number | null, st: Status, obs: string | null = null) => { valores[k] = v; campos[k] = campo(F, st, obs); };

  const [docs, emp, int, fl] = await Promise.all([
    b.from("unit_payroll_documents").select("meta").eq("unit_id", unitId).eq("meta->>competencia", comp),
    b.from("employees").select("base_salary").eq("unit_id", unitId).in("status", ["ativo", "ferias", "afastado", "aviso_previo"]),
    b.from("interns").select("allowance").eq("unit_id", unitId).eq("active", true),
    b.from("freelance_jobs").select("gross_amount").eq("unit_id", unitId).eq("status", "pago").gte("paid_at", j.iniTs).lt("paid_at", j.proxTs),
  ]);
  falhou(docs.error, "unit_payroll_documents"); falhou(emp.error, "employees"); falhou(int.error, "interns"); falhou(fl.error, "freelance_jobs");

  type Meta = { tipo_folha?: string; valor?: unknown };
  const metas = (docs.data ?? []).map((d) => (d.meta ?? {}) as Meta);
  const folhaDocs = metas.filter((m) => ["mensal", "adiantamento", "decimo_terceiro", "rescisao"].includes(m.tipo_folha ?? ""));
  const encDocs = metas.filter((m) => m.tipo_folha === "encargos");
  const somaMeta = (l: Meta[]) => r2(l.reduce((s, m) => s + Number(m.valor ?? 0), 0));

  if (folhaDocs.length > 0) {
    set("folha", somaMeta(folhaDocs), "ok", `${folhaDocs.length} documento(s) de folha do contador`);
  } else {
    const base = r2((emp.data ?? []).reduce((s, e) => s + Number(e.base_salary ?? 0), 0) + (int.data ?? []).reduce((s, i) => s + Number(i.allowance ?? 0), 0));
    if (base > 0) set("folha", base, "parcial", "estimado pelos salários-base e bolsas ativos (sem documento de folha)");
    else set("folha", null, "sem_dados", "sem documento de folha e sem salários-base cadastrados");
  }
  if (encDocs.length > 0) set("encargos", somaMeta(encDocs), "ok", "documento de encargos do contador");
  else set("encargos", null, "sem_dados", "sem documento de encargos na competência");
  if ((fl.data?.length ?? 0) > 0) set("temporarios", soma(fl.data, "gross_amount"), "ok", "freelances pagos no mês");
  else set("temporarios", null, "sem_dados", "nenhum freelance pago no mês");
  return { valores, campos };
}

// ---------------------------------------------------------------------------------------------
// Fonte: fechamento publicado em repositório GitHub
//   config: { repo: 'owner/nome', unidade: '<chave no artefato>', branch?: 'main', caminho?: 'fechamento/AAAA-MM.json' }
//
// Regras de leitura (espelham packages/engine/src/fechamento.ts):
//   · o que o artefato não citou permanece intocado no banco;
//   · 'sem_fonte' é declaração de ausência de fonte, não afirmação sobre o campo → ignorado.
//     Sem isso, um repositório que publica o universo inteiro zeraria a receita que outro trouxe;
//   · arquivo ausente (404) não é erro: a fonte existe e o mês ainda não foi publicado.
// ---------------------------------------------------------------------------------------------
const SCHEMA_FECHAMENTO = "sf.fechamento/1";
const STATUS_FECHAMENTO: readonly Status[] = ["ok", "sem_fonte", "sem_dados", "parcial", "manual"];

/** Todas as colunas como `sem_dados` — a fonte existe, o mês não foi publicado. */
function extracaoVazia(obs: string): Extracao {
  const valores: Record<string, number | null> = {};
  const campos: Record<string, Campo> = {};
  for (const c of COLUNAS) { valores[c] = null; campos[c] = campo("github", "sem_dados", obs); }
  return { valores, campos };
}

async function baixarFechamento(repo: string, branch: string, caminho: string): Promise<{ achou: boolean; texto: string }> {
  const token = Deno.env.get("GITHUB_TOKEN") ?? "";
  const headers: Record<string, string> = { "User-Agent": "sim-sincronizar" };
  let url = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${caminho}`;
  if (token) {
    url = `https://api.github.com/repos/${repo}/contents/${caminho}?ref=${encodeURIComponent(branch)}`;
    headers.Authorization = `Bearer ${token}`;
    headers.Accept = "application/vnd.github.raw";
  }
  const res = await fetch(url, { headers });
  if (res.status === 404) return { achou: false, texto: "" };
  const texto = await res.text();
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status} em ${repo}/${caminho}`);
  return { achou: true, texto };
}

type UnidadeFechamento = {
  chave?: unknown; rotulo?: unknown; detalhes?: Record<string, unknown>;
  valores?: Record<string, unknown>;
  campos?: Record<string, { status?: unknown; obs?: unknown }>;
};

async function extrairGithub(f: Fonte, comp: string): Promise<Extracao> {
  const repo = f.config.repo, alvo = f.config.unidade, branch = f.config.branch || "main";
  if (!repo || !alvo) throw new Error("config da fonte github exige 'repo' e 'unidade'");
  const caminho = f.config.caminho || `fechamento/${comp}.json`;

  const { achou, texto } = await baixarFechamento(repo, branch, caminho);
  if (!achou) return extracaoVazia(`o repositório ${repo} ainda não publicou ${caminho}`);
  if (texto.trim() === "") return extracaoVazia(`${repo}/${caminho} está vazio`);

  let bruto: Record<string, unknown>;
  try { bruto = JSON.parse(texto) as Record<string, unknown>; } catch { throw new Error(`${repo}/${caminho} não é JSON válido`); }
  if (bruto.schema !== SCHEMA_FECHAMENTO) throw new Error(`${repo}/${caminho}: schema ${JSON.stringify(bruto.schema)} não é '${SCHEMA_FECHAMENTO}'`);
  if (bruto.competencia !== comp) throw new Error(`${repo}/${caminho}: competência ${JSON.stringify(bruto.competencia)} não é '${comp}'`);
  const lista = (Array.isArray(bruto.unidades) ? bruto.unidades : []) as UnidadeFechamento[];
  if (lista.length === 0) throw new Error(`${repo}/${caminho}: sem 'unidades'`);

  const norm = (x: unknown) => String(x ?? "").trim().toLowerCase();
  const u = lista.find((x) => norm(x.chave) === norm(alvo)) ?? lista.find((x) => norm(x.rotulo) === norm(alvo));
  if (!u) return extracaoVazia(`${repo}/${caminho} não traz a unidade '${alvo}' (tem: ${lista.map((x) => String(x.chave ?? "?")).join(", ")})`);
  if (!u.valores || typeof u.valores !== "object") throw new Error(`${repo}/${caminho}: unidade '${alvo}' sem 'valores'`);

  const valores: Record<string, number | null> = {};
  const campos: Record<string, Campo> = {};
  for (const c of COLUNAS) {
    if (!(c in u.valores)) continue; // não citado: outra fonte pode ter trazido
    const cru = u.valores[c];
    const v = cru === null ? null : Number(cru);
    if (v !== null && !Number.isFinite(v)) { console.warn("sim-sincronizar github: valor inválido", repo, caminho, c, cru); continue; }
    const decl = u.campos?.[c];
    const status = (decl?.status ?? (v === null ? "sem_dados" : "ok")) as Status;
    if (!STATUS_FECHAMENTO.includes(status)) throw new Error(`${repo}/${caminho}: status '${String(decl?.status)}' inválido em '${c}'`);
    if (status === "sem_fonte") continue;
    valores[c] = v;
    campos[c] = campo("github", status, typeof decl?.obs === "string" ? decl.obs : `fechamento publicado por ${repo}`);
  }

  return {
    valores, campos,
    detalhes: {
      ...(u.detalhes ?? {}),
      fechamento: { repo, caminho, branch, sistema: bruto.sistema ?? null, gerado_em: bruto.gerado_em ?? null, parcial: bruto.parcial === true },
    },
  };
}

/** Um 'parcial' de RH não sobrescreve a folha que outra fonte já trouxe (mesma regra da fonte rh ao vivo). */
function aplicarGuardaFolha(ext: Extracao, sistema: unknown) {
  if (sistema === "rh" && ext.campos.folha?.status !== "ok") { delete ext.valores.folha; delete ext.campos.folha; }
}

// ---------------------------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
  if (req.method !== "POST") return json({ error: "método não suportado" }, 405);

  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "serviço indisponível" }, 500);

  // --- auth
  let origem: "cron" | "manual" = "manual";
  let disparadoPor = "";
  const opsKey = Deno.env.get("SIM_OPS_KEY") ?? "";
  const headerKey = req.headers.get("x-ops-key") ?? "";
  if (opsKey && headerKey && igualSeguro(headerKey, opsKey)) {
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
  const competencias = Array.isArray(body.competencias) && body.competencias.length
    ? body.competencias.filter((c): c is string => typeof c === "string" && /^\d{4}-\d{2}$/.test(c)).slice(0, 24)
    : [competenciaBelem(-1), competenciaBelem(0)];
  if (competencias.length === 0) return json({ error: "competências inválidas (use YYYY-MM)" }, 400);
  const empresaId = typeof body.empresa_id === "string" ? body.empresa_id : null;
  const sobrescrever = body.sobrescrever === true;
  const corrente = competenciaBelem(0);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  // --- guarda contra execução concorrente
  const { data: rodando } = await admin.from("sim_sincronizacao").select("id").eq("status", "executando")
    .gte("iniciado_em", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
  if (rodando && rodando.length) return json({ error: "já existe uma sincronização em andamento" }, 409);

  const { data: log, error: logErr } = await admin.from("sim_sincronizacao").insert({
    empresa_id: empresaId, competencias: competencias.map((c) => `${c}-01`), origem, disparado_por: disparadoPor,
  }).select("id").single();
  if (logErr || !log) return json({ error: `não consegui abrir o log: ${logErr?.message}` }, 500);

  let q = admin.from("sim_fonte_dados").select("id, empresa_id, tipo, chave, ativo, config, sim_empresa!inner(razao_social, nome_fantasia)").eq("ativo", true);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data: fontesRaw, error: fErr } = await q;
  if (fErr) {
    await admin.from("sim_sincronizacao").update({ status: "erro", erro: fErr.message, concluido_em: new Date().toISOString() }).eq("id", log.id);
    return json({ error: fErr.message }, 500);
  }
  const fontes = (fontesRaw ?? []) as unknown as (Fonte & { sim_empresa: { razao_social: string; nome_fantasia: string | null } })[];

  const clinicaUrl = Deno.env.get("CLINICA_SUPABASE_URL"), clinicaKey = Deno.env.get("CLINICA_SUPABASE_SERVICE_ROLE_KEY");
  const projetoB = clinicaUrl && clinicaKey ? createClient(clinicaUrl, clinicaKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

  const resultado: Record<string, { nome: string; fontes: Record<string, Record<string, { ok: boolean; campos?: number; erro?: string }>> }> = {};
  let erros = 0, gravacoes = 0;

  // Ordem por empresa: o fechamento publicado primeiro, depois o dado vivo.
  // Assim o github preenche o que a fonte ao vivo não alcança, e nunca o contrário.
  // O RH fica por último porque sobrescreve a folha quando tem o documento do contador.
  const ordem = { github: 0, pdv: 1, clinica: 1, rh: 2 } as const;
  const porEmpresa = new Map<string, typeof fontes>();
  for (const f of fontes) porEmpresa.set(f.empresa_id, [...(porEmpresa.get(f.empresa_id) ?? []), f]);

  for (const [eid, lista] of porEmpresa) {
    lista.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
    const nome = lista[0].sim_empresa.nome_fantasia ?? lista[0].sim_empresa.razao_social;
    // O relatório é indexado por tipo; quando a empresa tem duas fontes do mesmo tipo
    // (dois repositórios distintos), acrescenta a chave para não perder uma no relatório.
    const quantos = new Map<string, number>();
    for (const f of lista) quantos.set(f.tipo, (quantos.get(f.tipo) ?? 0) + 1);
    resultado[eid] = { nome, fontes: {} };

    for (const f of lista) {
      const rotuloFonte = (quantos.get(f.tipo) ?? 0) > 1
        ? `${f.tipo}·${f.chave || f.config.repo || f.id.slice(0, 8)}`
        : f.tipo;
      resultado[eid].fontes[rotuloFonte] = {};
      for (const comp of competencias) {
        const slot = resultado[eid].fontes[rotuloFonte];
        try {
          let ext: Extracao;
          if (f.tipo === "pdv") {
            const { data, error } = await admin.rpc("sim_extrair_pdv", { p_unit_id: f.config.unit_id, p_competencia: `${comp}-01` });
            if (error) throw new Error(error.message);
            ext = data as Extracao;
          } else if (f.tipo === "clinica") {
            if (!projetoB) throw new Error("CLINICA_SUPABASE_URL / CLINICA_SUPABASE_SERVICE_ROLE_KEY não configuradas");
            ext = await extrairClinica(projetoB, f.config.clinic_id, comp, comp === corrente);
          } else if (f.tipo === "rh") {
            if (!projetoB) throw new Error("CLINICA_SUPABASE_URL / CLINICA_SUPABASE_SERVICE_ROLE_KEY não configuradas");
            ext = await extrairRh(projetoB, f.config.unit_id, comp);
            // sem documento de folha, não sobrescreve o que PDV/clínica trouxeram
            aplicarGuardaFolha(ext, "rh");
          } else {
            ext = await extrairGithub(f, comp);
            aplicarGuardaFolha(ext, (ext.detalhes?.fechamento as { sistema?: unknown } | undefined)?.sistema);
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
          erros++;
          slot[comp] = { ok: false, erro: e instanceof Error ? e.message : String(e) };
          console.error("sim-sincronizar", nome, f.tipo, comp, e);
        }
      }
    }
  }

  const status = erros === 0 ? "ok" : gravacoes === 0 ? "erro" : "parcial";
  await admin.from("sim_sincronizacao").update({
    status, resultado, concluido_em: new Date().toISOString(),
    erro: erros ? `${erros} extração(ões) falharam` : null,
  }).eq("id", log.id);
  return json({ sincronizacao_id: log.id, status, competencias, resultado });
});
