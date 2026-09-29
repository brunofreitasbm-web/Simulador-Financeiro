'use server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { emailAutorizado } from '@/lib/auth'
import { criarCliente } from '@/lib/supabase/server'

export type EstadoLogin = { enviado?: 'link' | 'recuperacao'; erro?: string; email?: string }

async function origem() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') || host?.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}

const email = (form: FormData) => String(form.get('email') ?? '').trim().toLowerCase()
const NEGADO = 'Este e-mail não tem acesso ao simulador.'

/** Entrar com e-mail e senha. */
export async function entrarComSenha(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const e = email(form)
  const senha = String(form.get('senha') ?? '')
  if (!emailAutorizado(e)) return { erro: NEGADO, email: e }
  if (!senha) return { erro: 'Informe a senha.', email: e }
  const sb = await criarCliente()
  const { error } = await sb.auth.signInWithPassword({ email: e, password: senha })
  if (error)
    return {
      erro: /invalid login/i.test(error.message)
        ? 'E-mail ou senha incorretos. No primeiro acesso, use "Criar ou redefinir senha".'
        : `Não foi possível entrar: ${error.message}`,
      email: e,
    }
  redirect('/empresas')
}

/** Entrar só com PIN. O PIN é a senha Supabase do usuário (nunca fica no código). */
const EMAIL_PIN = 'brunofreitasbm@gmail.com'
export async function entrarComPin(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const pin = String(form.get('pin') ?? '').trim()
  if (!/^\d{6}$/.test(pin)) return { erro: 'Informe o PIN de 6 dígitos.' }
  const sb = await criarCliente()
  const { error } = await sb.auth.signInWithPassword({ email: EMAIL_PIN, password: pin })
  if (error) return { erro: 'PIN incorreto.' }
  redirect('/empresas')
}

/** Link mágico (sem senha). */
export async function enviarLink(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const e = email(form)
  if (!emailAutorizado(e)) return { erro: NEGADO, email: e }
  const sb = await criarCliente()
  const { error } = await sb.auth.signInWithOtp({
    email: e,
    options: { emailRedirectTo: `${await origem()}/auth/callback`, shouldCreateUser: true },
  })
  if (error) return { erro: `Não foi possível enviar o link: ${error.message}`, email: e }
  return { enviado: 'link', email: e }
}

/** Primeiro acesso / esqueci a senha: envia um link para definir a senha. */
export async function recuperarSenha(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const e = email(form)
  if (!emailAutorizado(e)) return { erro: NEGADO, email: e }
  const sb = await criarCliente()
  const { error } = await sb.auth.resetPasswordForEmail(e, { redirectTo: `${await origem()}/auth/callback?next=/auth/nova-senha` })
  if (error) return { erro: `Não foi possível enviar o e-mail: ${error.message}`, email: e }
  return { enviado: 'recuperacao', email: e }
}

export type EstadoSenha = { erro?: string }

export async function definirSenha(_: EstadoSenha, form: FormData): Promise<EstadoSenha> {
  const nova = String(form.get('senha') ?? '')
  const conf = String(form.get('confirmacao') ?? '')
  if (nova.length < 8) return { erro: 'A senha precisa ter pelo menos 8 caracteres.' }
  if (nova !== conf) return { erro: 'As senhas não conferem.' }
  const sb = await criarCliente()
  const { error } = await sb.auth.updateUser({ password: nova })
  if (error) return { erro: `Não foi possível salvar a senha: ${error.message}` }
  redirect('/empresas')
}

export async function sair() {
  const sb = await criarCliente()
  await sb.auth.signOut()
  redirect('/login')
}
