'use client'
import { useRouter } from 'next/navigation'

/** Troca de empresa em 1 clique, sem voltar ao início. */
export function SeletorEmpresa({ atual, empresas, meses }: { atual: string; empresas: { id: string; nome: string }[]; meses: number }) {
  const router = useRouter()
  return (
    <select
      aria-label="Empresa"
      value={atual}
      onChange={(e) => router.push(`/empresas/${e.target.value}/realizado${meses === 24 ? '?meses=24' : ''}`)}
      className="min-h-10 max-w-[22rem] cursor-pointer rounded-md border border-line bg-white px-3 py-1.5 text-lg font-semibold"
    >
      {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
    </select>
  )
}
