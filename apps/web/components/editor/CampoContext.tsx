'use client'
import { createContext, useContext } from 'react'
import type { Rascunho } from '@/lib/rascunho'

export type EstadoSalvo = 'salvo' | 'pendente' | 'salvando' | 'erro'

interface Ctx {
  /** Último rascunho confirmado pelo servidor — base para saber se cada campo já foi salvo. */
  salvo: Rascunho | null
  estado: EstadoSalvo
  salvarAgora: () => void
}

export const CampoContext = createContext<Ctx>({ salvo: null, estado: 'salvo', salvarAgora: () => {} })
export const useCampo = () => useContext(CampoContext)

/** Campos obrigatórios (caminho no rascunho) — em vermelho enquanto vazios. */
export const OBRIGATORIOS: string[][] = [
  ['historico', 'rb12'], ['historico', 'pctVista'], ['historico', 'pctPrazo'], ['historico', 'pctCartao'], ['historico', 'prazoRecebDias'],
  ['historico', 'pctComissao'], ['historico', 'compras12'], ['historico', 'prazoPagFornecDias'],
  ['historico', 'folha12'], ['historico', 'fixos12'],
  ['abertura', 'caixa0'], ['abertura', 'capitalSocial'],
]

export type StatusCampo = 'vazio' | 'opcional' | 'pendente' | 'salvo' | 'importado'
