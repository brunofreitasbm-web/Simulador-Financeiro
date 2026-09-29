/** Atualização imutável por caminho. */
export function setIn<T>(obj: T, path: (string | number)[], valor: unknown): T {
  if (path.length === 0) return valor as T
  const [k, ...resto] = path
  const base = (Array.isArray(obj) ? [...obj] : { ...(obj as object) }) as Record<string | number, unknown>
  base[k] = setIn(base[k], resto, valor)
  return base as T
}

export function getIn(obj: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string | number, unknown>)[k]), obj)
}
