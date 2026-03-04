'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabaseBrowser } from '../../lib/supabaseBrowser'

export default function AuthButton() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(false)
  const [isAuthed, setIsAuthed] = React.useState<boolean | null>(null)

  // Detecta sessão no client (evita “entrar/sair” errado)
  React.useEffect(() => {
    let alive = true

    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!alive) return
        setIsAuthed(!!data.session)
      } catch {
        if (!alive) return
        setIsAuthed(false)
      }
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session)
    })

    return () => {
      alive = false
      sub?.subscription?.unsubscribe()
    }
  }, [supabase])

  async function logout() {
    if (loading) return
    setLoading(true)
    try {
      await supabase.auth.signOut()
    } finally {
      setLoading(false)
      // ✅ regra: clicou em sair, sempre vai pro login (de qualquer página)
      router.replace('/login')
      router.refresh()
    }
  }

  // Se ainda não carregou sessão, mostra “Entrar” desabilitado pra não piscar
  if (isAuthed === null) {
    return (
      <button
        type="button"
        disabled
        style={{
          padding: '8px 12px',
          borderRadius: 10,
          border: '1px solid #2a2a2a',
          background: '#111',
          color: 'white',
          opacity: 0.7,
        }}
      >
        …
      </button>
    )
  }

  if (!isAuthed) {
    return (
      <button
        type="button"
        onClick={() => {
          // volta pro login e mantém a rota atual pra retorno (opcional)
          const next = pathname ? `?next=${encodeURIComponent(pathname)}` : ''
          router.push(`/login${next}`)
        }}
        style={{
          padding: '8px 12px',
          borderRadius: 10,
          border: '1px solid #2a2a2a',
          background: '#111',
          color: 'white',
          cursor: 'pointer',
        }}
      >
        Entrar
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      style={{
        padding: '8px 12px',
        borderRadius: 10,
        border: '1px solid #2a2a2a',
        background: '#111',
        color: 'white',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.8 : 1,
      }}
    >
      {loading ? 'Saindo…' : 'Sair'}
    </button>
  )
}