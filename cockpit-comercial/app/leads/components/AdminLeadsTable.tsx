'use client'

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

export type OwnerOption = { id: string; label: string }

export type LeadRow = {
  id: string
  name: string
  phone: string | null
  status: string
  created_at: string
  owner_id: string | null
}

type AssignMode = 'manual' | 'round_robin'
type AssignSource = 'selected' | 'pool'

export default function AdminLeadsTable({
  title,
  companyId,
  ownerOptions,
  fetchPage,
}: {
  title?: string
  companyId: string
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

  const [pageSize, setPageSize] = useState<number>(30)
  const [page, setPage] = useState<number>(1)

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rows, setRows] = useState<LeadRow[]>([])
  const [total, setTotal] = useState<number>(0)

  // seleção
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ações de atribuição
  const [assignMode, setAssignMode] = useState<AssignMode>('manual')
  const [assignSource, setAssignSource] = useState<AssignSource>('selected')

  // quantidade total solicitada
  const [qty, setQty] = useState<string>('') // input controlado

  // lote (usado quando source=pool)
  const [batchSize, setBatchSize] = useState<string>('1000')

  const [onlyPool, setOnlyPool] = useState<boolean>(true)

  // manual
  const [toOwnerId, setToOwnerId] = useState<string>('') // vendedor selecionado (manual)

  // round robin
  const [useAllSellers, setUseAllSellers] = useState<boolean>(true)
  const [sellerIds, setSellerIds] = useState<string[]>([])

  const [assigning, setAssigning] = useState<boolean>(false)
  const [assignProgress, setAssignProgress] = useState<{ done: number; total: number } | null>(null)
  const [assignResult, setAssignResult] = useState<string | null>(null)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  const ownerLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of ownerOptions) m.set(o.id, o.label)
    return m
  }, [ownerOptions])

  // quando filtros mudam, volta pra página 1 e limpa seleção/resultado
  useEffect(() => {
    setPage(1)
    setSelectedIds(new Set())
    setAssignResult(null)
    setAssignProgress(null)
  }, [ownerId, status, search, pageSize])

  // Quando troca para source=pool, força POOL (visual) e onlyPool=true
  useEffect(() => {
    if (assignSource === 'pool') {
      setOwnerId('POOL')
      setOnlyPool(true)
    }
  }, [assignSource])

  const reloadPage = useCallback(async () => {
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
      setRows(res.rows)
      setTotal(res.total)
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [fetchPage, ownerId, status, search, page, pageSize])

  useEffect(() => {
    ;(async () => {
      await reloadPage()
    })()
  }, [reloadPage])

  // helpers seleção
  const selectedCount = selectedIds.size

  const isRowSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds])

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows])

  const allPageSelected = useMemo(() => {
    if (pageIds.length === 0) return false
    return pageIds.every((id) => selectedIds.has(id))
  }, [pageIds, selectedIds])

  const toggleSelectPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const everySelected = pageIds.length > 0 && pageIds.every((id) => next.has(id))
      if (everySelected) {
        for (const id of pageIds) next.delete(id)
      } else {
        for (const id of pageIds) next.add(id)
      }
      return next
    })
  }, [pageIds])

  const effectiveSellerIds = useMemo(() => {
    if (useAllSellers) return ownerOptions.map((o) => o.id)
    return sellerIds
  }, [useAllSellers, sellerIds, ownerOptions])

  const parsePositiveInt = useCallback((s: string) => {
    if (!s.trim()) return null
    const n = Number(s)
    if (!Number.isFinite(n) || n <= 0) return NaN
    return Math.floor(n)
  }, [])

  const qtyParsed = useMemo(() => parsePositiveInt(qty), [qty, parsePositiveInt])
  const batchParsed = useMemo(() => parsePositiveInt(batchSize), [batchSize, parsePositiveInt])

  const validateCommon = useCallback(() => {
    setAssignResult(null)
    setAssignProgress(null)

    if (qtyParsed !== null && Number.isNaN(qtyParsed)) {
      alert('Quantidade inválida. Use um número inteiro maior que 0.')
      return false
    }

    if (assignSource === 'pool') {
      if (qtyParsed === null) {
        alert('Informe a quantidade de leads do POOL que serão enviados.')
        return false
      }
      if (batchParsed === null || Number.isNaN(batchParsed)) {
        alert('Tamanho do lote inválido. Use um número inteiro maior que 0 (ex.: 1000).')
        return false
      }
    }

    if (assignSource === 'selected' && selectedIds.size === 0) {
      alert('Selecione pelo menos 1 lead (ou mude a origem para "POOL").')
      return false
    }

    if (assignMode === 'round_robin') {
      if (effectiveSellerIds.length === 0) {
        alert('Selecione pelo menos 1 vendedor (ou marque "Usar todos").')
        return false
      }
    } else {
      // manual pode ser "devolver ao pool", então toOwnerId pode ser vazio
      // (a ação "Atribuir" manual exige vendedor; a ação "Devolver" não)
    }

    return true
  }, [assignMode, assignSource, batchParsed, effectiveSellerIds, qtyParsed, selectedIds.size])
  const rpcAssign = useCallback(
    async (args: {
      source: AssignSource
      limit: number | null
      leadIds: string[]
      mode: AssignMode
      toOwner: string | null
      onlyIfPoolOverride?: boolean
    }) => {
      const { data, error } = await supabase.rpc('assign_leads', {
        p_company_id: companyId,
        p_source: args.source,
        p_limit: args.limit,
        p_lead_ids: args.leadIds,

        p_status: status === 'all' ? null : status,
        p_search: search.trim() ? search.trim() : null,

        p_mode: args.mode,
        p_to_owner_id: args.mode === 'manual' ? args.toOwner : null,
        p_seller_ids: args.mode === 'round_robin' ? effectiveSellerIds : [],

        p_only_if_pool: args.source === 'pool' ? true : (args.onlyIfPoolOverride ?? onlyPool),
      })

      if (error) throw error

      const row = Array.isArray(data) ? data[0] : data
      return {
        assigned: Number(row?.assigned_count ?? 0),
        skipped: Number(row?.skipped_count ?? 0),
      }
    },
    [companyId, effectiveSellerIds, onlyPool, search, status]
  )

  const doAssignSelectedManualToSeller = useCallback(async () => {
    if (!validateCommon()) return
    if (!toOwnerId) {
      alert('Selecione um vendedor para atribuir.')
      return
    }

    setAssigning(true)
    try {
      const leadIds = Array.from(selectedIds)
      const res = await rpcAssign({
        source: 'selected',
        limit: qtyParsed === null ? null : qtyParsed,
        leadIds,
        mode: 'manual',
        toOwner: toOwnerId,
      })

      setAssignResult(`Atribuídos: ${res.assigned} | Ignorados: ${res.skipped}` + (onlyPool ? ' (não estavam no POOL)' : ''))
      clearSelection()
      await reloadPage()
    } catch (e: any) {
      alert('Erro ao atribuir: ' + (e?.message ?? String(e)))
    } finally {
      setAssigning(false)
      setAssignProgress(null)
    }
  }, [clearSelection, onlyPool, qtyParsed, reloadPage, rpcAssign, selectedIds, toOwnerId, validateCommon])

  const doReturnSelectedToPool = useCallback(async () => {
    if (assignSource !== 'selected' || selectedIds.size === 0) return

    const ok = confirm('Devolver os leads selecionados para o POOL?')
    if (!ok) return

    setAssigning(true)
    setAssignResult(null)
    setAssignProgress(null)

    try {
      const leadIds = Array.from(selectedIds)
      const res = await rpcAssign({
        source: 'selected',
        limit: qtyParsed === null ? null : qtyParsed,
        leadIds,
        mode: 'manual',
        toOwner: null,
        onlyIfPoolOverride: false,
      })

      setAssignResult(`Devolvidos ao POOL: ${res.assigned} | Ignorados: ${res.skipped}`)
      clearSelection()
      await reloadPage()
    } catch (e: any) {
      alert('Erro ao devolver ao POOL: ' + (e?.message ?? String(e)))
    } finally {
      setAssigning(false)
      setAssignProgress(null)
    }
  }, [assignSource, clearSelection, qtyParsed, reloadPage, rpcAssign, selectedIds])

  const doAssign = useCallback(async () => {
    if (!validateCommon()) return

    setAssigning(true)
    try {
      // SELECTED
      if (assignSource === 'selected') {
        if (assignMode === 'manual') {
          await doAssignSelectedManualToSeller()
          return
        }

        // selected + round_robin (uma chamada)
        const leadIds = Array.from(selectedIds)
        const res = await rpcAssign({
          source: 'selected',
          limit: qtyParsed === null ? null : qtyParsed,
          leadIds,
          mode: 'round_robin',
          toOwner: null,
        })

        setAssignResult(`Atribuídos: ${res.assigned} | Ignorados: ${res.skipped}` + (onlyPool ? ' (não estavam no POOL)' : ''))
        clearSelection()
        await reloadPage()
        return
      }

      // POOL (lotes)
      const totalToSend = qtyParsed as number
      const batch = Math.min(batchParsed as number, totalToSend)

      let done = 0
      let assignedTotal = 0

      setAssignProgress({ done: 0, total: totalToSend })

      while (done < totalToSend) {
        const remaining = totalToSend - done
        const currentLimit = Math.min(batch, remaining)

        const res = await rpcAssign({
          source: 'pool',
          limit: currentLimit,
          leadIds: [],
          mode: assignMode,
          // manual no pool exige vendedor; round_robin usa sellerIds
          toOwner: assignMode === 'manual' ? (toOwnerId ? toOwnerId : null) : null,
        })

        assignedTotal += res.assigned
        done += currentLimit
        setAssignProgress({ done, total: totalToSend })

        // pool acabou
        if (res.assigned === 0) break
      }

      setAssignResult(
        `Atribuídos: ${assignedTotal} | Não encontrados no POOL para completar: ${Math.max(totalToSend - assignedTotal, 0)}`
      )

      await reloadPage()
    } catch (e: any) {
      alert('Erro ao atribuir: ' + (e?.message ?? String(e)))
    } finally {
      setAssigning(false)
      setAssignProgress(null)
    }
  }, [
    assignMode,
    assignSource,
    batchParsed,
    clearSelection,
    doAssignSelectedManualToSeller,
    onlyPool,
    qtyParsed,
    reloadPage,
    rpcAssign,
    selectedIds,
    toOwnerId,
    validateCommon,
  ])

  const pillBtnStyle: React.CSSProperties = {
    border: '1px solid #2a2a2a',
    background: 'transparent',
    color: '#cbd5e1',
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 999,
    cursor: 'pointer',
  }

  const dangerBtnStyle: React.CSSProperties = {
    border: '1px solid #7f1d1d',
    background: '#1a0b0b',
    color: '#fecaca',
    fontSize: 12,
    padding: '8px 10px',
    borderRadius: 10,
    cursor: 'pointer',
  }

  const selectStyle: React.CSSProperties = {
    background: '#111',
    border: '1px solid #2a2a2a',
    color: 'white',
    padding: '10px 12px',
    borderRadius: 10,
    outline: 'none',
    minWidth: 200,
  }

  const inputStyle: React.CSSProperties = {
    background: '#111',
    border: '1px solid #2a2a2a',
    color: 'white',
    padding: '10px 12px',
    borderRadius: 10,
    outline: 'none',
    width: 150,
  }

  const showBar = assignSource === 'pool' || selectedCount > 0

  return (
    <div style={{ border: '1px solid #333', borderRadius: 12, padding: 14, background: '#0f0f0f' }}>
      {title ? <h3 style={{ marginTop: 0, marginBottom: 10 }}>{title}</h3> : null}

      {/* Filtros */}
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
          disabled={assignSource === 'pool'}
          style={{
            background: '#111',
            border: '1px solid #2a2a2a',
            color: 'white',
            padding: '10px 12px',
            borderRadius: 10,
            outline: 'none',
            minWidth: 180,
            opacity: assignSource === 'pool' ? 0.7 : 1,
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

        <div style={{ opacity: 0.75, fontSize: 12, alignSelf: 'center' }}>{loading ? 'Carregando…' : `Total: ${total}`}</div>
      </div>

      {/* Barra de atribuição */}
      {showBar ? (
        <div
          style={{
            border: '1px solid #222',
            background: '#0b0b0b',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {assignSource === 'selected' ? (
                <>
                  Selecionados: <b>{selectedCount}</b>
                </>
              ) : (
                <>
                  Origem: <b>POOL</b>
                </>
              )}
            </div>

            {assignSource === 'selected' ? (
              <button type="button" onClick={clearSelection} style={pillBtnStyle} disabled={assigning}>
                Limpar seleção
              </button>
            ) : null}

            <select
              value={assignSource}
              onChange={(e) => setAssignSource(e.target.value as AssignSource)}
              disabled={assigning}
              style={{ ...selectStyle, minWidth: 190 }}
              title="Origem dos leads"
            >
              <option value="selected">Selecionados</option>
              <option value="pool">POOL (pegar automaticamente)</option>
            </select>

            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="numeric"
              placeholder={assignSource === 'pool' ? 'Quantidade (obrig.)' : 'Quantidade (opcional)'}
              style={inputStyle}
              disabled={assigning}
              title="Quantidade de leads para enviar"
            />

            {assignSource === 'pool' ? (
              <input
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                inputMode="numeric"
                placeholder="Lote (ex.: 1000)"
                style={{ ...inputStyle, width: 140 }}
                disabled={assigning}
                title="Tamanho do lote (recomendado 500 a 2000)"
              />
            ) : null}

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, opacity: 0.9 }}>
              <input
                type="checkbox"
                checked={assignSource === 'pool' ? true : onlyPool}
                onChange={(e) => setOnlyPool(e.target.checked)}
                disabled={assigning || assignSource === 'pool'}
              />
              Somente POOL (evita reatribuição)
            </label>

            <select
              value={assignMode}
              onChange={(e) => setAssignMode(e.target.value as AssignMode)}
              disabled={assigning}
              style={{ ...selectStyle, minWidth: 200 }}
              title="Modo de atribuição"
            >
              <option value="manual">Manual (1 vendedor)</option>
              <option value="round_robin">Automático (round-robin)</option>
            </select>

            {assignMode === 'manual' ? (
              <select value={toOwnerId} onChange={(e) => setToOwnerId(e.target.value)} disabled={assigning} style={selectStyle}>
                <option value="">— selecione o vendedor —</option>
                {ownerOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, opacity: 0.9 }}>
                  <input
                    type="checkbox"
                    checked={useAllSellers}
                    onChange={(e) => setUseAllSellers(e.target.checked)}
                    disabled={assigning}
                  />
                  Usar todos vendedores
                </label>

                {!useAllSellers ? (
                  <select
                    multiple
                    value={sellerIds}
                    onChange={(e) => setSellerIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
                    disabled={assigning}
                    style={{ ...selectStyle, minWidth: 320, height: 120, padding: '8px 10px' }}
                    title="Selecione os vendedores (Cmd para múltiplos no Mac)"
                  >
                    {ownerOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            )}

            {/* ✅ NOVO: Devolver ao POOL */}
            {assignSource === 'selected' && selectedCount > 0 ? (
              <button type="button" onClick={doReturnSelectedToPool} disabled={assigning} style={dangerBtnStyle}>
                Devolver ao POOL
              </button>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={doAssign}
              disabled={assigning}
              style={{
                border: '1px solid #334155',
                background: assigning ? '#0b1220' : '#111827',
                color: 'white',
                borderRadius: 10,
                padding: '10px 12px',
                cursor: assigning ? 'not-allowed' : 'pointer',
                fontSize: 13,
                opacity: assigning ? 0.75 : 1,
                minWidth: 160,
              }}
            >
              {assigning ? 'Enviando…' : assignMode === 'manual' ? 'Atribuir' : 'Distribuir'}
            </button>

            {assignProgress ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Progresso: <b>{assignProgress.done}</b> / <b>{assignProgress.total}</b>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {assignResult ? <div style={{ marginBottom: 10, color: '#a7f3d0', fontSize: 13 }}>{assignResult}</div> : null}
      {errorMsg ? <div style={{ marginBottom: 10, color: '#ef4444', fontSize: 13 }}>Erro: {errorMsg}</div> : null}

      {/* Tabela */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #222' }}>
              <th style={{ padding: '10px 8px', width: 36 }}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectPage}
                  disabled={loading || rows.length === 0}
                  title="Selecionar/desmarcar todos desta página"
                />
              </th>
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
                <td colSpan={7} style={{ padding: 12, opacity: 0.7 }}>
                  Nenhum lead encontrado.
                </td>
              </tr>
            ) : (
              rows.map((l) => {
                const ownerLabel = l.owner_id ? ownerLabelById.get(l.owner_id) ?? 'Vendedor' : 'POOL'
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid #1f1f1f' }}>
                    <td style={{ padding: '10px 8px' }}>
                      <input type="checkbox" checked={isRowSelected(l.id)} onChange={() => toggleRow(l.id)} disabled={loading} />
                    </td>

                    <td style={{ padding: '10px 8px' }}>
                      <a href={`/leads/${l.id}`} style={{ color: 'white', textDecoration: 'none' }}>
                        <b>{l.name}</b>
                      </a>
                    </td>
                    <td style={{ padding: '10px 8px', opacity: 0.9 }}>{l.phone ?? '—'}</td>
                    <td style={{ padding: '10px 8px', textTransform: 'capitalize' }}>{l.status}</td>
                    <td style={{ padding: '10px 8px', opacity: 0.75 }}>{new Date(l.created_at).toLocaleString()}</td>
                    <td style={{ padding: '10px 8px', opacity: 0.85 }}>{ownerLabel}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <a href={`/leads/${l.id}`} style={{ color: '#9aa', textDecoration: 'none' }}>
                        Abrir →
                      </a>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
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