'use client'

import * as React from 'react'
import { supabaseBrowser } from '../lib/supabaseBrowser'

type RpcStats = {
  start_date: string
  end_date: string

  leads_disponiveis: number

  contatados: number
  respondeu: number
  negociacao: number
  fechado: number
  perdido: number

  taxa_resposta: number
  taxa_negociacao: number
  taxa_fechamento: number
  taxa_final_real: number

  ticket_medio_real_periodo: number | null
  ticket_medio_real_90d: number | null
  ticket_medio_real_all_time: number | null
}

type TicketSource = 'configured' | 'real_period' | 'real_90d' | 'real_all_time'

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0=dom ... 6=sáb

function toISODateInput(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODateInput(v: string) {
  const [y, m, d] = v.split('-').map((x) => Number(x))
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0)
}

function parsePtNumber(v: string) {
  return parseFloat((v || '').replace(',', '.'))
}

function moneyBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return `${Math.round(v * 100)}%`
}

function countWorkingDaysInclusive(start: Date, end: Date, workingDays: Set<Weekday>) {
  const s = new Date(start)
  const e = new Date(end)
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)
  if (e < s) return 0

  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const dow = cur.getDay() as Weekday
    if (workingDays.has(dow)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function weekdayLabelPt(d: Weekday) {
  switch (d) {
    case 0:
      return 'Dom'
    case 1:
      return 'Seg'
    case 2:
      return 'Ter'
    case 3:
      return 'Qua'
    case 4:
      return 'Qui'
    case 5:
      return 'Sex'
    case 6:
      return 'Sáb'
  }
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function maxDate(a: Date, b: Date) {
  return a > b ? a : b
}

function Card({ title, value, subtitle }: { title: string; value: React.ReactNode; subtitle?: React.ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid #2a2a2a',
        background: '#0f0f0f',
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.2 }}>{value}</div>
      {subtitle ? (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>{subtitle}</div>
      ) : null}
    </div>
  )
}

function Section({
  title,
  description,
  children,
  right,
}: {
  title: string
  description?: string
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <section
      style={{
        border: '1px solid #202020',
        background: '#0c0c0c',
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
          {description ? <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>{description}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>

      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  )
}

export default function SimularMetaPage() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [metaBRL, setMetaBRL] = React.useState<number>(500000)

  const [ticketConfigurado, setTicketConfigurado] = React.useState<number>(2000)
  const [ticketSource, setTicketSource] = React.useState<TicketSource>('configured')

  // taxa em porcentagem (ex: 20 = 20%)
  const [taxaPct, setTaxaPct] = React.useState<number>(20)

  const now = React.useMemo(() => new Date(), [])
  const defaultStart = React.useMemo(() => {
    const d = new Date(now)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  }, [now])
  const defaultEnd = React.useMemo(() => {
    const d = new Date(defaultStart)
    d.setMonth(d.getMonth() + 1)
    d.setDate(0)
    d.setHours(0, 0, 0, 0)
    return d
  }, [defaultStart])

  const [startDate, setStartDate] = React.useState<string>(toISODateInput(defaultStart))
  const [endDate, setEndDate] = React.useState<string>(toISODateInput(defaultEnd))

  const [loading, setLoading] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [stats, setStats] = React.useState<RpcStats | null>(null)
  const [debug, setDebug] = React.useState<any>(null)
  const [showDebug, setShowDebug] = React.useState(false)

  const ranRef = React.useRef(false)

  const selectedTicket = React.useMemo(() => {
    if (!stats) return ticketConfigurado

    const realPeriod = stats.ticket_medio_real_periodo ?? 0
    const real90d = stats.ticket_medio_real_90d ?? 0
    const realAll = stats.ticket_medio_real_all_time ?? 0

    switch (ticketSource) {
      case 'real_period':
        return realPeriod > 0 ? realPeriod : ticketConfigurado
      case 'real_90d':
        return real90d > 0 ? real90d : ticketConfigurado
      case 'real_all_time':
        return realAll > 0 ? realAll : ticketConfigurado
      case 'configured':
      default:
        return ticketConfigurado
    }
  }, [stats, ticketSource, ticketConfigurado])

  const taxa = Math.min(1, Math.max(0.0001, (taxaPct || 0) / 100))

  const fechamentosNecessarios = selectedTicket > 0 ? Math.ceil(metaBRL / selectedTicket) : null

  const contatosNecessarios = fechamentosNecessarios != null ? Math.ceil(fechamentosNecessarios / taxa) : null

  const contatosFaltantes =
    stats && contatosNecessarios != null ? Math.max(contatosNecessarios - (stats.contatados || 0), 0) : null

  const [workingDays, setWorkingDays] = React.useState<Record<Weekday, boolean>>({
    0: false,
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
    6: false,
  })

  const workingDaysSet = React.useMemo(() => {
    const s = new Set<Weekday>()
    ;(Object.keys(workingDays) as unknown as Weekday[]).forEach((k) => {
      const kk = Number(k) as Weekday
      if (workingDays[kk]) s.add(kk)
    })
    return s
  }, [workingDays])

  const start = React.useMemo(() => parseISODateInput(startDate), [startDate])
  const end = React.useMemo(() => parseISODateInput(endDate), [endDate])

  const diasTrabalhadosNoPeriodo = React.useMemo(() => {
    return countWorkingDaysInclusive(start, end, workingDaysSet)
  }, [start, end, workingDaysSet])

  const hoje = React.useMemo(() => startOfDay(new Date()), [])
  const inicioRestante = React.useMemo(() => maxDate(hoje, start), [hoje, start])

  const diasTrabalhadosRestantes = React.useMemo(() => {
    if (end < inicioRestante) return 0
    return countWorkingDaysInclusive(inicioRestante, end, workingDaysSet)
  }, [end, inicioRestante, workingDaysSet])

  const contatosPorDia =
    contatosNecessarios != null && diasTrabalhadosNoPeriodo > 0 ? Math.ceil(contatosNecessarios / diasTrabalhadosNoPeriodo) : null

  const contatosPorDiaRestante =
    contatosFaltantes != null && diasTrabalhadosRestantes > 0 ? Math.ceil(contatosFaltantes / diasTrabalhadosRestantes) : null

  async function run() {
    setLoading(true)
    setErr(null)

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr) throw sessionErr
      if (!sessionData.session) throw new Error('Você está deslogado no Supabase. Faça login novamente.')

      const userId = sessionData.session.user.id

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('company_id, role')
        .eq('id', userId)
        .maybeSingle()

      if (profileErr) throw profileErr
      if (!profile?.company_id) throw new Error('Não achei company_id em profiles para o usuário logado.')

      const COMPANY_ID = profile.company_id as string

      const start = parseISODateInput(startDate)
      const end = parseISODateInput(endDate)
      if (end < start) throw new Error('Data final precisa ser maior ou igual à data inicial.')

      const { data: companies, error: companyErr } = await supabase.from('companies').select('settings').eq('id', COMPANY_ID).limit(1)

      if (companyErr) throw companyErr

      const company = companies?.[0]
      if (!company) throw new Error('Não achei a empresa (companies). Confira COMPANY_ID/RLS.')

      const settings = (company.settings ?? {}) as any
      const goalScope = settings.goal_scope ?? 'seller'
      const groupIds = (settings.goal_group_profile_ids ?? []) as string[]

      if (goalScope === 'group') {
        const { data: r, error: rpcErr } = await supabase.rpc('get_goal_simulation_stats', {
          p_company_id: COMPANY_ID,
          p_start_date: startDate,
          p_end_date: endDate,
          p_owner_id: null,
        })
        if (rpcErr) throw rpcErr

        setDebug({ mode: 'group', groupIds, result: r })
        setStats((r?.[0] as RpcStats) ?? null)
      } else {
        const { data: r, error: rpcErr } = await supabase.rpc('get_goal_simulation_stats', {
          p_company_id: COMPANY_ID,
          p_start_date: startDate,
          p_end_date: endDate,
          p_owner_id: userId,
        })
        if (rpcErr) throw rpcErr

        setDebug({ mode: 'seller', result: r })
        setStats((r?.[0] as RpcStats) ?? null)
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Erro ao calcular.')
      setStats(null)
      setDebug(null)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Simular meta</h1>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            Meta (R$) → fechamentos = meta ÷ ticket → contatos = fechamentos ÷ taxa de conversão (%)
          </div>
        </div>
      </div>

      {err ? (
        <div
          style={{
            marginTop: 14,
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

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <Section
          title="Configuração"
          description="Defina período, meta, ticket médio e taxa de conversão. Depois clique em Calcular."
          right={
            <button
              onClick={run}
              disabled={loading}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid #2a2a2a',
                background: '#151515',
                color: 'white',
                cursor: 'pointer',
                minWidth: 120,
              }}
            >
              {loading ? 'Calculando...' : 'Calcular'}
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Período */}
            <div
              style={{
                border: '1px solid #1f1f1f',
                borderRadius: 14,
                padding: 12,
                background: '#0f0f0f',
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>Período</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    width: 160,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #2a2a2a',
                    background: '#111',
                    color: 'white',
                  }}
                />
                <span style={{ opacity: 0.7 }}>até</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    width: 160,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #2a2a2a',
                    background: '#111',
                    color: 'white',
                  }}
                />
                <button
                  onClick={() => {
                    setStartDate(toISODateInput(defaultStart))
                    setEndDate(toISODateInput(defaultEnd))
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #2a2a2a',
                    background: '#101010',
                    color: 'white',
                    cursor: 'pointer',
                    opacity: 0.95,
                  }}
                >
                  Mês atual
                </button>
              </div>
            </div>

            {/* Meta + Ticket + Taxa */}
            <div
              style={{
                border: '1px solid #1f1f1f',
                borderRadius: 14,
                padding: 12,
                background: '#0f0f0f',
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>Parâmetros</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Meta do período (R$)</div>
                  <input
                    type="number"
                    value={metaBRL}
                    onChange={(e) => setMetaBRL(parseFloat(e.target.value || '0'))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #2a2a2a',
                      background: '#111',
                      color: 'white',
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Taxa de conversão (ganho/contato)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={String(taxaPct)}
                      onChange={(e) => setTaxaPct(parsePtNumber(e.target.value || '0'))}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid #2a2a2a',
                        background: '#111',
                        color: 'white',
                      }}
                    />
                    <div style={{ opacity: 0.75 }}>%</div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Ticket médio (fonte)</div>
                  <select
                    value={ticketSource}
                    onChange={(e) => setTicketSource(e.target.value as TicketSource)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #2a2a2a',
                      background: '#111',
                      color: 'white',
                    }}
                  >
                    <option value="configured">Configurado</option>
                    <option value="real_period">Real (período)</option>
                    <option value="real_90d">Real (90 dias)</option>
                    <option value="real_all_time">Real (all time)</option>
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Ticket médio (valor)</div>
                  <input
                    type="number"
                    value={ticketConfigurado}
                    onChange={(e) => setTicketConfigurado(parseFloat(e.target.value || '0'))}
                    disabled={ticketSource !== 'configured'}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #2a2a2a',
                      background: ticketSource === 'configured' ? '#111' : '#0b0b0b',
                      color: 'white',
                      opacity: ticketSource === 'configured' ? 1 : 0.6,
                    }}
                  />
                </div>
              </div>

              {stats ? (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, lineHeight: 1.6 }}>
                  Ticket real (período): {moneyBRL(stats.ticket_medio_real_periodo ?? 0)} | 90d: {moneyBRL(stats.ticket_medio_real_90d ?? 0)} | all:{' '}
                  {moneyBRL(stats.ticket_medio_real_all_time ?? 0)}
                </div>
              ) : null}
            </div>
          </div>

          <div
            style={{
              border: '1px solid #1f1f1f',
              borderRadius: 14,
              padding: 12,
              background: '#0f0f0f',
              marginTop: 12,
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>Dias trabalhados</div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((d) => (
                <label
                  key={d}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid #2a2a2a',
                    background: '#111',
                    padding: '8px 10px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    fontSize: 12,
                    opacity: 0.95,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!workingDays[d]}
                    onChange={(e) =>
                      setWorkingDays((prev) => ({
                        ...prev,
                        [d]: e.target.checked,
                      }))
                    }
                  />
                  {weekdayLabelPt(d)}
                </label>
              ))}
            </div>

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7, lineHeight: 1.6 }}>
              <div>
                Dias trabalhados no período: <b>{diasTrabalhadosNoPeriodo}</b>
              </div>
              <div>
                Dias trabalhados restantes (a partir de hoje): <b>{diasTrabalhadosRestantes}</b>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Resultado" description="Resumo do que você precisa fazer para bater a meta.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Card
              title="Fechamentos necessários"
              value={fechamentosNecessarios ?? '—'}
              subtitle={selectedTicket > 0 ? <>Meta {moneyBRL(metaBRL)} ÷ ticket {moneyBRL(selectedTicket)}</> : undefined}
            />
            <Card
              title="Contatos necessários"
              value={contatosNecessarios ?? '—'}
              subtitle={fechamentosNecessarios != null ? <>{fechamentosNecessarios} ÷ {taxaPct}% (taxa de conversão)</> : undefined}
            />
            <Card title="Faltam contatos" value={contatosFaltantes ?? '—'} subtitle={stats ? <>Já contatados no período: {stats.contatados}</> : undefined} />
            <Card
              title="Contatos por dia (a partir de hoje)"
              value={contatosPorDiaRestante ?? '—'}
              subtitle={
                diasTrabalhadosRestantes > 0 ? (
                  <>
                    {contatosFaltantes ?? '—'} ÷ {diasTrabalhadosRestantes} dias restantes
                    {contatosPorDia != null ? (
                      <>
                        <br />
                        Média no período: {contatosPorDia}/dia
                      </>
                    ) : null}
                  </>
                ) : (
                  <>Sem dias trabalhados restantes no período</>
                )
              }
            />
          </div>
        </Section>

        <Section
          title="Detalhes do período"
          description="Dados reais do funil no período selecionado (para referência)."
          right={
            <button
              onClick={() => setShowDebug((v) => !v)}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid #2a2a2a',
                background: '#101010',
                color: 'white',
                cursor: 'pointer',
                fontSize: 12,
                opacity: 0.9,
              }}
            >
              {showDebug ? 'Ocultar debug' : 'Mostrar debug'}
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            <Card title="Contato" value={stats?.contatados ?? '—'} />
            <Card title="Respondeu" value={stats?.respondeu ?? '—'} />
            <Card title="Negociação" value={stats?.negociacao ?? '—'} />
            <Card title="Ganho" value={stats?.fechado ?? '—'} />
            <Card title="Perdido" value={stats?.perdido ?? '—'} />
          </div>

          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <Card title="Taxa resposta" value={stats ? pct(stats.taxa_resposta) : '—'} />
            <Card title="Taxa negociação" value={stats ? pct(stats.taxa_negociacao) : '—'} />
            <Card title="Taxa fechamento" value={stats ? pct(stats.taxa_fechamento) : '—'} />
            <Card title="Taxa de conversão (ganho/contato)" value={stats ? pct(stats.taxa_final_real) : '—'} />
          </div>

          {showDebug ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Debug RPC</div>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  border: '1px solid #2a2a2a',
                  borderRadius: 12,
                  background: '#0f0f0f',
                  padding: 12,
                  fontSize: 12,
                  opacity: 0.95,
                }}
              >
                {JSON.stringify(debug, null, 2)}
              </pre>
            </div>
          ) : null}
        </Section>
      </div>
    </div>
  )
}