'use client'
import { useActionState } from 'react'
import { definirSenha, type EstadoSenha } from '@/app/login/actions'

const inputCls = 'w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30'

export default function NovaSenha() {
  const [estado, acao, pendente] = useActionState<EstadoSenha, FormData>(definirSenha, {})
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[400px] flex-col justify-center gap-5">
      <div className="text-center">
        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-lg bg-brand text-lg font-bold text-white" aria-hidden>S</span>
        <h1 className="text-2xl font-semibold">Definir senha</h1>
        <p className="mt-1 text-sm text-ink-soft">Escolha uma senha com pelo menos 8 caracteres.</p>
      </div>
      <form action={acao} className="space-y-4 rounded-xl border border-line bg-card p-6 shadow-sm">
        <div className="space-y-1.5">
          <label htmlFor="senha" className="text-sm font-medium">Nova senha</label>
          <input id="senha" name="senha" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="confirmacao" className="text-sm font-medium">Confirme a senha</label>
          <input id="confirmacao" name="confirmacao" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
        </div>
        {estado.erro && <p role="alert" className="text-sm text-bad">{estado.erro}</p>}
        <button type="submit" disabled={pendente} className="w-full rounded-md bg-brand px-3 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
          {pendente ? 'Salvando…' : 'Salvar senha e entrar'}
        </button>
      </form>
    </div>
  )
}
