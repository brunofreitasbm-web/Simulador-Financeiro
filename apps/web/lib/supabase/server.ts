import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** Cliente Supabase ligado à sessão do usuário (cookies). O RLS do banco só libera os e-mails autorizados. */
export async function criarCliente() {
  const store = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (lista) => {
        try { for (const { name, value, options } of lista) store.set(name, value, options) } catch { /* chamado de Server Component: o middleware renova a sessão */ }
      },
    },
  })
}

export type Cliente = Awaited<ReturnType<typeof criarCliente>>
