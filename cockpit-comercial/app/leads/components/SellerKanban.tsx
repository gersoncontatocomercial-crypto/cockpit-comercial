'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { supabaseBrowser } from '../../lib/supabaseBrowser'
import ConversationPasteAI from './ConversationPasteAI'

type Lead = {
  id: string
  name: string
  phone: string | null
  status: string
  created_at: string
  stage_entered_at: string | null
  deal_value?: number | null
  current_stage_id?: string | null
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

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}

function whatsappLink(phone: string | null) {
  const digits = onlyDigits(phone ?? '')
  if (!digits) return null
  const full = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${full}`
}

const WON_STAGE_ID = '956d91ff-64a6-4298-b023-3953333f3761' // pipeline_stages.key='won'

function parseBRLMoney(input: string) {
  // aceita "2000", "2.000", "2.000,50", "2000,50"
  const s = (input || '').trim()
  if (!s) return null
  const norm = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  const n = Number(norm)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

type PendingWonMove = {
  leadId: string
  fromStatus: Status
  toStatus: 'ganho'
  secondsInFromStage: number
}

export default function SellerKanban({ userId, companyId }: { userId: string; companyId: string }) {
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [leads, setLeads] = useState<Lead[]>([])
  const [search, setSearch] = useState('')

  const [savingLeadId, setSavingLeadId] = useState<string | null>(null)

  const [pendingWonMove, setPendingWonMove] = useState<PendingWonMove | null>(null)
  const [wonValueRaw, setWonValueRaw] = useState('')
  const [savingWon, setSavingWon] = useState(false)

  const closeWonModal = useCallback(() => {
    setPendingWonMove(null)
    setWonValueRaw('')
    setSavingWon(false)
  }, [])

  const loadLeads = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)

    const { data, error } = await supabase
      .from('leads')
      .select('id,name,phone,status,created_at,stage_entered_at,deal_value,current_stage_id')
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

    setLeads((data ?? []) as any)
    setLoading(false)
  }, [companyId, userId, supabase])

  useEffect(() => {
    if (!userId || !companyId) return
    void loadLeads()
  }, [loadLeads, userId, companyId])

  const filteredLeads = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return leads
    return leads.filter((l) => (l.name || '').toLowerCase().includes(s) || (l.phone || '').includes(s))
  }, [leads, search])

  const byStatus = useMemo(() => {
    const map: Record<string, Lead[]> = {}
    for (const st of STATUSES) map[st] = []
    for (const l of filteredLeads) {
      const st = (l.status || 'novo').toLowerCase()
      ;(map[st] ?? (map[st] = [])).push(l)
    }
    return map
  }, [filteredLeads])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const st of STATUSES) c[st] = byStatus[st]?.length ?? 0
    return c
  }, [byStatus])

  const moveLocal = useCallback((leadId: string, to: Status) => {
    const nowIso = new Date().toISOString()
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: to, stage_entered_at: nowIso } : l)))
  }, [])

  const performMove = useCallback(
    async (
      leadId: string,
      fromStatus: string,
      toStatus: string,
      secondsInFromStage: number,
      extraMeta?: any,
      dealValueOverride?: number | null
    ) => {
      setSavingLeadId(leadId)

      // valida ganho (dealValue vem do modal)
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
      } catch (e: any) {
        // rollback local (volta o status visual)
        setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: fromStatus as any } : l)))
        setErrorMsg('Erro ao mover lead: ' + (e?.message ?? String(e)))
        throw e
      } finally {
        setSavingLeadId(null)
      }
    },
    [companyId, supabase]
  )

  const confirmWonMove = useCallback(async () => {
    if (!pendingWonMove) return
    if (savingWon) return

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
        pendingWonMove.toStatus,
        pendingWonMove.secondsInFromStage,
        undefined,
        parsed
      )
      closeWonModal()
    } finally {
      setSavingWon(false)
    }
  }, [pendingWonMove, savingWon, wonValueRaw, moveLocal, performMove, closeWonModal])

  const onDragEnd = useCallback(
    async (r: DropResult) => {
      if (!r.destination) return
      if (!companyId) return
      if (savingLeadId) return

      const leadId = r.draggableId
      const toStatus = r.destination.droppableId as Status

      const lead = leads.find((l) => l.id === leadId)
      if (!lead) return

      const fromStatus = ((lead.status || 'novo').toLowerCase() as Status) ?? 'novo'
      if (fromStatus === toStatus) return

      const startIso = lead.stage_entered_at ?? lead.created_at
      const startMs = new Date(startIso).getTime()
      const secondsInFromStage = Math.max(1, Math.floor((Date.now() - startMs) / 1000))

      if (toStatus === 'ganho') {
        setPendingWonMove({ leadId, fromStatus, toStatus: 'ganho', secondsInFromStage })
        setWonValueRaw('')
        return
      }

      moveLocal(leadId, toStatus)

      try {
        await performMove(leadId, fromStatus, toStatus, secondsInFromStage)
      } catch (e: any) {
        setErrorMsg('Erro ao mover lead: ' + (e?.message ?? String(e)))
      }
    },
    [companyId, leads, performMove, savingLeadId, moveLocal]
  )

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

  return (
    <div style={{ color: 'white' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Minha carteira (Kanban)</div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome/telefone…"
            style={{
              background: '#111',
              border: '1px solid #2a2a2a',
              color: 'white',
              padding: '10px 12px',
              borderRadius: 10,
              outline: 'none',
              minWidth: 240,
            }}
          />
          <button
            onClick={loadLeads}
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

      {errorMsg ? (
        <div style={{ marginTop: 10, padding: 10, border: '1px solid #7f1d1d', background: '#1a0b0b', borderRadius: 10, color: '#fecaca' }}>
          {errorMsg}
        </div>
      ) : null}

      {loading ? <div style={{ marginTop: 10, opacity: 0.8 }}>Carregando…</div> : null}

      {!loading && filteredLeads.length === 0 ? (
        <div style={{ marginTop: 14, opacity: 0.75 }}>Você não tem leads na sua carteira no momento.</div>
      ) : null}

      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingTop: 14 }}>
          {STATUSES.map((st) => (
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontWeight: 900 }}>{STATUS_LABEL[st]}</div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>{counts[st]}</div>
                  </div>

                  {(byStatus[st] ?? []).map((l, idx) => {
                    const wa = whatsappLink(l.phone)
                    const isSaving = savingLeadId === l.id

                    return (
                      <Draggable key={l.id} draggableId={l.id} index={idx} isDragDisabled={!!savingLeadId}>
                        {(p) => (
                          <div
                            ref={p.innerRef}
                            {...p.draggableProps}
                            {...p.dragHandleProps}
                            style={{
                              ...p.draggableProps.style,
                              border: '1px solid #333',
                              background: '#111',
                              borderRadius: 12,
                              padding: 12,
                              marginBottom: 10,
                              opacity: isSaving ? 0.7 : 1,
                              cursor: isSaving ? 'not-allowed' : 'grab',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                              <div style={{ fontWeight: 900, lineHeight: 1.2 }}>{l.name}</div>
                              <div style={{ opacity: 0.6, fontSize: 12 }}>{isSaving ? 'Salvando…' : ''}</div>
                            </div>

                            <div style={{ opacity: 0.85, marginTop: 6 }}>{l.phone ?? '—'}</div>

                            <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                              <a href={`/leads/${l.id}`} style={{ color: '#9aa', textDecoration: 'none', fontSize: 12 }}>
                                Abrir →
                              </a>

                              {wa ? (
                                <a href={wa} target="_blank" rel="noreferrer" style={{ color: '#9aa', textDecoration: 'none', fontSize: 12 }}>
                                  WhatsApp →
                                </a>
                              ) : null}

                              <ConversationPasteAI
                                lead={{ id: l.id, company_id: companyId, name: l.name, phone: l.phone, status: l.status }}
                                onSaved={() => {
                                  // futuramente: atualizar badge “última análise”
                                }}
                                trigger={
                                  <button type="button" style={pillBtnStyle} disabled={!!savingLeadId}>
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
          ))}
        </div>
      </DragDropContext>

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
          onClick={closeWonModal}
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
            <div style={{ fontWeight: 900, fontSize: 16 }}>Fechar como ganho</div>
            <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>Informe o valor do negócio (R$)</div>

            <input
              value={wonValueRaw}
              onChange={(e) => setWonValueRaw(e.target.value)}
              placeholder="Ex.: 2000 ou 2.000,50"
              style={{
                marginTop: 12,
                width: '100%',
                background: '#111',
                border: '1px solid #2a2a2a',
                color: 'white',
                padding: '10px 12px',
                borderRadius: 10,
                outline: 'none',
              }}
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                type="button"
                onClick={closeWonModal}
                disabled={savingWon}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: 'transparent',
                  color: 'white',
                  cursor: 'pointer',
                  opacity: savingWon ? 0.7 : 1,
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
                  opacity: savingWon ? 0.7 : 1,
                }}
              >
                {savingWon ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}