'use client'

import React, { useEffect, useMemo, useState } from 'react'

export type OwnerOption = { id: string; label: string }

export type LeadRow = {
  id: string
  name: string
  phone: string | null
  status: string
  created_at: string
  owner_id: string | null
}

export default function AdminLeadsTable({
  title,
  ownerOptions,
  fetchPage,
}: {
  title?: string
  ownerOptions: OwnerOption[]
  fetchPage: (args: {
    ownerId: string | null // null = POOL, 'ALL' = todos
    status: string | null
    search: string
    page: number
    pageSize: number
  }) => Promise<{ rows: LeadRow[]; total: number }>
}) {
  const [ownerId, setOwnerId] = useState<string>('ALL')
  const [status, setStatus] = useState<string>('all')
  const [search, setSearch] = useState<string>('')

  const [pageSize, setPageSize] = useState<number>(30) // default inteligente
  const [page, setPage] = useState<number>(1)

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rows, setRows] = useState<LeadRow[]>([])
  const [total, setTotal] = useState<number>(0)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  // quando filtros mudam, volta pra página 1
  useEffect(() => {
    setPage(1)
  }, [ownerId, status, search, pageSize])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setErrorMsg(null)
      try {
        const res = await fetchPage({
          ownerId: ownerId === 'ALL' ? 'ALL' : ownerId === 'POOL' ? null : ownerId,
          status: status === 'all' ? null : status,
          search,
          page,
          pageSize,
        })
        if (!alive) return
        setRows(res.rows)
        setTotal(res.total)
      } catch (e: any) {
        if (!alive) return
        setErrorMsg(e?.message ?? String(e))
      } finally {
        if (!alive) return
        setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [ownerId, status, search, page, pageSize, fetchPage])

  return (
    <div style={{ border: '1px solid #333', borderRadius: 12, padding: 14, background: '#0f0f0f' }}>
      {title ? <h3 style={{ marginTop: 0, marginBottom: 10 }}>{title}</h3> : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome/telefone…"
          style={{
            flex: 1,
            minWidth: 260,
            background: '#111',
            border: '1px solid #2a2a2a',
            color: 'white',
            padding: '10px 12px',
            borderRadius: 10,
            outline: 'none',
          }}
        />

        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          style={{
            background: '#111',
            border: '1px solid #2a2a2a',
            color: 'white',
            padding: '10px 12px',
            borderRadius: 10,
            outline: 'none',
            minWidth: 180,
          }}
        >
          <option value="ALL">Todos</option>
          <option value="POOL">Somente POOL</option>
          {ownerOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{
            background: '#111',
            border: '1px solid #2a2a2a',
            color: 'white',
            padding: '10px 12px',
            borderRadius: 10,
            outline: 'none',
            minWidth: 170,
          }}
        >
          <option value="all">Todos os status</option>
          <option value="novo">novo</option>
          <option value="contato">contato</option>
          <option value="respondeu">respondeu</option>
          <option value="negociacao">negociacao</option>
          <option value="fechado">fechado</option>
          <option value="perdido">perdido</option>
        </select>


        <div style={{ opacity: 0.75, fontSize: 12, alignSelf: 'center' }}>
          {loading ? 'Carregando…' : `Total: ${total}`}
        </div>
      </div>

      {errorMsg ? (
        <div style={{ marginBottom: 10, color: '#ef4444', fontSize: 13 }}>Erro: {errorMsg}</div>
      ) : null}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #222' }}>
              <th style={{ padding: '10px 8px' }}>Nome</th>
              <th style={{ padding: '10px 8px' }}>Telefone</th>
              <th style={{ padding: '10px 8px' }}>Status</th>
              <th style={{ padding: '10px 8px' }}>Criado</th>
              <th style={{ padding: '10px 8px' }}>Dono</th>
              <th style={{ padding: '10px 8px' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 12, opacity: 0.7 }}>
                  Nenhum lead encontrado.
                </td>
              </tr>
            ) : (
              rows.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid #1f1f1f' }}>
                  <td style={{ padding: '10px 8px' }}>
                    <a href={`/leads/${l.id}`} style={{ color: 'white', textDecoration: 'none' }}>
                      <b>{l.name}</b>
                    </a>
                  </td>
                  <td style={{ padding: '10px 8px', opacity: 0.9 }}>{l.phone ?? '—'}</td>
                  <td style={{ padding: '10px 8px', textTransform: 'capitalize' }}>{l.status}</td>
                  <td style={{ padding: '10px 8px', opacity: 0.75 }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{ padding: '10px 8px', opacity: 0.75 }}>{l.owner_id ? 'Vendedor' : 'POOL'}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <a href={`/leads/${l.id}`} style={{ color: '#9aa', textDecoration: 'none' }}>
                      Abrir →
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* paginação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 12, alignItems: 'center' }}>
        <div style={{ opacity: 0.7, fontSize: 12 }}>
          Página <b>{page}</b> de <b>{totalPages}</b>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
  <select
    value={pageSize}
    onChange={(e) => setPageSize(Number(e.target.value))}
    disabled={loading}
    style={{
      background: '#111',
      border: '1px solid #333',
      color: 'white',
      padding: '8px 10px',
      borderRadius: 10,
      outline: 'none',
      minWidth: 130,
      opacity: loading ? 0.7 : 1,
      cursor: loading ? 'not-allowed' : 'pointer',
    }}
    title="Itens por página"
  >
    <option value={20}>20 / página</option>
    <option value={30}>30 / página</option>
    <option value={40}>40 / página</option>
    <option value={50}>50 / página</option>
  </select>

  <button
    type="button"
    onClick={() => setPage((p) => Math.max(1, p - 1))}
    disabled={page <= 1 || loading}
    style={{
      border: '1px solid #333',
      background: '#111',
      color: 'white',
      borderRadius: 10,
      padding: '8px 10px',
      cursor: page <= 1 || loading ? 'not-allowed' : 'pointer',
      opacity: page <= 1 || loading ? 0.6 : 1,
    }}
  >
    ← Anterior
  </button>

  <button
    type="button"
    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
    disabled={page >= totalPages || loading}
    style={{
      border: '1px solid #333',
      background: '#111',
      color: 'white',
      borderRadius: 10,
      padding: '8px 10px',
      cursor: page >= totalPages || loading ? 'not-allowed' : 'pointer',
      opacity: page >= totalPages || loading ? 0.6 : 1,
    }}
  >
    Próxima →
  </button>
</div>
      </div>
    </div>
  )
}