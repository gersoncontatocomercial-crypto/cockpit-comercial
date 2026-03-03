'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'

type Profile = {
  full_name: string | null
  role: string
  company_id: string
}

type Company = {
  id: string
  name: string | null
  legal_name: string | null
  trade_name: string | null
  cnpj: string | null
  segment: string | null
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  cep: string | null
  address: string | null
} | null

type Tab = 'perfil' | 'empresa' | 'usuarios'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: '#1a1a1a',
  border: '1px solid #333',
  borderRadius: 8,
  color: 'white',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  fontSize: 13,
  color: '#ccc',
}

const sectionStyle: React.CSSProperties = {
  background: '#0f0f0f',
  border: '1px solid #222',
  borderRadius: 12,
  padding: 20,
  display: 'grid',
  gap: 14,
}

export default function ConfiguracoesClient({
  userId,
  userEmail,
  profile,
  company,
}: {
  userId: string
  userEmail: string
  profile: Profile
  company: Company
}) {
  const isAdmin = profile.role === 'admin'
  const isAdminOrManager = profile.role === 'admin' || profile.role === 'manager'

  const [tab, setTab] = useState<Tab>('perfil')

  // --- Perfil ---
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // --- Senha ---
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // --- Empresa ---
  const [companyForm, setCompanyForm] = useState({
    legal_name: company?.legal_name ?? '',
    trade_name: company?.trade_name ?? '',
    cnpj: company?.cnpj ?? '',
    segment: company?.segment ?? '',
    email: company?.email ?? '',
    phone: company?.phone ?? '',
    city: company?.city ?? '',
    state: company?.state ?? '',
    cep: company?.cep ?? '',
    address: company?.address ?? '',
  })
  const [companyLoading, setCompanyLoading] = useState(false)
  const [companyMsg, setCompanyMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function saveProfile() {
    if (profileLoading) return
    setProfileLoading(true)
    setProfileMsg(null)
    const res = await fetch('/api/settings/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName }),
    })
    const json = await res.json()
    setProfileLoading(false)
    setProfileMsg(res.ok ? { ok: true, text: 'Perfil atualizado com sucesso.' } : { ok: false, text: json?.error || 'Erro ao salvar.' })
  }

  async function savePassword() {
    if (passwordLoading) return
    if (!newPassword) return setPasswordMsg({ ok: false, text: 'Informe a nova senha.' })
    if (newPassword.length < 6) return setPasswordMsg({ ok: false, text: 'Senha precisa ter pelo menos 6 caracteres.' })
    if (newPassword !== confirmPassword) return setPasswordMsg({ ok: false, text: 'As senhas não coincidem.' })
    setPasswordLoading(true)
    setPasswordMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordLoading(false)
    if (error) {
      setPasswordMsg({ ok: false, text: error.message })
    } else {
      setPasswordMsg({ ok: true, text: 'Senha atualizada com sucesso.' })
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  async function saveCompany() {
    if (companyLoading) return
    setCompanyLoading(true)
    setCompanyMsg(null)
    const res = await fetch('/api/settings/update-company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(companyForm),
    })
    const json = await res.json()
    setCompanyLoading(false)
    setCompanyMsg(res.ok ? { ok: true, text: 'Empresa atualizada com sucesso.' } : { ok: false, text: json?.error || 'Erro ao salvar.' })
  }

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '9px 18px',
    borderRadius: 10,
    border: '1px solid #2a2a2a',
    background: active ? '#1a1a1a' : 'transparent',
    color: active ? 'white' : '#888',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  })

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', color: 'white', padding: '10px 0 40px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Configurações</h1>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 24 }}>
        Gerencie seu perfil, empresa e equipe.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button style={tabBtnStyle(tab === 'perfil')} onClick={() => setTab('perfil')}>
          Meu Perfil
        </button>
        {isAdmin && (
          <button style={tabBtnStyle(tab === 'empresa')} onClick={() => setTab('empresa')}>
            Minha Empresa
          </button>
        )}
        {isAdminOrManager && (
          <button style={tabBtnStyle(tab === 'usuarios')} onClick={() => setTab('usuarios')}>
            Usuários
          </button>
        )}
      </div>

      {/* --- Perfil --- */}
      {tab === 'perfil' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <div style={sectionStyle}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Informações pessoais</h2>

            <label style={labelStyle}>
              Email (não editável)
              <input
                value={userEmail}
                disabled
                style={{ ...inputStyle, opacity: 0.45, cursor: 'not-allowed' }}
              />
            </label>

            <label style={labelStyle}>
              Nome completo
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
                style={inputStyle}
              />
            </label>

            {profileMsg && (
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: profileMsg.ok ? '#0d2a12' : '#2a0d0d',
                  fontSize: 13,
                }}
              >
                {profileMsg.text}
              </div>
            )}

            <button
              onClick={saveProfile}
              disabled={profileLoading}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                border: '1px solid #333',
                background: '#1a1a1a',
                color: 'white',
                cursor: profileLoading ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                alignSelf: 'flex-start',
              }}
            >
              {profileLoading ? 'Salvando…' : 'Salvar nome'}
            </button>
          </div>

          <div style={sectionStyle}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Alterar senha</h2>

            <label style={labelStyle}>
              Nova senha
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Confirmar nova senha
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                style={inputStyle}
              />
            </label>

            {passwordMsg && (
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: passwordMsg.ok ? '#0d2a12' : '#2a0d0d',
                  fontSize: 13,
                }}
              >
                {passwordMsg.text}
              </div>
            )}

            <button
              onClick={savePassword}
              disabled={passwordLoading}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                border: '1px solid #333',
                background: '#1a1a1a',
                color: 'white',
                cursor: passwordLoading ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                alignSelf: 'flex-start',
              }}
            >
              {passwordLoading ? 'Salvando…' : 'Alterar senha'}
            </button>
          </div>
        </div>
      )}

      {/* --- Empresa --- */}
      {tab === 'empresa' && isAdmin && (
        <div style={sectionStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Dados da empresa</h2>

          <div style={{ display: 'grid', gap: 12 }}>
            <label style={labelStyle}>
              Razão social *
              <input
                value={companyForm.legal_name}
                onChange={(e) => setCompanyForm((f) => ({ ...f, legal_name: e.target.value }))}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Nome fantasia *
              <input
                value={companyForm.trade_name}
                onChange={(e) => setCompanyForm((f) => ({ ...f, trade_name: e.target.value }))}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              CNPJ
              <input
                value={companyForm.cnpj}
                onChange={(e) => setCompanyForm((f) => ({ ...f, cnpj: e.target.value }))}
                placeholder="Somente números ou com máscara"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Segmento
              <input
                value={companyForm.segment}
                onChange={(e) => setCompanyForm((f) => ({ ...f, segment: e.target.value }))}
                placeholder="Ex: Academia, Imobiliária…"
                style={inputStyle}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={labelStyle}>
                Email da empresa
                <input
                  value={companyForm.email}
                  onChange={(e) => setCompanyForm((f) => ({ ...f, email: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Telefone / WhatsApp
                <input
                  value={companyForm.phone}
                  onChange={(e) => setCompanyForm((f) => ({ ...f, phone: e.target.value }))}
                  style={inputStyle}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={labelStyle}>
                Cidade
                <input
                  value={companyForm.city}
                  onChange={(e) => setCompanyForm((f) => ({ ...f, city: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                UF
                <input
                  value={companyForm.state}
                  onChange={(e) => setCompanyForm((f) => ({ ...f, state: e.target.value }))}
                  style={inputStyle}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <label style={labelStyle}>
                CEP
                <input
                  value={companyForm.cep}
                  onChange={(e) => setCompanyForm((f) => ({ ...f, cep: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Endereço
                <input
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm((f) => ({ ...f, address: e.target.value }))}
                  style={inputStyle}
                />
              </label>
            </div>
          </div>

          {companyMsg && (
            <div
              style={{
                padding: '9px 12px',
                borderRadius: 8,
                background: companyMsg.ok ? '#0d2a12' : '#2a0d0d',
                fontSize: 13,
              }}
            >
              {companyMsg.text}
            </div>
          )}

          <button
            onClick={saveCompany}
            disabled={companyLoading}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              border: '1px solid #333',
              background: '#1a1a1a',
              color: 'white',
              cursor: companyLoading ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              alignSelf: 'flex-start',
            }}
          >
            {companyLoading ? 'Salvando…' : 'Salvar empresa'}
          </button>
        </div>
      )}

      {/* --- Usuários --- */}
      {tab === 'usuarios' && isAdminOrManager && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={sectionStyle}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Gerenciar equipe</h2>
            <p style={{ opacity: 0.7, fontSize: 13, margin: 0 }}>
              Crie novos usuários e gerencie permissões da sua equipe.
            </p>
            <Link
              href="/admin/usuarios"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                borderRadius: 10,
                border: '1px solid #333',
                background: '#1a1a1a',
                color: 'white',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 600,
                alignSelf: 'flex-start',
              }}
            >
              Ir para Gestão de Usuários →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
