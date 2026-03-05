'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

const CHANNELS = [
  { value: '', label: 'Selecione o canal…' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'ligacao', label: 'Ligação' },
  { value: 'email', label: 'E-mail' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'outro', label: 'Outro' },
] as const

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #2a2a2a',
  background: '#111',
  color: 'white',
  outline: 'none',
  width: '100%',
}

export default function NextContactForm({
  leadId,
  initialAction,
  initialNextContactAt,
  initialChannel,
}: {
  leadId: string
  initialAction?: string | null
  initialNextContactAt?: string | null
  initialChannel?: string | null
}) {
  const router = useRouter()
  const [nextAction, setNextAction] = useState(initialAction ?? '')
  const [nextContactAt, setNextContactAt] = useState(
    initialNextContactAt ? new Date(initialNextContactAt).toISOString().slice(0, 16) : ''
  )
  const [channel, setChannel] = useState(initialChannel ?? '')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  const salvar = async () => {
    if (!nextContactAt) {
      alert('Defina a data/hora do próximo contato.')
      return
    }

    setLoading(true)
    setSaved(false)

    const { error } = await supabase
      .from('leads')
      .update({
        next_action: nextAction || null,
        next_contact_at: new Date(nextContactAt).toISOString(),
        next_action_channel: channel || null,
      })
      .eq('id', leadId)

    setLoading(false)

    if (error) {
      alert('Erro: ' + error.message)
      return
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Próxima ação</div>
        <input
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          placeholder="Ex.: Enviar proposta via WhatsApp / Ligar / Follow-up"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Data / hora</div>
          <input
            type="datetime-local"
            value={nextContactAt}
            onChange={(e) => setNextContactAt(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Canal</div>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            style={{ ...inputStyle }}
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={salvar}
          disabled={loading}
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid #2a2a2a',
            background: '#151515',
            color: 'white',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Salvando...' : 'Salvar próximo contato'}
        </button>
        {saved && (
          <span style={{ fontSize: 12, color: '#86efac', opacity: 0.9 }}>
            ✓ Salvo
          </span>
        )}
      </div>
    </div>
  )
}
