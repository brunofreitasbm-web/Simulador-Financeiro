'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense, useActionState, useState } from 'react'
import { entrarComPin, entrarComSenha, enviarLink, recuperarSenha, type EstadoLogin } from './actions'

type Modo = 'pin' | 'senha' | 'link' | 'recuperar'

const TITULO: Record<Modo, string> = { pin: 'Entrar com PIN', senha: 'Entrar na sua conta', link: 'Entrar com link por e-mail', recuperar: 'Criar ou redefinir senha' }

function AvisoLink() {
  const erro = useSearchParams().get('erro')
  if (!erro) return null
  return (
    <p role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
      {erro === 'acesso'
        ? 'Esta conta não tem acesso ao simulador.'
        : 'O link expirou ou foi aberto em outro navegador. Peça um novo e abra-o no mesmo navegador.'}
    </p>
  )
}

const inputCls =
  'w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30'

function Campo({ id, label, ...p }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input id={id} name={id} className={inputCls} {...p} />
    </div>
  )
}

export default function Login() {
  const [modo, setModo] = useState<Modo>('pin')
  const [sPin, aPin, pPin] = useActionState<EstadoLogin, FormData>(entrarComPin, {})
  const [sSenha, aSenha, pSenha] = useActionState<EstadoLogin, FormData>(entrarComSenha, {})
  const [sLink, aLink, pLink] = useActionState<EstadoLogin, FormData>(enviarLink, {})
  const [sRec, aRec, pRec] = useActionState<EstadoLogin, FormData>(recuperarSenha, {})
  const estado = modo === 'pin' ? sPin : modo === 'senha' ? sSenha : modo === 'link' ? sLink : sRec
  const acao = modo === 'pin' ? aPin : modo === 'senha' ? aSenha : modo === 'link' ? aLink : aRec
  const pendente = pPin || pSenha || pLink || pRec

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[400px] flex-col justify-center gap-5">
      <div className="text-center">
        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-lg bg-brand text-lg font-bold text-white" aria-hidden>S</span>
        <h1 className="text-2xl font-semibold">{TITULO[modo]}</h1>
        <p className="mt-1 text-sm text-ink-soft">Simulador Financeiro · acesso restrito</p>
      </div>

      <Suspense><AvisoLink /></Suspense>

      <div className="rounded-xl border border-line bg-card p-6 shadow-sm">
        {estado.enviado ? (
          <div className="space-y-3 text-sm" role="status">
            <p className="font-medium text-ok">
              {estado.enviado === 'link' ? 'Link de acesso enviado' : 'E-mail de redefinição enviado'} para {estado.email}.
            </p>
            <p className="text-ink-soft">
              Abra o e-mail <b>neste mesmo navegador</b> e clique no link.
              {estado.enviado === 'recuperacao' && ' Você vai definir a senha na sequência.'} Pode levar alguns minutos; olhe também o spam.
            </p>
          </div>
        ) : (
          <form action={acao} className="space-y-4">
            {modo === 'pin' ? (
              <Campo id="pin" label="PIN" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoFocus autoComplete="current-password" placeholder="6 dígitos" />
            ) : (
              <Campo id="email" label="E-mail" type="email" required autoComplete="email" autoFocus defaultValue={estado.email} placeholder="voce@empresa.com" />
            )}
            {modo === 'senha' && <Campo id="senha" label="Senha" type="password" required autoComplete="current-password" placeholder="Sua senha" />}
            {estado.erro && <p role="alert" className="text-sm text-bad">{estado.erro}</p>}
            <button
              type="submit" disabled={pendente}
              className="w-full rounded-md bg-brand px-3 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {pendente ? 'Aguarde…' : modo === 'pin' || modo === 'senha' ? 'Entrar' : modo === 'link' ? 'Enviar link de acesso' : 'Enviar e-mail de redefinição'}
            </button>
          </form>
        )}

        {!estado.enviado && (
          <div className="mt-5 space-y-2 border-t border-line pt-4 text-center text-sm">
            {modo !== 'pin' && <button onClick={() => setModo('pin')} className="block w-full text-brand-dark underline-offset-2 hover:underline">Entrar com PIN</button>}
            {modo !== 'senha' && <button onClick={() => setModo('senha')} className="block w-full text-brand-dark underline-offset-2 hover:underline">Entrar com e-mail e senha</button>}
            {modo !== 'link' && <button onClick={() => setModo('link')} className="block w-full text-brand-dark underline-offset-2 hover:underline">Entrar com link por e-mail (sem senha)</button>}
            {modo !== 'recuperar' && <button onClick={() => setModo('recuperar')} className="block w-full text-ink-soft underline-offset-2 hover:underline">Primeiro acesso ou esqueci a senha</button>}
          </div>
        )}
        {estado.enviado && (
          <button onClick={() => window.location.reload()} className="mt-4 w-full text-center text-sm text-brand-dark hover:underline">Voltar</button>
        )}
      </div>
      <p className="text-center text-xs text-ink-soft">Somente e-mails autorizados. Não há cadastro aberto.</p>
    </div>
  )
}
