'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  empresaId?: string
  razaoSocial?: string
  nomeFantasia?: string | null
  empresas?: { id: string; nome: string }[]
}

export function AppSidebar({ empresaId, razaoSocial, nomeFantasia, empresas = [] }: Props) {
  const pathname = usePathname()
  const [recolhida, setRecolhida] = useState(false)

  useEffect(() => {
    const salvo = localStorage.getItem('sidebar_recolhida')
    if (salvo !== null) {
      setRecolhida(salvo === 'true')
    }
  }, [])

  const toggleSidebar = () => {
    const novo = !recolhida
    setRecolhida(novo)
    localStorage.setItem('sidebar_recolhida', String(novo))
  }

  const baseEmpresa = empresaId ? `/empresas/${empresaId}` : ''

  const linksNavegacao = empresaId
    ? [
        {
          rotulo: 'Saúde Geral',
          href: `${baseEmpresa}/saude`,
          icone: '🩺',
          ativo: pathname.includes('/saude'),
          badge: 'Status',
        },
        {
          rotulo: 'Balanço em T',
          href: `${baseEmpresa}/balanco`,
          icone: '⚖️',
          ativo: pathname.includes('/balanco'),
          badge: 'Didático',
        },
        {
          rotulo: 'DRE em Cascata',
          href: `${baseEmpresa}/dre`,
          icone: '📈',
          ativo: pathname.includes('/dre'),
          badge: 'Waterfall',
        },
        {
          rotulo: 'Operações & Dados',
          href: `${baseEmpresa}/realizado`,
          icone: '🔄',
          ativo: pathname.includes('/realizado'),
        },
        {
          rotulo: 'Cadastro da Empresa',
          href: baseEmpresa,
          icone: '⚙️',
          ativo: pathname === baseEmpresa,
        },
      ]
    : []

  return (
    <aside
      className={`no-print sticky top-0 flex h-screen flex-col border-r border-line bg-card transition-all duration-200 z-40 ${
        recolhida ? 'w-16' : 'w-64'
      }`}
    >
      {/* Topo da Sidebar */}
      <div className="flex h-14 items-center justify-between border-b border-line px-3">
        {!recolhida && (
          <Link href="/empresas" className="flex items-center gap-2 overflow-hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white font-bold text-xs shadow-xs">
              SF
            </span>
            <div className="truncate">
              <span className="block text-xs font-bold uppercase tracking-wider text-brand-dark">
                Saúde Financeira
              </span>
              <span className="block text-[10px] text-ink-soft">Gestão Real</span>
            </div>
          </Link>
        )}

        {recolhida && (
          <Link href="/empresas" className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white font-bold text-xs">
            SF
          </Link>
        )}

        <button
          onClick={toggleSidebar}
          aria-label={recolhida ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          className={`flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-soft hover:bg-paper hover:text-ink ${
            recolhida ? 'hidden md:flex' : ''
          }`}
          title={recolhida ? 'Expandir menu' : 'Recolher menu para ver mais área útil'}
        >
          {recolhida ? '→' : '←'}
        </button>
      </div>

      {/* Empresa Ativa / Seletor */}
      {empresaId && !recolhida && (
        <div className="border-b border-line/60 bg-paper/60 p-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
            Empresa Selecionada
          </span>
          <p className="truncate text-xs font-bold text-ink" title={razaoSocial}>
            {nomeFantasia || razaoSocial || 'Empresa'}
          </p>

          {empresas.length > 1 && (
            <div className="mt-2">
              <select
                value={empresaId}
                onChange={(e) => {
                  window.location.href = `/empresas/${e.target.value}/saude`
                }}
                className="w-full rounded border border-line bg-white px-2 py-1 text-[11px] text-ink outline-none focus:border-brand"
              >
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Navegação Principal */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {linksNavegacao.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={recolhida ? item.rotulo : undefined}
            className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
              item.ativo
                ? 'bg-brand text-white shadow-xs font-semibold'
                : 'text-ink-soft hover:bg-paper hover:text-ink'
            } ${recolhida ? 'justify-center px-0' : ''}`}
          >
            <span className="text-base">{item.icone}</span>
            {!recolhida && (
              <div className="flex flex-1 items-center justify-between">
                <span className="truncate">{item.rotulo}</span>
                {item.badge && (
                  <span
                    className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${
                      item.ativo ? 'bg-white/20 text-white' : 'bg-paper text-ink-soft border border-line'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
            )}
          </Link>
        ))}

        <div className="my-3 border-t border-line/60 pt-2">
          <Link
            href="/empresas"
            title={recolhida ? 'Trocar Empresa' : undefined}
            className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-medium text-ink-soft hover:bg-paper hover:text-ink ${
              recolhida ? 'justify-center px-0' : ''
            }`}
          >
            <span className="text-base">🏢</span>
            {!recolhida && <span>Todas as Empresas</span>}
          </Link>
        </div>
      </nav>

      {/* Botão de Toggle inferior quando colapsado */}
      {recolhida && (
        <div className="border-t border-line p-2 text-center">
          <button
            onClick={toggleSidebar}
            className="flex h-8 w-full items-center justify-center rounded-md border border-line text-ink-soft hover:bg-paper"
            title="Expandir barra lateral"
          >
            →
          </button>
        </div>
      )}
    </aside>
  )
}
