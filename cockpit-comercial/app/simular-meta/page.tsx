'use client'

import * as React from 'react'
import { supabaseBrowser } from '../lib/supabaseBrowser'

// ─── Types ───────────────────────────────────────────────────────────────────

type CompetenceRow = {
  id: string
  period: string
  label: string | null
  is_active: boolean
}

// GoalRow is defined in competence_goals but projection RPC aggregates it server-side

type ProjectionRow = {
  // A — Meta oficial
  goal_brl: number
  ticket_oficial: number
  taxa_alvo_pct: number
  fechamentos_alvo: number
  contatos_alvo: number
  // B — Produção do mês
  novos_contatos: number
  trabalhados_mes: number
  ganhos_mes: number
  valor_entregue: number
  taxa_conversao_real: number
  // C — Base herdada
  herdados_contato: number
  herdados_respondeu: number
  herdados_negociacao: number
  herdados_total: number
  cobertura_herdada: number
  // D — Projeção
  meta_bruta: number
  entregue: number
  meta_liquida: number
  falta_fechamentos: number
  falta_contatos: number
  // Tickets reais
  ticket_real_mes: number
  ticket_real_90d: number
  ticket_real_all: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function moneyBRL(n: number | null | undefined) {
  const v = n ?? 0
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(n: number | null | undefined) {
  const v = Number.isFinite(n) ? (n ?? 0) : 0
  return `${Math.round(v * 100)}%`
}

function currentPeriod() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── UI Components ────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  highlight,
  warn,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  highlight?: boolean
  warn?: boolean
}) {
  return (
    <div
      style={{
        border: '1px solid #2a2a2a',
        background: '#0f0f0f',
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: highlight ? '#22c55e' : warn ? '#f87171' : 'white',
        }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65, lineHeight: 1.5 }}>{sub}</div>
      ) : null}
    </div>
  )
}

function BlockTitle({
  tag,
  title,
  description,
  badge,
}: {
  tag: string
  title: string
  description?: string
  badge?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 14,
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 900,
              padding: '3px 9px',
              borderRadius: 999,
              border: '1px solid #334155',
              color: '#93c5fd',
              letterSpacing: 0.5,
            }}
          >
            {tag}
          </span>
          <span style={{ fontWeight: 900, fontSize: 15 }}>{title}</span>
        </div>
        {description ? (
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.65 }}>{description}</div>
        ) : null}
      </div>
      {badge ? <div>{badge}</div> : null}
    </div>
  )
}

function Block({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        border: '1px solid #202020',
        background: '#0c0c0c',
        borderRadius: 16,
        padding: 18,
      }}
    >
      {children}
    </section>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SimularMetaPage() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  // Competence
  const [competences, setCompetences] = React.useState<CompetenceRow[]>([])
  const [selectedPeriod, setSelectedPeriod] = React.useState<string>(currentPeriod())
  const [activeCompetenceId, setActiveCompetenceId] = React.useState<string | null>(null)

  // Projection result
  const [projection, setProjection] = React.useState<ProjectionRow | null>(null)

  // ── B: seller scenario overrides (personal, non-governance) ──
  const [scenarioTicket, setScenarioTicket] = React.useState<string>('')
  const [scenarioDays, setScenarioDays] = React.useState<string>('')

  const [showDebug, setShowDebug] = React.useState(false)

  // ── Load competences for company ─────────────────────────────
  const loadCompetences = React.useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData?.session?.user?.id
    if (!userId) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', userId)
      .maybeSingle()

    if (!profile?.company_id) return

    const { data: rows } = await supabase
      .from('competences')
      .select('id,period,label,is_active')
      .eq('company_id', profile.company_id)
      .order('period', { ascending: false })
      .limit(24)

    if (rows && rows.length > 0) {
      setCompetences(rows as CompetenceRow[])
      const active = rows.find((r: CompetenceRow) => r.is_active)
      if (active) {
        setSelectedPeriod(active.period)
        setActiveCompetenceId(active.id)
      }
    }
  }, [supabase])

  React.useEffect(() => {
    void loadCompetences()
  }, [loadCompetences])

  // ── Run projection ────────────────────────────────────────────
  const run = React.useCallback(async () => {
    setLoading(true)
    setErr(null)

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr) throw sessionErr
      if (!sessionData.session) throw new Error('Você está deslogado. Faça login novamente.')

      const userId = sessionData.session.user.id

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('company_id,role')
        .eq('id', userId)
        .maybeSingle()

      if (profileErr) throw profileErr
      if (!profile?.company_id)
        throw new Error('Não encontrei company_id no seu perfil.')

      const companyId = profile.company_id as string

      const { data: r, error: rpcErr } = await supabase.rpc('get_competence_projection', {
        p_company_id: companyId,
        p_competence: selectedPeriod,
        p_seller_id: profile.role === 'admin' ? null : userId,
      })

      if (rpcErr) throw rpcErr

      setProjection((r?.[0] as ProjectionRow) ?? null)
    } catch (e: unknown) {
      setErr((e as Error)?.message ?? 'Erro ao calcular projeção.')
      setProjection(null)
    } finally {
      setLoading(false)
    }
  }, [supabase, selectedPeriod])

  React.useEffect(() => {
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod])

  // ── Scenario overrides ────────────────────────────────────────
  const effectiveTicket = React.useMemo(() => {
    const override = parseFloat((scenarioTicket || '').replace(',', '.'))
    if (override > 0) return override
    return projection?.ticket_oficial ?? 0
  }, [scenarioTicket, projection])

  const effectiveDays = React.useMemo(() => {
    const override = parseInt(scenarioDays || '', 10)
    if (override > 0) return override
    // Estimate remaining working days in the period (Mon–Fri)
    const now = new Date()
    const [y, m] = selectedPeriod.split('-').map(Number)
    const endOfMonth = new Date(y, m, 0) // last day of selected month
    let count = 0
    const cur = new Date(now)
    cur.setHours(0, 0, 0, 0)
    while (cur <= endOfMonth) {
      const dow = cur.getDay()
      if (dow >= 1 && dow <= 5) count++
      cur.setDate(cur.getDate() + 1)
    }
    return count
  }, [scenarioDays, selectedPeriod])

  const faltaContatos = projection?.falta_contatos ?? 0
  const contatosPorDia = effectiveDays > 0 ? Math.ceil(faltaContatos / effectiveDays) : null

  const coverageRate =
    (projection?.goal_brl ?? 0) > 0
      ? Math.min(1, (projection?.entregue ?? 0) / projection!.goal_brl)
      : 0

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, color: 'white' }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>Simulador de Metas</h1>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.65 }}>
            Teoria 100/20 — Meta → fechamentos → contatos necessários
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Competence selector */}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              minWidth: 160,
            }}
          >
            {competences.length === 0 ? (
              <option value={selectedPeriod}>{selectedPeriod}</option>
            ) : (
              competences.map((c) => (
                <option key={c.id} value={c.period}>
                  {c.label ?? c.period}
                  {c.is_active ? ' ✓' : ''}
                </option>
              ))
            )}
          </select>

          <button
            onClick={run}
            disabled={loading}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#151515',
              color: 'white',
              cursor: 'pointer',
              minWidth: 110,
              fontWeight: 700,
            }}
          >
            {loading ? 'Calculando...' : 'Calcular'}
          </button>
        </div>
      </div>

      {err ? (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 12,
            border: '1px solid #3a2222',
            background: '#160b0b',
            color: '#ffb3b3',
            fontSize: 13,
          }}
        >
          {err}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 14 }}>
        {/* ── BLOCO A — Meta oficial ──────────────────────────── */}
        <Block>
          <BlockTitle
            tag="A"
            title="Meta oficial da competência"
            description="Parâmetros definidos pelo administrador — somente leitura."
            badge={
              activeCompetenceId ? (
                <span
                  style={{
                    fontSize: 11,
                    padding: '3px 9px',
                    borderRadius: 999,
                    background: '#0d2a0d',
                    border: '1px solid #166534',
                    color: '#86efac',
                  }}
                >
                  Ativa
                </span>
              ) : null
            }
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
            }}
          >
            <MetricCard
              label="Competência"
              value={
                competences.find((c) => c.period === selectedPeriod)?.label ?? selectedPeriod
              }
            />
            <MetricCard
              label="Meta do período (R$)"
              value={moneyBRL(projection?.goal_brl)}
            />
            <MetricCard
              label="Ticket oficial (R$)"
              value={moneyBRL(projection?.ticket_oficial)}
              sub={
                projection
                  ? `Real mês: ${moneyBRL(projection.ticket_real_mes)} | 90d: ${moneyBRL(projection.ticket_real_90d)} | all: ${moneyBRL(projection.ticket_real_all)}`
                  : undefined
              }
            />
            <MetricCard
              label="Taxa alvo"
              value={`${projection?.taxa_alvo_pct ?? 20}%`}
              sub="Taxa de conversão alvo (ganho/contato)"
            />
            <MetricCard
              label="Fechamentos alvo"
              value={projection?.fechamentos_alvo ?? '—'}
              sub={
                projection?.ticket_oficial
                  ? `${moneyBRL(projection.goal_brl)} ÷ ${moneyBRL(projection.ticket_oficial)}`
                  : undefined
              }
            />
            <MetricCard
              label="Contatos alvo"
              value={projection?.contatos_alvo ?? '—'}
              sub={
                projection?.fechamentos_alvo && projection?.taxa_alvo_pct
                  ? `${projection.fechamentos_alvo} ÷ ${projection.taxa_alvo_pct}%`
                  : undefined
              }
            />
          </div>
        </Block>

        {/* ── BLOCO B — Produção do mês ───────────────────────── */}
        <Block>
          <BlockTitle
            tag="B"
            title="Produção da competência"
            description="Fluxo real do mês — não inclui base herdada não reativada."
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
            }}
          >
            <MetricCard
              label="Novos contatos"
              value={projection?.novos_contatos ?? '—'}
              sub="Leads criados nesta competência"
            />
            <MetricCard
              label="Trabalhados"
              value={projection?.trabalhados_mes ?? '—'}
              sub="Novos + herdados reativados"
            />
            <MetricCard
              label="Ganhos"
              value={projection?.ganhos_mes ?? '—'}
            />
            <MetricCard
              label="Valor entregue"
              value={moneyBRL(projection?.valor_entregue)}
              highlight={(projection?.valor_entregue ?? 0) >= (projection?.goal_brl ?? 1)}
            />
            <MetricCard
              label="Conversão real"
              value={pct(projection?.taxa_conversao_real)}
              sub="Ganhos / trabalhados"
            />
          </div>
        </Block>

        {/* ── BLOCO C — Base herdada ───────────────────────────── */}
        <Block>
          <BlockTitle
            tag="C"
            title="Base herdada"
            description="Leads que viram a competência em Contato / Respondeu / Negociação. Só contam após ação qualificada."
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
            }}
          >
            <MetricCard
              label="Contato (herdado)"
              value={projection?.herdados_contato ?? '—'}
              sub="Peso mais baixo na projeção"
            />
            <MetricCard
              label="Respondeu (herdado)"
              value={projection?.herdados_respondeu ?? '—'}
              sub="Peso médio na projeção"
            />
            <MetricCard
              label="Negociação (herdado)"
              value={projection?.herdados_negociacao ?? '—'}
              sub="Peso mais alto na projeção"
            />
            <MetricCard
              label="Total herdados"
              value={projection?.herdados_total ?? '—'}
            />
            <MetricCard
              label="Cobertura herdada (R$)"
              value={moneyBRL(projection?.cobertura_herdada)}
              sub="Potencial ponderado pelos pesos do admin"
            />
          </div>
        </Block>

        {/* ── BLOCO D — Projeção e faltas ──────────────────────── */}
        <Block>
          <BlockTitle
            tag="D"
            title="Projeção e faltas"
            description="Com base na meta oficial menos o que já foi entregue."
          />

          {/* Scenario overrides */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 16,
              padding: 14,
              border: '1px solid #1f1f1f',
              borderRadius: 12,
              background: '#0f0f0f',
            }}
          >
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                Ticket cenário (seu ajuste, R$)
              </div>
              <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 8 }}>
                Deixe em branco para usar o ticket oficial do admin
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={scenarioTicket}
                onChange={(e) => setScenarioTicket(e.target.value)}
                placeholder={`Oficial: ${moneyBRL(projection?.ticket_oficial)}`}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: '#111',
                  color: 'white',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                Dias trabalhados restantes (seu ajuste)
              </div>
              <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 8 }}>
                Deixe em branco para usar estimativa automática (seg–sex)
              </div>
              <input
                type="number"
                value={scenarioDays}
                onChange={(e) => setScenarioDays(e.target.value)}
                placeholder={`Estimado: ${effectiveDays}d`}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: '#111',
                  color: 'white',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
            }}
          >
            <MetricCard
              label="Meta bruta"
              value={moneyBRL(projection?.meta_bruta)}
            />
            <MetricCard
              label="Entregue"
              value={moneyBRL(projection?.entregue)}
              highlight={(projection?.entregue ?? 0) >= (projection?.meta_bruta ?? 1)}
            />
            <MetricCard
              label="Cobertura"
              value={`${Math.round(coverageRate * 100)}%`}
              highlight={coverageRate >= 1}
              warn={coverageRate < 0.5}
            />
            <MetricCard
              label="Meta líquida (falta)"
              value={moneyBRL(projection?.meta_liquida)}
              warn={(projection?.meta_liquida ?? 0) > 0}
            />
            <MetricCard
              label="Fechamentos que faltam"
              value={projection?.falta_fechamentos ?? '—'}
              sub={
                effectiveTicket > 0
                  ? `${moneyBRL(projection?.meta_liquida)} ÷ ${moneyBRL(effectiveTicket)}`
                  : undefined
              }
            />
            <MetricCard
              label="Contatos que faltam"
              value={faltaContatos}
              sub={
                projection?.taxa_alvo_pct
                  ? `${projection.falta_fechamentos} ÷ ${projection.taxa_alvo_pct}%`
                  : undefined
              }
            />
            <MetricCard
              label="Contatos/dia (restantes)"
              value={contatosPorDia ?? '—'}
              sub={
                effectiveDays > 0
                  ? `${faltaContatos} ÷ ${effectiveDays} dias restantes`
                  : 'Sem dias trabalhados restantes'
              }
              warn={(contatosPorDia ?? 0) > 30}
            />
          </div>

          {/* Debug toggle */}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => setShowDebug((v) => !v)}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid #2a2a2a',
                background: '#101010',
                color: 'white',
                cursor: 'pointer',
                fontSize: 12,
                opacity: 0.85,
              }}
            >
              {showDebug ? 'Ocultar debug' : 'Mostrar debug'}
            </button>

            {showDebug && projection ? (
              <pre
                style={{
                  marginTop: 10,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  border: '1px solid #2a2a2a',
                  borderRadius: 12,
                  background: '#0f0f0f',
                  padding: 12,
                  fontSize: 12,
                  opacity: 0.9,
                }}
              >
                {JSON.stringify(projection, null, 2)}
              </pre>
            ) : null}
          </div>
        </Block>
      </div>
    </div>
  )
}
