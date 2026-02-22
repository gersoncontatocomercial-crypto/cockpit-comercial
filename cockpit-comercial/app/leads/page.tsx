import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'

import LeadsClient from './LeadsClient'

export default async function LeadsPage() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // esta page não precisa escrever cookies
        },
      },
    }
  )

  const { data: auth } = await supabase.auth.getUser()
  const user = auth?.user
  if (!user?.id) redirect('/login')

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('company_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (profErr || !profile?.company_id) redirect('/login')

  return (
    <LeadsClient
      userId={user.id}
      companyId={profile.company_id}
      role={profile.role as string}
      userLabel={(profile.full_name ?? user.email ?? user.id) as string}
    />
  )
}