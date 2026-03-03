'use client'

import * as React from 'react'
import { supabase } from '@/app/lib/supabase'

export default function AuthButton() {
  const [loading, setLoading] = React.useState(false)
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    let alive = true

    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!alive) return
      setSignedIn(Boolean(data?.session))
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return
      setSignedIn(Boolean(session))
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function doSignOut() {
    setLoading(true)
    try {
      await supabase.auth.signOut()
    } finally {
      setLoading(false)
    }
  }

  if (signedIn === null) {
    return (
      <button
        type="button"
        disabled
        style={{
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid #2a2a2a',
          background: '#111',
          color: 'white',
          fontSize: 13,
          opacity: 0.7,
        }}
      >
        Carregando…
      </button>
    )
  }

  if (!signedIn) {
    return (
      <button
        type="button"
        onClick={() => {
          window.location.href = '/login'
        }}
        style={{
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid #2a2a2a',
          background: '#111',
          color: 'white',
          textDecoration: 'none',
          fontSize: 13,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          pointerEvents: 'auto',
          position: 'relative',
          zIndex: 50,
        }}
        title="Ir para login"
      >
        Entrar
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={doSignOut}
      disabled={loading}
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid #2a2a2a',
        background: loading ? '#0f0f0f' : '#111',
        color: 'white',
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: 13,
        opacity: loading ? 0.7 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {loading ? 'Saindo…' : 'Sair'}
    </button>
  )
}
