'use client'

import * as React from 'react'
import { supabase } from '../lib/supabase'
import LeadForm from './components/LeadForm'
import AdminLeadsTable from './components/AdminLeadsTable'
import ImportExcelDialog from './components/ImportExcelDialog'
import KanbanBoard from './components/KanbanBoard'




type LeadRow = {
  id: string
  name: string
  phone: string | null
  status: string
  created_at: string
  stage_entered_at: string | null
  owner_id: string | null
  pinned?: boolean
  importance?: number
}

type PriorityRow = {
  lead_id: string
  pinned: boolean | null
  importance: number | null
}

export default function LeadsClient({
  userId,
  companyId,
  role,
  userLabel,
}: {
  userId: string
  companyId: string
  role: string
  userLabel: string
}) {
  const isAdmin = role === 'admin'

  const [loading, setLoading] = React.useState(true)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [leads, setLeads] = React.useState<LeadRow[]>([])
  const [ownerOptions, setOwnerOptions] = React.useState<{ id: string; label: string }[]>([])

  const load = React.useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    // ✅ Admin usa tabela paginada (não carregamos milhares de leads no estado)
if (isAdmin) {
  setLeads([])
  setLoading(false)
  return
}

    const baseQuery = supabase
  .from('leads')
  .select('id,name,phone,status,created_at,stage_entered_at,owner_id')
  .eq('company_id', companyId)
  .order('created_at', { ascending: false })

// ✅ PERFORMANCE:
// - Vendedor (Kanban): traz só um lote (ex.: 600) para não travar o browser
// - Admin (Tabela): também pode paginar depois; por enquanto traga 1000 (ou 2000) no máximo
const PAGE_SIZE = isAdmin ? 1000 : 600

const { data: leadsData, error: leadsErr } = await baseQuery.limit(PAGE_SIZE)

    if (leadsErr) {
      setErrorMsg(`Erro ao carregar leads: ${leadsErr.message}`)
      setLeads([])
      setLoading(false)
      return
    }

    const baseLeads = ((leadsData ?? []) as any as LeadRow[]).map((l) => ({
      ...l,
      stage_entered_at: l.stage_entered_at ?? null,
      owner_id: l.owner_id ?? null,
    }))

    const { data: priData, error: priErr } = await supabase
      .from('lead_user_priority')
      .select('lead_id,pinned,importance')
      .eq('user_id', userId)

    if (priErr) {
      console.warn('Erro ao carregar lead_user_priority (seguindo sem prioridades):', priErr.message)
      setLeads(baseLeads)
      setLoading(false)
      return
    }

    const priMap = new Map<string, PriorityRow>()
    for (const row of (priData ?? []) as any as PriorityRow[]) {
      priMap.set(row.lead_id, row)
    }

    const merged = baseLeads.map((l) => {
      const pri = priMap.get(l.id)
      return {
        ...l,
        pinned: pri?.pinned ?? false,
        importance: pri?.importance ?? 0,
      }
    })

    setLeads(merged)
    setLoading(false)
  }, [companyId, userId, isAdmin])

  React.useEffect(() => {
    load()
  }, [load])
  
  React.useEffect(() => {
    if (!isAdmin) return
  
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,full_name,email,role')
        .eq('company_id', companyId)
        .neq('role', 'admin')
        .order('created_at', { ascending: true })
  
      if (!alive) return
      if (error) {
        console.warn('Erro ao carregar vendedores (profiles):', error.message)
        setOwnerOptions([])
        return
      }
  
      const opts =
        (data ?? []).map((p: any) => ({
          id: String(p.id),
          label: `${p.full_name || p.email || p.id}`,
        })) ?? []
  
      setOwnerOptions(opts)
    })()
  
    return () => {
      alive = false
    }
  }, [isAdmin, companyId])

  return (
    <div style={{ color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Pipeline Comercial</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Logado como: {userLabel} ({role})
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={load}
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

          {/* Importação Excel */}
          <ImportExcelDialog
            userId={userId}
            companyId={companyId}
            importMode={isAdmin ? 'POOL' : 'PRIVATE'}
            onImported={() => load()}
            trigger={
              <button
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
                Importar Excel
              </button>
            }
          />

          <LeadForm userId={userId} companyId={companyId} role={role} onSaved={() => load()} />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {loading ? <div style={{ opacity: 0.8 }}>Carregando…</div> : null}

        {!loading && errorMsg ? (
          <div style={{ border: '1px solid #3a1d1d', background: '#140b0b', padding: 12, borderRadius: 12 }}>
            <div style={{ fontWeight: 800 }}>Erro</div>
            <div style={{ opacity: 0.85, marginTop: 6 }}>{errorMsg}</div>
          </div>
        ) : null}

{!loading && !errorMsg ? (
  isAdmin ? (
    <AdminLeadsTable
      title="Leads (Admin) — visão leve"
      ownerOptions={ownerOptions}
      fetchPage={async ({ ownerId, status, search, page, pageSize }) => {
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        let q = supabase
          .from('leads')
          .select('id,name,phone,status,created_at,owner_id', { count: 'exact' })
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })

        // Dono: ALL | POOL(null) | vendedor(uuid)
        if (ownerId === null) q = q.is('owner_id', null)
        else if (ownerId !== 'ALL') q = q.eq('owner_id', ownerId)

        if (status) q = q.eq('status', status)

        if (search.trim()) {
          const s = search.trim()
          q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`)
        }

        const { data, error, count } = await q.range(from, to)
        if (error) throw error

        return { rows: (data ?? []) as any, total: Number(count ?? 0) }
      }}
    />
  ) : (
    <KanbanBoard leads={leads as any} isAdmin={false} />
  )
) : null}
      </div>
    </div>
  )
}