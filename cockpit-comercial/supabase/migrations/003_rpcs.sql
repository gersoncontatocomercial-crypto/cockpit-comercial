-- ============================================================
-- MIGRATION 003: RPCs para Pipeline, Produção, Base Herdada e Projeção
-- Rodar no Supabase SQL Editor
-- ============================================================

-- ─── RPC: get_pipeline_snapshot ─────────────────────────────
-- Retorna estoque atual do Kanban (snapshot ao vivo), com aging.
-- Não filtra por competência — é o estado operacional contínuo.
create or replace function public.get_pipeline_snapshot(
  p_company_id uuid,
  p_seller_id  uuid default null
)
returns table (
  status          text,
  total           bigint,
  avg_seconds     numeric,
  overdue_count   bigint,   -- próxima ação vencida
  no_action_count bigint    -- sem next_contact_at definido (apenas abertos)
)
language sql
stable
security definer
as $$
  select
    l.status,
    count(*)                                                  as total,
    round(avg(extract(epoch from (now() - coalesce(l.stage_entered_at, l.created_at)))))
                                                             as avg_seconds,
    count(*) filter (
      where l.next_contact_at < now()
        and l.status not in ('ganho','perdido','fechado')
    )                                                        as overdue_count,
    count(*) filter (
      where l.next_contact_at is null
        and l.status not in ('ganho','perdido','fechado','novo')
    )                                                        as no_action_count
  from public.leads l
  where l.company_id = p_company_id
    and (p_seller_id is null or l.owner_id = p_seller_id)
  group by l.status;
$$;

grant execute on function public.get_pipeline_snapshot(uuid, uuid) to authenticated;

-- ─── RPC: get_competence_production ─────────────────────────
-- Retorna métricas de produção dentro de uma competência.
-- Considera apenas eventos de stage_changed que ocorreram dentro do mês.
create or replace function public.get_competence_production(
  p_company_id    uuid,
  p_competence    char(7),   -- YYYY-MM
  p_seller_id     uuid default null
)
returns table (
  novos_contatos     bigint,  -- leads criados/chegados no mês (entry_competence = p_competence)
  herdados_total     bigint,  -- leads na base herdada do mês
  herdados_reativados bigint, -- herdados com ação qualificada no mês
  respondeu_mes      bigint,  -- chegaram em 'respondeu' no mês (evento to_stage = 'respondeu')
  negociacao_mes     bigint,  -- chegaram em 'negociacao' no mês
  ganhos_mes         bigint,  -- chegaram em 'ganho' no mês
  perdidos_mes       bigint,  -- chegaram em 'perdido' no mês
  trabalhados_mes    bigint,  -- novos + herdados_reativados
  valor_entregue     numeric, -- soma de deal_value dos ganhos no mês
  taxa_conversao     numeric  -- ganhos_mes / trabalhados_mes (0..1)
)
language sql
stable
security definer
as $$
  with
    period_start as (
      select (p_competence || '-01')::date as ps
    ),
    period_end as (
      select (date_trunc('month', (p_competence || '-01')::date) + interval '1 month')::date as pe
    ),
    novos as (
      select count(*) as cnt
      from public.leads
      where company_id = p_company_id
        and entry_competence = p_competence
        and (p_seller_id is null or owner_id = p_seller_id)
    ),
    herdados as (
      select
        count(*)                                        as total,
        count(*) filter (where reactivated = true)      as reativados
      from public.competence_inherited_base cib
      join public.competences c on c.id = cib.competence_id
      where c.company_id = p_company_id
        and c.period = p_competence
        and (p_seller_id is null or cib.seller_id = p_seller_id)
    ),
    stage_events as (
      -- 'fechado' is treated as equivalent to 'ganho' (legacy status name);
      -- both map to a successful close event in the pipeline.
      select
        count(*) filter (where e.to_stage in ('respondeu'))           as respondeu_cnt,
        count(*) filter (where e.to_stage in ('negociacao'))          as negociacao_cnt,
        count(*) filter (where e.to_stage in ('ganho','fechado'))     as ganho_cnt,
        count(*) filter (where e.to_stage = 'perdido')                as perdido_cnt,
        coalesce(sum(l.deal_value) filter (
          where e.to_stage in ('ganho','fechado')
        ), 0)                                                         as valor_entregue
      from public.lead_events e
      join public.leads l on l.id = e.lead_id
      where e.company_id = p_company_id
        and e.event_type = 'stage_changed'
        and e.created_at >= (select ps from period_start)
        and e.created_at <  (select pe from period_end)
        and (p_seller_id is null or l.owner_id = p_seller_id)
    )
  select
    n.cnt                                          as novos_contatos,
    h.total                                        as herdados_total,
    h.reativados                                   as herdados_reativados,
    s.respondeu_cnt                                as respondeu_mes,
    s.negociacao_cnt                               as negociacao_mes,
    s.ganho_cnt                                    as ganhos_mes,
    s.perdido_cnt                                  as perdidos_mes,
    (n.cnt + h.reativados)                         as trabalhados_mes,
    s.valor_entregue                               as valor_entregue,
    case when (n.cnt + h.reativados) > 0
      then round(s.ganho_cnt::numeric / (n.cnt + h.reativados), 4)
      else 0
    end                                            as taxa_conversao
  from novos n, herdados h, stage_events s;
$$;

grant execute on function public.get_competence_production(uuid, char, uuid) to authenticated;

-- ─── RPC: get_inherited_base_detail ─────────────────────────
-- Retorna detalhes da base herdada para exibição nos blocos.
create or replace function public.get_inherited_base_detail(
  p_company_id    uuid,
  p_competence    char(7),
  p_seller_id     uuid default null
)
returns table (
  stage             text,
  total             bigint,
  reativados        bigint,
  nao_reativados    bigint,
  potential_value   numeric  -- total de deal_value potencial (se todos convertidos)
)
language sql
stable
security definer
as $$
  select
    cib.inherited_stage                                  as stage,
    count(*)                                             as total,
    count(*) filter (where cib.reactivated = true)       as reativados,
    count(*) filter (where cib.reactivated = false)      as nao_reativados,
    coalesce(sum(l.deal_value), 0)                       as potential_value
  from public.competence_inherited_base cib
  join public.competences c on c.id = cib.competence_id
  join public.leads l on l.id = cib.lead_id
  where c.company_id = p_company_id
    and c.period = p_competence
    and (p_seller_id is null or cib.seller_id = p_seller_id)
  group by cib.inherited_stage;
$$;

grant execute on function public.get_inherited_base_detail(uuid, char, uuid) to authenticated;

-- ─── RPC: get_competence_projection ─────────────────────────
-- Calcula projeção consolidada para o simulador.
create or replace function public.get_competence_projection(
  p_company_id    uuid,
  p_competence    char(7),
  p_seller_id     uuid default null
)
returns table (
  -- A) Meta oficial
  goal_brl            numeric,
  ticket_oficial      numeric,
  taxa_alvo_pct       numeric,
  fechamentos_alvo    numeric,
  contatos_alvo       numeric,
  -- B) Produção do mês
  novos_contatos      bigint,
  trabalhados_mes     bigint,
  ganhos_mes          bigint,
  valor_entregue      numeric,
  taxa_conversao_real numeric,
  -- C) Base herdada
  herdados_contato    bigint,
  herdados_respondeu  bigint,
  herdados_negociacao bigint,
  herdados_total      bigint,
  cobertura_herdada   numeric,  -- valor potencial ponderado pelos pesos
  -- D) Projeção
  meta_bruta          numeric,  -- goal_brl
  entregue            numeric,  -- valor_entregue
  meta_liquida        numeric,  -- meta_bruta - entregue
  falta_fechamentos   numeric,  -- meta_liquida / ticket_oficial
  falta_contatos      numeric,  -- falta_fechamentos / taxa_alvo (fração)
  -- Tickets reais (histórico)
  ticket_real_mes     numeric,
  ticket_real_90d     numeric,
  ticket_real_all     numeric
)
language sql
stable
security definer
as $$
  with
    goal as (
      select
        coalesce(cg.goal_brl, 0)         as goal_brl,
        coalesce(cg.ticket_oficial, 0)   as ticket_oficial,
        coalesce(cg.taxa_alvo_pct, 20)   as taxa_alvo_pct,
        coalesce(cg.weight_contato, 0.1)    as w_contato,
        coalesce(cg.weight_respondeu, 0.4)  as w_respondeu,
        coalesce(cg.weight_negociacao, 0.8) as w_negociacao
      from public.competences c
      left join public.competence_goals cg
             on cg.competence_id = c.id
            and cg.company_id = p_company_id
            and (
              (p_seller_id is null and cg.seller_id is null)
              or cg.seller_id = p_seller_id
            )
      where c.company_id = p_company_id
        and c.period = p_competence
      limit 1
    ),
    prod as (
      select * from public.get_competence_production(p_company_id, p_competence, p_seller_id)
    ),
    inherited as (
      select
        coalesce(sum(total) filter (where stage = 'contato'), 0)     as h_contato,
        coalesce(sum(total) filter (where stage = 'respondeu'), 0)   as h_respondeu,
        coalesce(sum(total) filter (where stage = 'negociacao'), 0)  as h_negociacao
      from public.get_inherited_base_detail(p_company_id, p_competence, p_seller_id)
    ),
    period_bounds as (
      select
        (p_competence || '-01')::date as ps,
        (date_trunc('month', (p_competence || '-01')::date) + interval '1 month')::date as pe
    ),
    real_tickets as (
      select
        coalesce(avg(l.deal_value) filter (
          where e.created_at >= (select ps from period_bounds)
            and e.created_at <  (select pe from period_bounds)
        ), 0) as ticket_mes,
        coalesce(avg(l.deal_value) filter (
          where e.created_at >= now() - interval '90 days'
        ), 0) as ticket_90d,
        coalesce(avg(l.deal_value), 0) as ticket_all
      from public.lead_events e
      join public.leads l on l.id = e.lead_id
      where e.company_id = p_company_id
        and e.event_type = 'stage_changed'
        and e.to_stage in ('ganho','fechado')
        and (p_seller_id is null or l.owner_id = p_seller_id)
        and l.deal_value is not null
        and l.deal_value > 0
    )
  select
    g.goal_brl,
    g.ticket_oficial,
    g.taxa_alvo_pct,
    case when g.ticket_oficial > 0
      then ceil(g.goal_brl / g.ticket_oficial)
      else 0
    end as fechamentos_alvo,
    case when g.ticket_oficial > 0 and g.taxa_alvo_pct > 0
      then ceil(g.goal_brl / g.ticket_oficial / (g.taxa_alvo_pct / 100.0))
      else 0
    end as contatos_alvo,
    -- B
    p.novos_contatos,
    p.trabalhados_mes,
    p.ganhos_mes,
    p.valor_entregue,
    p.taxa_conversao,
    -- C
    i.h_contato,
    i.h_respondeu,
    i.h_negociacao,
    (i.h_contato + i.h_respondeu + i.h_negociacao) as herdados_total,
    round(
      i.h_contato    * g.w_contato    * coalesce(g.ticket_oficial, 0)
      + i.h_respondeu  * g.w_respondeu  * coalesce(g.ticket_oficial, 0)
      + i.h_negociacao * g.w_negociacao * coalesce(g.ticket_oficial, 0)
    , 2) as cobertura_herdada,
    -- D
    g.goal_brl as meta_bruta,
    p.valor_entregue as entregue,
    greatest(g.goal_brl - p.valor_entregue, 0) as meta_liquida,
    case when g.ticket_oficial > 0
      then ceil(greatest(g.goal_brl - p.valor_entregue, 0) / g.ticket_oficial)
      else 0
    end as falta_fechamentos,
    case when g.ticket_oficial > 0 and g.taxa_alvo_pct > 0
      then ceil(
        greatest(g.goal_brl - p.valor_entregue, 0)
        / g.ticket_oficial
        / (g.taxa_alvo_pct / 100.0)
      )
      else 0
    end as falta_contatos,
    rt.ticket_mes as ticket_real_mes,
    rt.ticket_90d as ticket_real_90d,
    rt.ticket_all as ticket_real_all
  from goal g, prod p, inherited i, real_tickets rt;
$$;

grant execute on function public.get_competence_projection(uuid, char, uuid) to authenticated;

-- ─── RPC: open_new_competence ────────────────────────────────
-- Abre uma nova competência: registra snapshot de abertura,
-- classifica leads herdados. Deve ser chamado pelo admin
-- na virada do mês.
create or replace function public.open_new_competence(
  p_company_id  uuid,
  p_period      char(7)  -- YYYY-MM da nova competência
)
returns uuid  -- competence_id criado
language plpgsql
security definer
as $$
declare
  v_competence_id uuid;
  v_label text;
  v_seller record;
  v_lead record;
begin
  -- Apenas admins podem chamar
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and company_id = p_company_id
      and role = 'admin'
  ) then
    raise exception 'Apenas administradores podem abrir competências.';
  end if;

  v_label := to_char((p_period || '-01')::date, 'FMMonth YYYY');

  -- Desativa competência ativa anterior
  update public.competences
  set is_active = false, closed_at = now(), updated_at = now()
  where company_id = p_company_id and is_active = true;

  -- Cria (ou reativa) a nova competência
  insert into public.competences (company_id, period, label, is_active, opened_at)
  values (p_company_id, p_period, trim(v_label), true, now())
  on conflict (company_id, period) do update
    set is_active = true, opened_at = now(), updated_at = now()
  returning id into v_competence_id;

  -- Snapshot por vendedor e base herdada
  for v_seller in
    select distinct owner_id
    from public.leads
    where company_id = p_company_id
      and owner_id is not null
  loop
    -- Snapshot de abertura
    insert into public.competence_opening_snapshots (
      company_id, competence_id, seller_id,
      cnt_novo, cnt_contato, cnt_respondeu, cnt_negociacao,
      cnt_ganho, cnt_perdido, snapshot_at
    )
    select
      p_company_id,
      v_competence_id,
      v_seller.owner_id,
      count(*) filter (where status = 'novo')       as cnt_novo,
      count(*) filter (where status = 'contato')    as cnt_contato,
      count(*) filter (where status = 'respondeu')  as cnt_respondeu,
      count(*) filter (where status = 'negociacao') as cnt_negociacao,
      count(*) filter (where status in ('ganho','fechado'))  as cnt_ganho,
      count(*) filter (where status = 'perdido')    as cnt_perdido,
      now()
    from public.leads
    where company_id = p_company_id
      and owner_id = v_seller.owner_id
    on conflict (company_id, competence_id, seller_id) do nothing;

    -- Base herdada: leads em contato/respondeu/negociacao que "viraram" o mês
    for v_lead in
      select id, status
      from public.leads
      where company_id = p_company_id
        and owner_id = v_seller.owner_id
        and status in ('contato','respondeu','negociacao')
    loop
      insert into public.competence_inherited_base (
        company_id, competence_id, seller_id, lead_id, inherited_stage
      )
      values (
        p_company_id, v_competence_id, v_seller.owner_id,
        v_lead.id, v_lead.status
      )
      on conflict (competence_id, lead_id) do nothing;
    end loop;
  end loop;

  return v_competence_id;
end;
$$;

grant execute on function public.open_new_competence(uuid, char) to authenticated;

-- ─── RPC: mark_lead_reactivated ─────────────────────────────
-- Marca um lead herdado como reativado na competência ativa.
-- Chamado automaticamente ao detectar ação qualificada no lead.
create or replace function public.mark_lead_reactivated(
  p_company_id uuid,
  p_lead_id    uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_competence_id uuid;
begin
  select c.id into v_competence_id
  from public.competences c
  where c.company_id = p_company_id
    and c.is_active = true
  limit 1;

  if v_competence_id is null then return; end if;

  update public.competence_inherited_base
  set reactivated = true, reactivated_at = now()
  where competence_id = v_competence_id
    and lead_id = p_lead_id
    and reactivated = false;
end;
$$;

grant execute on function public.mark_lead_reactivated(uuid, uuid) to authenticated;

-- ─── RPC: seller_move_lead_stage ────────────────────────────
-- Versão atualizada: registra motivo de perda e dispara
-- reativação de base herdada quando apropriado.
-- Se a função já existir, substitui.
create or replace function public.seller_move_lead_stage(
  p_company_id  uuid,
  p_lead_id     uuid,
  p_to_status   text,
  p_reason      text    default null,
  p_deal_value  numeric default null,
  p_to_stage_id uuid    default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_from_status text;
  v_now         timestamptz := now();
  v_seconds     numeric;
begin
  -- Busca status atual
  select status into v_from_status
  from public.leads
  where id = p_lead_id and company_id = p_company_id
  limit 1;

  if v_from_status is null then
    raise exception 'Lead não encontrado ou sem acesso.';
  end if;

  if v_from_status = p_to_status then return; end if;

  -- Calcula tempo no estágio
  select extract(epoch from (v_now - coalesce(stage_entered_at, created_at)))
  into v_seconds
  from public.leads
  where id = p_lead_id;

  -- Atualiza lead
  update public.leads
  set
    status          = p_to_status,
    stage_entered_at = v_now,
    deal_value      = coalesce(p_deal_value, deal_value),
    current_stage_id = coalesce(p_to_stage_id, current_stage_id),
    loss_reason     = case when p_to_status = 'perdido' then p_reason else loss_reason end,
    updated_at      = v_now
  where id = p_lead_id
    and company_id = p_company_id;

  -- Registra evento
  insert into public.lead_events (
    company_id, lead_id, user_id, event_type,
    from_stage, to_stage, seconds_in_from_stage,
    metadata, created_at
  ) values (
    p_company_id, p_lead_id, auth.uid(), 'stage_changed',
    v_from_status, p_to_status, v_seconds,
    jsonb_build_object(
      'source', 'kanban_drag',
      'reason', p_reason
    ),
    v_now
  );

  -- Qualquer mudança de estágio é ação qualificada: marca reativação se herdado
  perform public.mark_lead_reactivated(p_company_id, p_lead_id);
end;
$$;

grant execute on function public.seller_move_lead_stage(uuid, uuid, text, text, numeric, uuid) to authenticated;
