// Ponte autenticada entre o Simulador Financeiro e o Gemini. A chave nunca sai do Supabase.
//
// POST { system: string, prompt: string } -> { texto, modelo }
// Só responde a usuários autorizados no simulador (public.sim_autorizado(), avaliada com o JWT de quem chamou).
// O prompt (e a versão dele) vivem no repositório do simulador; aqui só se repassa e devolve o texto.
//
// Secrets: GEMINI_API_KEY (aceita também GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY / GOOGLE_AI_API_KEY),
// GEMINI_MODEL (opcional, padrão gemini-2.5-flash). SUPABASE_URL e SUPABASE_ANON_KEY já vêm injetados.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_CHARS = 60_000;

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors() } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
  if (req.method !== "POST") return json({ error: "método não suportado" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return json({ error: "serviço indisponível" }, 500);

  const sb = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: autorizado, error: authErr } = await sb.rpc("sim_autorizado");
  if (authErr || autorizado !== true) return json({ error: "não autorizado" }, 403);

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY") ??
    Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY") ?? Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) return json({ error: "chave do Gemini não configurada (secret GEMINI_API_KEY)" }, 500);

  let body: { system?: unknown; prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const system = typeof body.system === "string" ? body.system : "";
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt || system.length + prompt.length > MAX_CHARS) return json({ error: "prompt vazio ou grande demais" }, 400);

  const modelo = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    });
    const d = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error("gerar-conclusao: Gemini HTTP", resp.status, d?.error?.message);
      return json({ error: `Gemini respondeu ${resp.status}${d?.error?.message ? `: ${d.error.message}` : ""}` }, 502);
    }
    const partes = (d?.candidates?.[0]?.content?.parts ?? []) as { text?: string }[];
    const texto = partes.map((p) => p.text ?? "").join("").trim();
    if (!texto) return json({ error: `Gemini não devolveu texto (${d?.candidates?.[0]?.finishReason ?? d?.promptFeedback?.blockReason ?? "sem motivo"})` }, 502);
    return json({ texto, modelo });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "erro desconhecido" }, 500);
  }
});
