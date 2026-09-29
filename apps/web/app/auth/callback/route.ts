import { NextResponse, type NextRequest } from 'next/server'
import { emailAutorizado } from '@/lib/auth'
import { criarCliente } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const next = req.nextUrl.searchParams.get('next')
  const destino = next && next.startsWith('/') && !next.startsWith('//') ? next : '/empresas'
  const base = req.nextUrl.clone()
  base.search = ''
  if (code) {
    const sb = await criarCliente()
    const { data, error } = await sb.auth.exchangeCodeForSession(code)
    if (!error && emailAutorizado(data.user?.email)) {
      base.pathname = destino
      return NextResponse.redirect(base)
    }
    await sb.auth.signOut()
  }
  base.pathname = '/login'
  base.searchParams.set('erro', code ? 'acesso' : 'link')
  return NextResponse.redirect(base)
}
