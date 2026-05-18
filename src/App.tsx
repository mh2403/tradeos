import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

type JournalEntry = {
  id: string
  note: string
  created_at: string
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)
  const [sendingLink, setSendingLink] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    const bootstrap = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        setError(sessionError.message)
      }
      setSession(data.session)
      setBooting(false)
    }

    bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      return
    }

    const load = async () => {
      setLoadingEntries(true)
      const { data, error: queryError } = await supabase
        .from('journal_entries')
        .select('id, note, created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      if (queryError) {
        setError(queryError.message)
      } else {
        setEntries(data ?? [])
      }
      setLoadingEntries(false)
    }

    load()
  }, [session])

  const sendMagicLink = async (e: FormEvent) => {
    e.preventDefault()
    setSendingLink(true)
    setError('')
    setMessage('')

    const redirectTo = `${window.location.origin}${window.location.pathname}`

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })

    if (authError) {
      setError(authError.message)
    } else {
      setMessage('Magic link verstuurd. Check je inbox.')
    }

    setSendingLink(false)
  }

  const addEntry = async (e: FormEvent) => {
    e.preventDefault()
    if (!note.trim()) return

    setError('')
    const { data, error: insertError } = await supabase
      .from('journal_entries')
      .insert({ note: note.trim() })
      .select('id, note, created_at')
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    setEntries((prev) => [data, ...prev])
    setNote('')
  }

  const signOut = async () => {
    setError('')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
  }

  if (booting) {
    return (
      <main className="shell">
        <p>TradeOS opstarten...</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="shell">
        <section className="card auth-card">
          <h1>TradeOS</h1>
          <p>Login met magic link zodat jij veilig je trading data kan tracken.</p>
          <form onSubmit={sendMagicLink} className="stack">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jij@domein.com"
              required
            />
            <button type="submit" disabled={sendingLink}>
              {sendingLink ? 'Versturen...' : 'Stuur magic link'}
            </button>
          </form>
          {message && <p className="ok">{message}</p>}
          {error && <p className="err">{error}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>TradeOS</h1>
          <p>Ingelogd als {session.user.email}</p>
        </div>
        <button onClick={signOut}>Uitloggen</button>
      </header>

      <section className="grid">
        <article className="card">
          <h2>Nieuwe journal entry</h2>
          <form onSubmit={addEntry} className="stack">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              placeholder="Voorbeeld: EURUSD long, London open, A+ setup, fout: te vroeg scale-in"
            />
            <button type="submit">Opslaan</button>
          </form>
        </article>

        <article className="card">
          <h2>Laatste entries</h2>
          {loadingEntries && <p>Data laden...</p>}
          {!loadingEntries && entries.length === 0 && (
            <p>Nog geen entries. Voeg je eerste trade-journal note toe.</p>
          )}
          <ul className="entries">
            {entries.map((entry) => (
              <li key={entry.id}>
                <time>{new Date(entry.created_at).toLocaleString()}</time>
                <p>{entry.note}</p>
              </li>
            ))}
          </ul>
        </article>
      </section>

      {error && <p className="err global-err">{error}</p>}
    </main>
  )
}

export default App
