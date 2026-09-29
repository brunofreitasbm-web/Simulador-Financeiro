'use client'
import { useEffect, useState } from 'react'

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-card ${className}`}>{children}</div>
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft' }
export function Button({ variant = 'primary', className = '', ...p }: BtnProps) {
  const base = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50'
  const v = {
    primary: 'bg-brand text-white hover:bg-brand-dark',
    soft: 'bg-brand-soft text-brand-dark hover:bg-[#d3eae6]',
    ghost: 'text-ink-soft hover:bg-paper border border-line',
    danger: 'text-bad border border-line hover:bg-bad-soft',
  }[variant]
  return <button className={`${base} ${v} ${className}`} {...p} />
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info' }) {
  const t = {
    neutral: 'bg-paper text-ink-soft', ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad', info: 'bg-brand-soft text-brand-dark',
  }[tone]
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>
}

const fmtNum = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? '' : String(v).replace('.', ','))
const parseNum = (s: string): number | undefined => {
  const t = s.trim().replace(/\s/g, '').replace(/\./g, (m, i, str) => (str.includes(',') ? '' : m)).replace(',', '.')
  if (t === '' || t === '-' || t === '.') return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

interface NumProps {
  value: number | undefined
  onChange: (v: number | undefined) => void
  prefix?: string
  suffix?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Estado visual do campo: vazio (vermelho), pendente (âmbar), salvo (verde), opcional (neutro). */
  status?: 'vazio' | 'opcional' | 'pendente' | 'salvo'
  onCommit?: () => void
}
/** Campo numérico com vírgula decimal. Vazio → undefined (o motor acusa o que é obrigatório). */
const COR_STATUS = {
  vazio: 'border-bad bg-bad-soft/50', pendente: 'border-warn bg-warn-soft/60', salvo: 'border-ok bg-ok-soft/50', opcional: 'border-line bg-white',
} as const
const ROTULO_STATUS = { vazio: 'Campo obrigatório em aberto', pendente: 'Alteração ainda não salva', salvo: 'Preenchido e salvo', opcional: '' } as const
const ICONE_STATUS = { vazio: '!', pendente: '●', salvo: '✓', opcional: '' } as const
const TOM_ICONE = { vazio: 'text-bad', pendente: 'text-warn', salvo: 'text-ok', opcional: '' } as const

export function NumInput({ value, onChange, prefix, suffix, placeholder, className = '', disabled, status, onCommit }: NumProps) {
  const [txt, setTxt] = useState(fmtNum(value))
  useEffect(() => { if (parseNum(txt) !== value) setTxt(fmtNum(value)) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`flex items-center rounded-md border focus-within:ring-1 focus-within:ring-brand ${status ? COR_STATUS[status] : 'border-line bg-white focus-within:border-brand'} ${disabled ? 'opacity-60' : ''} ${className}`} title={status ? ROTULO_STATUS[status] : undefined}>
      {prefix && <span className="pl-2 text-xs text-ink-soft">{prefix}</span>}
      <input
        inputMode="decimal" disabled={disabled} placeholder={placeholder}
        className="num w-full min-w-0 bg-transparent px-2 py-1.5 text-right text-sm outline-none"
        value={txt}
        onChange={(e) => { setTxt(e.target.value); onChange(parseNum(e.target.value)) }}
        onBlur={() => { setTxt(fmtNum(value)); onCommit?.() }}
        aria-invalid={status === 'vazio' || undefined}
      />
      {suffix && <span className="pr-1 text-xs text-ink-soft">{suffix}</span>}
      {status && ICONE_STATUS[status] && <span aria-label={ROTULO_STATUS[status]} className={`pr-2 text-xs font-bold ${TOM_ICONE[status]}`}>{ICONE_STATUS[status]}</span>}
    </div>
  )
}

export function Field({ label, help, children, wide }: { label: string; help?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {help && <span className="text-xs text-ink-soft">{help}</span>}
    </label>
  )
}

export function Select<T extends string>({ value, onChange, options, className = '' }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string
}) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value as T)}
      className={`rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand ${className}`}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function TextInput({ value, onChange, placeholder, className = '' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input
      value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={`rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand ${className}`}
    />
  )
}
