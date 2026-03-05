-- ============================================================
-- MIGRATION 002: Atualizações na tabela leads
-- Rodar no Supabase SQL Editor
-- ============================================================

-- Motivo de perda (obrigatório ao marcar como perdido)
alter table public.leads
  add column if not exists loss_reason text;

-- Canal do próximo contato (whatsapp, ligacao, email, reuniao, outro)
alter table public.leads
  add column if not exists next_action_channel text;

-- Responsável pelo próximo contato (UUID de um profile)
alter table public.leads
  add column if not exists next_action_owner uuid references public.profiles(id);

-- Competência de entrada do lead (YYYY-MM em que foi criado/importado)
-- Calculado uma vez na criação; não muda.
alter table public.leads
  add column if not exists entry_competence char(7);

-- Preenche entry_competence para leads existentes que ainda não têm
update public.leads
set entry_competence = to_char(created_at, 'YYYY-MM')
where entry_competence is null;

-- Índice para filtros de competência
create index if not exists leads_entry_competence_idx
  on public.leads (company_id, entry_competence);

-- Índice para próxima ação (agenda e alertas de risco)
create index if not exists leads_next_contact_at_idx
  on public.leads (company_id, owner_id, next_contact_at)
  where next_contact_at is not null;
