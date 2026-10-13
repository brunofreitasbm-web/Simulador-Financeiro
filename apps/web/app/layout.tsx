import type { Metadata } from 'next'
import { Fira_Code, Fira_Sans } from 'next/font/google'
import Link from 'next/link'
import { sair } from './login/actions'
import { criarCliente } from '@/lib/supabase/server'
import './globals.css'

const firaSans = Fira_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-fira-sans', display: 'swap' })
const firaCode = Fira_Code({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-fira-code', display: 'swap' })

export const metadata: Metadata = {
  title: 'Saúde Financeira | Espelho Real das Operações',
  description: 'Gestão da real saúde financeira: Balanço Patrimonial didático em T, DRE em cascata e semáforos de liquidez e margens.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { data } = await (await criarCliente()).auth.getUser()
  const email = data.user?.email
  return (
    <html lang="pt-BR" className={`${firaSans.variable} ${firaCode.variable}`}>
      <body className="min-h-screen">
        <a href="#conteudo" className="skip-link">Ir para o conteúdo</a>
        <header className="no-print sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-3">
            <Link href="/empresas" className="flex items-center gap-2 font-semibold text-brand-dark">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-brand text-xs font-bold text-white" aria-hidden>
                SF
              </span>
              Saúde Financeira
            </Link>
            <nav className="text-sm text-ink-soft">
              <Link href="/empresas" className="font-medium text-ink hover:text-brand-dark">Início</Link>
            </nav>
            {email && (
              <form action={sair} className="ml-auto flex items-center gap-3 text-sm text-ink-soft">
                <span>{email}</span>
                <Link href="/auth/nova-senha" className="hover:text-ink">Alterar senha</Link>
                <button className="rounded-md border border-line px-2 py-1 hover:bg-paper">Sair</button>
              </form>
            )}
          </div>
        </header>
        <main id="conteudo" className="mx-auto max-w-[1400px] px-4 py-5">{children}</main>
      </body>
    </html>
  )
}
