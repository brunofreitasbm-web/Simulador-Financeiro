import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const EMAILS = ['brunofreitasbm@gmail.com', 'isabella.vgoncalves@gmail.com']

/** Renova a sessão e exige login (e-mail autorizado) em todas as rotas, exceto /login e /auth/*. */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) req.cookies.set(name, value)
        res = NextResponse.next({ request: req })
        for (const { name, value, options } of lista) res.cookies.set(name, value, options)
      },
    },
  })
  const { data } = await supabase.auth.getUser()
  const email = data.user?.email?.toLowerCase()
  const ok = !!email && EMAILS.includes(email)
  const p = req.nextUrl.pathname
  const publica = p === '/login' || p.startsWith('/auth/')
  if (!ok && !publica) {
    if (p.startsWith('/api/')) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 })
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  if (ok && p === '/login') {
    const url = req.nextUrl.clone()
    url.pathname = '/empresas'
    return NextResponse.redirect(url)
  }
  return res
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
