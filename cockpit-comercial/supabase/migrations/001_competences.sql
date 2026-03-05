-- ============================================================
-- MIGRATION 001: Competências mensais, metas e snapshots
-- Rodar no Supabase SQL Editor (como service_role ou superuser)
-- ============================================================

-- ─── COMPETENCES ────────────────────────────────────────────
-- Representa uma competência mensal (ex.: 2026-03).
-- Uma empresa pode ter múltiplas competências, mas apenas uma
-- marcada como is_active = true ao mesmo tempo.
create table if not exists public.competences (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  period        char(7) not null,   -- formato YYYY-MM, ex.: '2026-03'
  label         text,               -- ex.: 'Março 2026'
  is_active     boolean not null default false,
  opened_at     timestamptz,        -- quando o admin ativou a competência
  closed_at     timestamptz,        -- preenchido ao fechar/virar o mês
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, period)
);

alter table public.competences enable row level security;

-- Qualquer membro da empresa pode ler a competência ativa
create policy "members_read_competences" on public.competences
  for select using (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );

-- Somente admin pode criar/editar
create policy "admin_manage_competences" on public.competences
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and company_id = competences.company_id
        and role = 'admin'
    )
  );

-- ─── COMPETENCE_GOALS ───────────────────────────────────────
-- Meta mensal por empresa/time (definida pelo admin).
create table if not exists public.competence_goals (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  competence_id   uuid not null references public.competences(id) on delete cascade,
  -- null = meta da empresa inteira; uuid = meta de vendedor específico
  seller_id       uuid references public.profiles(id) on delete cascade,
  goal_brl        numeric(14,2) not null default 0,   -- meta em R$
  ticket_oficial  numeric(14,2),                       -- ticket médio oficial
  taxa_alvo_pct   numeric(5,2) not null default 20,   -- taxa de conversão alvo (%)
  -- Pesos base herdada por estágio (0..1 ou 0..100 conforme uso)
  weight_contato      numeric(4,3) not null default 0.1,
  weight_respondeu    numeric(4,3) not null default 0.4,
  weight_negociacao   numeric(4,3) not null default 0.8,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, competence_id, seller_id)
);

alter table public.competence_goals enable row level security;

create policy "members_read_goals" on public.competence_goals
  for select using (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );

create policy "admin_manage_goals" on public.competence_goals
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and company_id = competence_goals.company_id
        and role = 'admin'
    )
  );

-- ─── COMPETENCE_OPENING_SNAPSHOTS ───────────────────────────
-- Foto do estado do Kanban no início de cada competência.
-- Gerado pelo job de virada de mês (ou pelo admin).
create table if not exists public.competence_opening_snapshots (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  competence_id   uuid not null references public.competences(id) on delete cascade,
  seller_id       uuid references public.profiles(id) on delete cascade,
  -- Contagem por status no momento da abertura
  cnt_novo        int not null default 0,
  cnt_contato     int not null default 0,
  cnt_respondeu   int not null default 0,
  cnt_negociacao  int not null default 0,
  cnt_ganho       int not null default 0,
  cnt_perdido     int not null default 0,
  snapshot_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (company_id, competence_id, seller_id)
);

alter table public.competence_opening_snapshots enable row level security;

create policy "members_read_snapshots" on public.competence_opening_snapshots
  for select using (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );

create policy "admin_manage_snapshots" on public.competence_opening_snapshots
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and company_id = competence_opening_snapshots.company_id
        and role = 'admin'
    )
  );

-- ─── COMPETENCE_INHERITED_BASE ───────────────────────────────
-- Leads que entraram herdados no mês (estavam em Contato/
-- Respondeu/Negociação na virada) e precisam de ação qualificada.
create table if not exists public.competence_inherited_base (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  competence_id   uuid not null references public.competences(id) on delete cascade,
  seller_id       uuid not null references public.profiles(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  inherited_stage text not null, -- estágio no momento da virada (contato/respondeu/negociacao)
  reactivated     boolean not null default false, -- foi reativado (ação qualificada) no mês?
  reactivated_at  timestamptz,
  created_at      timestamptz not null default now(),
  unique (competence_id, lead_id)
);

alter table public.competence_inherited_base enable row level security;

create policy "members_read_inherited" on public.competence_inherited_base
  for select using (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );

create policy "admin_manage_inherited" on public.competence_inherited_base
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and company_id = competence_inherited_base.company_id
        and role = 'admin'
    )
  );

-- Vendedor pode atualizar o flag reativado do próprio lead
create policy "seller_update_reactivation" on public.competence_inherited_base
  for update using (
    seller_id = auth.uid()
      and company_id in (
        select company_id from public.profiles where id = auth.uid()
      )
  );
