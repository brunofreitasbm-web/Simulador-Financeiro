import { NextResponse, type NextRequest } from 'next/server'
import { emailAutorizado } from '@/lib/auth'
import { criarCliente } from '@/lib/supabase/server'

/**
 * Porta de entrada do Hub de Gestão (gestao.institutofacaamigos.com.br): o hub manda o hashed_token de um magic
 * link nunca enviado por e-mail, e verifyOtp troca esse token (uso único) por sessão. Mesma checagem de e-mail
 * autorizado do /auth/callback. /auth/* já é público no middleware.
 */
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get('token_hash')
  const base = req.nextUrl.clone()
  base.search = ''
  if (tokenHash) {
    const sb = await criarCliente()
    const { data, error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
    if (!error && emailAutorizado(data.user?.email)) {
      base.pathname = '/empresas'
      return semReferrer(NextResponse.redirect(base))
    }
    await sb.auth.signOut()
  }
  base.pathname = '/login'
  base.searchParams.set('erro', tokenHash ? 'acesso' : 'link')
  return semReferrer(NextResponse.redirect(base))
}

function semReferrer(res: NextResponse) {
  res.headers.set('Referrer-Policy', 'no-referrer')
  res.headers.set('Cache-Control', 'no-store')
  return res
}
