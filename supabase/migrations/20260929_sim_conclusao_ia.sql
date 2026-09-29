-- Conclusão por IA (PRD §9.1): um registro por geração, ligado à simulação e ao cenário analisado.
create table if not exists public.sim_conclusao_ia (
  id uuid primary key default gen_random_uuid(),
  simulacao_id uuid not null references public.sim_simulacao(id) on delete cascade,
  cenario_tipo text not null,
  cenario_nome text not null,
  modelo text not null,
  prompt_version text not null,
  texto text not null,
  numeros_validados boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists sim_conclusao_ia_simulacao_idx on public.sim_conclusao_ia (simulacao_id, created_at desc);

alter table public.sim_conclusao_ia enable row level security;

create policy sim_conclusao_ia_select on public.sim_conclusao_ia for select to authenticated using (public.sim_autorizado());
create policy sim_conclusao_ia_insert on public.sim_conclusao_ia for insert to authenticated with check (public.sim_autorizado());
create policy sim_conclusao_ia_delete on public.sim_conclusao_ia for delete to authenticated using (public.sim_autorizado());
