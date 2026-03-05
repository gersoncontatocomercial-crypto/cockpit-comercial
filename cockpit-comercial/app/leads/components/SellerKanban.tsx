'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { supabaseBrowser } from '../../lib/supabaseBrowser'
import ConversationPasteAI from './ConversationPasteAI'

// ─── Types ───────────────────────────────────────────────────────────────────

type Lead = {
  id: string
  name: string
  phone: string | null
  status: string
  created_at: string
  stage_entered_at: string | null
  deal_value?: number | null
  current_stage_id?: string | null
  next_contact_at?: string | null
  next_action?: string | null
  next_action_channel?: string | null
  loss_reason?: string | null
}

type CompetenceProduction = {
  novos_contatos: number
  herdados_total: number
  herdados_reativados: number
  trabalhados_mes: number
  ganhos_mes: number
  perdidos_mes: number
  valor_entregue: number
  taxa_conversao: number
}

type CompetenceGoal = {
  period: string
  label: string | null
  goal_brl: number
  ticket_oficial: number
  taxa_alvo_pct: number
}

const STATUSES = ['novo', 'contato', 'respondeu', 'negociacao', 'ganho', 'perdido'] as const
type Status = (typeof STATUSES)[number]

const STATUS_LABEL: Record<Status, string> = {
  novo: 'Novo',
  contato: 'Contato',
  respondeu: 'Respondeu',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
}

const OPEN_STATUSES: Status[] = ['contato', 'respondeu', 'negociacao']

const LOSS_REASONS = [
  'Sem resposta',
  'Sem interesse',
  'Preço',
  'Já fechou com concorrente',
  'Sem tempo / prioridade baixa',
  'Não é o perfil (qualificação)',
  'Telefone inválido / contato incorreto',
  'Outro',
] as const

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'ligacao', label: 'Ligação' },
  { value: 'email', label: 'E-mail' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'outro', label: 'Outro' },
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}

function whatsappLink(phone: string | null) {
  const digits = onlyDigits(phone ?? '')
  if (!digits) return null
  const full = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${full}`
}

function parseBRLMoney(input: string) {
  const s = (input || '').trim()
  if (!s) return null
  const norm = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  const n = Number(norm)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function moneyBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return `${Math.round(v * 100)}%`
}

function formatAging(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  const m = Math.floor(s / 60)
  if (m < 1) return '< 1min'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h${m % 60 > 0 ? String(m % 60) + 'min' : ''}`
  const d = Math.floor(h / 24)
  const rh = h % 24
  if (d < 30) return `${d}d${rh > 0 ? String(rh) + 'h' : ''}`
  const mo = Math.floor(d / 30)
  const rd = d % 30
  return `${mo}mo${rd > 0 ? String(rd) + 'd' : ''}`
}

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ─── Risk helpers ─────────────────────────────────────────────────────────────

type RiskLevel = 'ok' | 'warning' | 'danger'

function getRiskLevel(lead: Lead, nowMs: number): RiskLevel {
  if (!OPEN_STATUSES.includes(lead.status as Status)) return 'ok'

  const isOverdue =
    lead.next_contact_at != null && new Date(lead.next_contact_at).getTime() < nowMs

  const stageStart = new Date(lead.stage_entered_at ?? lead.created_at).getTime()
  const ageDays = (nowMs - stageStart) / 86400000

  if (isOverdue || ageDays > 7) return 'danger'
  if (!lead.next_contact_at || ageDays > 3) return 'warning'
  return 'ok'
}

const RISK_BG: Record<RiskLevel, string> = {
  ok: '#111',
  warning: '#1c1508',
  danger: '#1a0808',
}
const RISK_BORDER: Record<RiskLevel, string> = {
  ok: '#333',
  warning: '#7c5a28',
  danger: '#7c2828',
}

// ─── Competence Banner ────────────────────────────────────────────────────────

function CompetenceBanner({
  competence,
  production,
}: {
  competence: CompetenceGoal | null
  production: CompetenceProduction | null
}) {
  if (!competence) return null

  const meta = competence.goal_brl ?? 0
  const entregue = production?.valor_entregue ?? 0
  const cobertura = meta > 0 ? Math.min(1, entregue / meta) : 0

  const metrics = [
    { label: 'Competência', value: competence.label ?? competence.period, highlight: false },
    { label: 'Meta', value: moneyBRL(meta), highlight: false },
    { label: 'Entregue', value: moneyBRL(entregue), highlight: entregue >= meta },
    { label: 'Cobertura', value: `${Math.round(cobertura * 100)}%`, highlight: cobertura >= 1, warn: cobertura < 0.7 },
    { label: 'Trabalhados', value: String(production?.trabalhados_mes ?? 0), highlight: false },
    { label: 'Ganhos', value: String(production?.ganhos_mes ?? 0), highlight: false },
    { label: 'Herdados', value: String(production?.herdados_total ?? 0), highlight: false },
    { label: 'Reativados', value: String(production?.herdados_reativados ?? 0), highlight: false },
    { label: 'Conversão real', value: pct(production?.taxa_conversao ?? 0), highlight: false },
  ]

  return (
    <div
      style={{
        border: '1px solid #2a2a2a',
        background: '#0c0c0c',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 14,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
      }}
    >
      {metrics.map((m) => (
        <div key={m.label} style={{ minWidth: 90 }}>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 3 }}>{m.label}</div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 14,
              color: m.highlight ? '#22c55e' : m.warn ? '#f87171' : 'white',
            }}
          >
            {m.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const WON_STAGE_ID = '956d91ff-64a6-4298-b023-3953333f3761'

export default function SellerKanban({ userId, companyId }: { userId: string; companyId: string }) {
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [leads, setLeads] = useState<Lead[]>([])
  const [search, setSearch] = useState('')

  const [savingLeadId, setSavingLeadId] = useState<string | null>(null)

  const [competence, setCompetence] = useState<CompetenceGoal | null>(null)
  const [production, setProduction] = useState<CompetenceProduction | null>(null)

  // Won modal state
  const [pendingWonMove, setPendingWonMove] = useState<{
    leadId: string; fromStatus: Status; secondsInFromStage: number
  } | null>(null)
  const [wonValueRaw, setWonValueRaw] = useState('')
  const [savingWon, setSavingWon] = useState(false)

  // Lost modal state
  const [pendingLostMove, setPendingLostMove] = useState<{
    leadId: string; fromStatus: Status; secondsInFromStage: number
  } | null>(null)
  const [lossReason, setLossReason] = useState('')
  const [lossReasonOther, setLossReasonOther] = useState('')
  const [savingLost, setSavingLost] = useState(false)

  // Clock for aging indicators
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // ── Load leads ──────────────────────────────────────────────
  const loadLeads = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)

    const { data, error } = await supabase
      .from('leads')
      .select(
        'id,name,phone,status,created_at,stage_entered_at,deal_value,current_stage_id,next_contact_at,next_action,next_action_channel,loss_reason'
      )
      .eq('company_id', companyId)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(600)

    if (error) {
      setErrorMsg('Erro ao carregar leads: ' + error.message)
      setLeads([])
      setLoading(false)
      return
    }

    setLeads((data ?? []) as Lead[])
    setLoading(false)
  }, [companyId, userId, supabase])

  // ── Load active competence + production ─────────────────────
  const loadCompetence = useCallback(async () => {
    const { data: comp } = await supabase
      .from('competences')
      .select('id,period,label')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .maybeSingle()

    const period = comp?.period ?? currentPeriod()

    type GoalRecord = { goal_brl?: number; ticket_oficial?: number; taxa_alvo_pct?: number }

    const { data: goalRow } = comp
      ? await supabase
          .from('competence_goals')
          .select('goal_brl,ticket_oficial,taxa_alvo_pct')
          .eq('company_id', companyId)
          .eq('competence_id', comp.id)
          // userId comes from the server-authenticated session prop; safe to use in filter.
          // We prefer a seller-specific goal over the company-wide (null seller_id) one.
          .or(`seller_id.eq.${userId},seller_id.is.null`)
          .order('seller_id', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null }

    const gr = goalRow as GoalRecord | null

    setCompetence({
      period,
      label: comp?.label ?? null,
      goal_brl: gr?.goal_brl ?? 0,
      ticket_oficial: gr?.ticket_oficial ?? 0,
      taxa_alvo_pct: gr?.taxa_alvo_pct ?? 20,
    })

    if (!comp) return

    const { data: prod } = await supabase.rpc('get_competence_production', {
      p_company_id: companyId,
      p_competence: period,
      p_seller_id: userId,
    })

    if (prod?.[0]) setProduction(prod[0] as CompetenceProduction)
  }, [companyId, userId, supabase])

  useEffect(() => {
    if (!userId || !companyId) return
    void loadLeads()
    void loadCompetence()
  }, [loadLeads, loadCompetence, userId, companyId])

  // ── Derived ─────────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return leads
    return leads.filter(
      (l) => (l.name || '').toLowerCase().includes(s) || (l.phone || '').includes(s)
    )
  }, [leads, search])

  const byStatus = useMemo(() => {
    const map: Record<string, Lead[]> = {}
    for (const st of STATUSES) map[st] = []
    for (const l of filteredLeads) {
      const st = (l.status || 'novo').toLowerCase()
      ;(map[st] ?? (map[st] = [])).push(l)
    }
    // Sort open columns by aging (oldest first → highest risk at top).
    // Pre-compute timestamps once per lead to avoid O(n log n) Date constructions.
    for (const st of OPEN_STATUSES) {
      const col = map[st] ?? []
      const withTs = col.map((l) => ({
        lead: l,
        ts: new Date(l.stage_entered_at ?? l.created_at).getTime(),
      }))
      withTs.sort((a, b) => a.ts - b.ts)
      map[st] = withTs.map((x) => x.lead)
    }
    return map
  }, [filteredLeads])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const st of STATUSES) c[st] = byStatus[st]?.length ?? 0
    return c
  }, [byStatus])

  // ── Movement helpers ─────────────────────────────────────────
  const moveLocal = useCallback((leadId: string, to: Status) => {
    const nowIso = new Date().toISOString()
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: to, stage_entered_at: nowIso } : l))
    )
  }, [])

  const performMove = useCallback(
    async (
      leadId: string,
      fromStatus: string,
      toStatus: string,
      secondsInFromStage: number,
      extraMeta?: { reason?: string },
      dealValueOverride?: number | null
    ) => {
      setSavingLeadId(leadId)

      const dealValue = toStatus === 'ganho' ? (dealValueOverride ?? null) : null
      const toStageId = toStatus === 'ganho' ? WON_STAGE_ID : null

      if (toStatus === 'ganho' && (!dealValue || dealValue <= 0)) {
        setSavingLeadId(null)
        throw new Error('Informe um valor válido para Ganho.')
      }

      try {
        const { error: rpcErr } = await supabase.rpc('seller_move_lead_stage', {
          p_company_id: companyId,
          p_lead_id: leadId,
          p_to_status: toStatus,
          p_reason: extraMeta?.reason ?? null,
          p_deal_value: dealValue,
          p_to_stage_id: toStageId,
        })
        if (rpcErr) throw rpcErr
      } catch (e: unknown) {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, status: fromStatus as Status } : l))
        )
        setErrorMsg('Erro ao mover lead: ' + ((e as Error)?.message ?? String(e)))
        throw e
      } finally {
        setSavingLeadId(null)
      }

      void loadCompetence()
    },
    [companyId, supabase, loadCompetence]
  )

  const confirmWonMove = useCallback(async () => {
    if (!pendingWonMove || savingWon) return
    const parsed = parseBRLMoney(wonValueRaw)
    if (!parsed) {
      setErrorMsg('Informe um valor válido (ex.: 2000 ou 2.000,50).')
      return
    }
    setSavingWon(true)
    moveLocal(pendingWonMove.leadId, 'ganho')
    try {
      await performMove(
        pendingWonMove.leadId,
        pendingWonMove.fromStatus,
        'ganho',
        pendingWonMove.secondsInFromStage,
        undefined,
        parsed
      )
      setPendingWonMove(null)
      setWonValueRaw('')
    } finally {
      setSavingWon(false)
    }
  }, [pendingWonMove, savingWon, wonValueRaw, moveLocal, performMove])

  const confirmLostMove = useCallback(async () => {
    if (!pendingLostMove || savingLost) return
    const reason = lossReason === 'Outro' ? lossReasonOther.trim() : lossReason.trim()
    if (!reason) {
      setErrorMsg('Selecione ou informe o motivo da perda (obrigatório).')
      return
    }
    setSavingLost(true)
    moveLocal(pendingLostMove.leadId, 'perdido')
    try {
      await performMove(
        pendingLostMove.leadId,
        pendingLostMove.fromStatus,
        'perdido',
        pendingLostMove.secondsInFromStage,
        { reason }
      )
      setPendingLostMove(null)
      setLossReason('')
      setLossReasonOther('')
    } finally {
      setSavingLost(false)
    }
  }, [pendingLostMove, savingLost, lossReason, lossReasonOther, moveLocal, performMove])

  const onDragEnd = useCallback(
    async (r: DropResult) => {
      if (!r.destination || !companyId || savingLeadId) return

      const leadId = r.draggableId
      const toStatus = r.destination.droppableId as Status
      const lead = leads.find((l) => l.id === leadId)
      if (!lead) return

      const fromStatus = ((lead.status || 'novo').toLowerCase() as Status) ?? 'novo'
      if (fromStatus === toStatus) return

      const startIso = lead.stage_entered_at ?? lead.created_at
      const secondsInFromStage = Math.max(
        1,
        Math.floor((Date.now() - new Date(startIso).getTime()) / 1000)
      )

      if (toStatus === 'ganho') {
        setPendingWonMove({ leadId, fromStatus, secondsInFromStage })
        setWonValueRaw('')
        return
      }

      if (toStatus === 'perdido') {
        setPendingLostMove({ leadId, fromStatus, secondsInFromStage })
        setLossReason('')
        setLossReasonOther('')
        return
      }

      moveLocal(leadId, toStatus)
      try {
        await performMove(leadId, fromStatus, toStatus, secondsInFromStage)
      } catch (e: unknown) {
        setErrorMsg('Erro ao mover lead: ' + ((e as Error)?.message ?? String(e)))
      }
    },
    [companyId, leads, performMove, savingLeadId, moveLocal]
  )

  // ── Styles ───────────────────────────────────────────────────
  const pillBtnStyle: React.CSSProperties = {
    border: '1px solid #2a2a2a',
    background: 'transparent',
    color: '#cbd5e1',
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 999,
    cursor: 'pointer',
    fontWeight: 800,
  }

  const inputStyle: React.CSSProperties = {
    background: '#111',
    border: '1px solid #2a2a2a',
    color: 'white',
    padding: '10px 12px',
    borderRadius: 10,
    outline: 'none',
    width: '100%',
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={{ color: 'white' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>Minha carteira (Kanban)</div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome/telefone…"
            style={{ ...inputStyle, minWidth: 200, width: 'auto' }}
          />
          <button
            onClick={() => {
              void loadLeads()
              void loadCompetence()
            }}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* Competence banner */}
      <CompetenceBanner competence={competence} production={production} />

      {errorMsg ? (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            border: '1px solid #7f1d1d',
            background: '#1a0b0b',
            borderRadius: 10,
            color: '#fecaca',
            marginBottom: 10,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fecaca',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            ✕
          </button>
        </div>
      ) : null}

      {loading ? <div style={{ marginTop: 10, opacity: 0.8 }}>Carregando…</div> : null}

      {!loading && filteredLeads.length === 0 ? (
        <div style={{ marginTop: 14, opacity: 0.75 }}>
          Você não tem leads na sua carteira no momento.
        </div>
      ) : null}

      {/* Kanban Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingTop: 14 }}>
          {STATUSES.map((st) => {
            const colLeads = byStatus[st] ?? []
            const isOpen = OPEN_STATUSES.includes(st)
            const dangerCount = isOpen
              ? colLeads.filter((l) => getRiskLevel(l, nowMs) === 'danger').length
              : 0

            return (
              <Droppable key={st} droppableId={st}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      minWidth: 280,
                      background: '#0f0f0f',
                      border: '1px solid #222',
                      borderRadius: 12,
                      padding: 12,
                      minHeight: 360,
                      opacity: savingLeadId ? 0.92 : 1,
                    }}
                  >
                    {/* Column header */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{STATUS_LABEL[st]}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {dangerCount > 0 && (
                          <span
                            title="Leads com ação vencida ou parados há mais de 7 dias"
                            style={{
                              fontSize: 10,
                              padding: '2px 7px',
                              borderRadius: 999,
                              background: '#3a1e1e',
                              color: '#f87171',
                              border: '1px solid #7c2828',
                            }}
                          >
                            ⚠ {dangerCount}
                          </span>
                        )}
                        <span style={{ opacity: 0.7, fontSize: 12 }}>{counts[st]}</span>
                      </div>
                    </div>

                    {colLeads.map((l, idx) => {
                      const wa = whatsappLink(l.phone)
                      const isSaving = savingLeadId === l.id
                      const risk = getRiskLevel(l, nowMs)
                      const stageMs = new Date(
                        l.stage_entered_at ?? l.created_at
                      ).getTime()
                      const agingSecs = Math.floor((nowMs - stageMs) / 1000)
                      const isOverdue =
                        l.next_contact_at != null &&
                        new Date(l.next_contact_at).getTime() < nowMs
                      const channelLabel =
                        CHANNELS.find((c) => c.value === l.next_action_channel)?.label ??
                        l.next_action_channel

                      return (
                        <Draggable
                          key={l.id}
                          draggableId={l.id}
                          index={idx}
                          isDragDisabled={!!savingLeadId}
                        >
                          {(p) => (
                            <div
                              ref={p.innerRef}
                              {...p.draggableProps}
                              {...p.dragHandleProps}
                              style={{
                                ...p.draggableProps.style,
                                border: `1px solid ${RISK_BORDER[risk]}`,
                                background: RISK_BG[risk],
                                borderRadius: 12,
                                padding: 12,
                                marginBottom: 10,
                                opacity: isSaving ? 0.7 : 1,
                                cursor: isSaving ? 'not-allowed' : 'grab',
                              }}
                            >
                              {/* Name */}
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  gap: 10,
                                }}
                              >
                                <div style={{ fontWeight: 900, lineHeight: 1.2 }}>
                                  {l.name}
                                </div>
                                {isSaving && (
                                  <div style={{ opacity: 0.6, fontSize: 12 }}>
                                    Salvando…
                                  </div>
                                )}
                              </div>

                              <div style={{ opacity: 0.85, marginTop: 4, fontSize: 13 }}>
                                {l.phone ?? '—'}
                              </div>

                              {/* Aging + risk badges */}
                              {isOpen && (
                                <div
                                  style={{
                                    marginTop: 6,
                                    display: 'flex',
                                    gap: 6,
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                  }}
                                >
                                  <span
                                    title="Tempo neste estágio"
                                    style={{
                                      fontSize: 11,
                                      padding: '2px 7px',
                                      borderRadius: 999,
                                      border: '1px solid #333',
                                      opacity: 0.8,
                                    }}
                                  >
                                    ⏱ {formatAging(agingSecs)}
                                  </span>

                                  {isOverdue && (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        padding: '2px 7px',
                                        borderRadius: 999,
                                        border: '1px solid #7c2828',
                                        color: '#f87171',
                                        background: '#3a1e1e',
                                      }}
                                    >
                                      Ação vencida
                                    </span>
                                  )}

                                  {!l.next_contact_at && (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        padding: '2px 7px',
                                        borderRadius: 999,
                                        border: '1px solid #7c5a28',
                                        color: '#facc15',
                                        background: '#1c1508',
                                      }}
                                    >
                                      Sem próxima ação
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Next action */}
                              {l.next_action && (
                                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                                  📋 {l.next_action}
                                  {channelLabel && (
                                    <span style={{ marginLeft: 6, opacity: 0.65 }}>
                                      ({channelLabel})
                                    </span>
                                  )}
                                </div>
                              )}
                              {l.next_contact_at && (
                                <div style={{ marginTop: 2, fontSize: 11, opacity: 0.7 }}>
                                  🗓{' '}
                                  {new Date(l.next_contact_at).toLocaleString('pt-BR', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  })}
                                </div>
                              )}

                              {/* Loss reason */}
                              {l.status === 'perdido' && l.loss_reason && (
                                <div
                                  style={{
                                    marginTop: 6,
                                    fontSize: 12,
                                    opacity: 0.7,
                                  }}
                                >
                                  Motivo: {l.loss_reason}
                                </div>
                              )}

                              {/* Actions */}
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 10,
                                  marginTop: 10,
                                  alignItems: 'center',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <a
                                  href={`/leads/${l.id}`}
                                  style={{
                                    color: '#9aa',
                                    textDecoration: 'none',
                                    fontSize: 12,
                                  }}
                                >
                                  Abrir →
                                </a>

                                {wa ? (
                                  <a
                                    href={wa}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      color: '#9aa',
                                      textDecoration: 'none',
                                      fontSize: 12,
                                    }}
                                  >
                                    WhatsApp →
                                  </a>
                                ) : null}

                                <ConversationPasteAI
                                  lead={{
                                    id: l.id,
                                    company_id: companyId,
                                    name: l.name,
                                    phone: l.phone,
                                    status: l.status,
                                  }}
                                  onSaved={() => {}}
                                  trigger={
                                    <button
                                      type="button"
                                      style={pillBtnStyle}
                                      disabled={!!savingLeadId}
                                    >
                                      IA
                                    </button>
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </Draggable>
                      )
                    })}

                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            )
          })}
        </div>
      </DragDropContext>

      {/* Won modal */}
      {pendingWonMove ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => {
            setPendingWonMove(null)
            setWonValueRaw('')
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#0f0f0f',
              border: '1px solid #222',
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16 }}>Fechar como Ganho</div>
            <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
              Informe o valor do negócio (R$)
            </div>

            <input
              value={wonValueRaw}
              onChange={(e) => setWonValueRaw(e.target.value)}
              placeholder="Ex.: 2000 ou 2.000,50"
              style={{ ...inputStyle, marginTop: 12 }}
            />

            <div
              style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}
            >
              <button
                type="button"
                onClick={() => {
                  setPendingWonMove(null)
                  setWonValueRaw('')
                }}
                disabled={savingWon}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: 'transparent',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmWonMove}
                disabled={savingWon}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: '#151515',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                {savingWon ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Lost modal */}
      {pendingLostMove ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => {
            setPendingLostMove(null)
            setLossReason('')
            setLossReasonOther('')
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#0f0f0f',
              border: '1px solid #222',
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16 }}>Fechar como Perdido</div>
            <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
              Selecione o motivo de perda (obrigatório)
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              {LOSS_REASONS.map((r) => (
                <label
                  key={r}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    cursor: 'pointer',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: lossReason === r ? '#151515' : 'transparent',
                    border: `1px solid ${lossReason === r ? '#334155' : '#222'}`,
                  }}
                >
                  <input
                    type="radio"
                    name="loss_reason"
                    value={r}
                    checked={lossReason === r}
                    onChange={() => setLossReason(r)}
                    style={{ accentColor: '#60a5fa' }}
                  />
                  <span style={{ fontSize: 13 }}>{r}</span>
                </label>
              ))}
            </div>

            {lossReason === 'Outro' && (
              <input
                value={lossReasonOther}
                onChange={(e) => setLossReasonOther(e.target.value)}
                placeholder="Descreva o motivo…"
                style={{ ...inputStyle, marginTop: 10 }}
              />
            )}

            <div
              style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}
            >
              <button
                type="button"
                onClick={() => {
                  setPendingLostMove(null)
                  setLossReason('')
                  setLossReasonOther('')
                }}
                disabled={savingLost}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: 'transparent',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmLostMove}
                disabled={savingLost || !lossReason}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: '#151515',
                  color: 'white',
                  cursor: lossReason ? 'pointer' : 'not-allowed',
                  opacity: lossReason ? 1 : 0.6,
                }}
              >
                {savingLost ? 'Salvando...' : 'Confirmar perda'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
