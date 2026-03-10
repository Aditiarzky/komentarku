import { useEffect, useRef, useState } from 'react'
import { type FormEvent } from 'react'

type CommentItem = {
  id: string
  author: string
  content: string
  created_at: string
  slug?: string
}

type CommentEmbedProps = {
  supabaseUrl: string
  supabaseAnonKey: string
  site: string
  slug: string
  title?: string
}

type SupabaseUser = {
  id: string
  email?: string | null
  user_metadata?: {
    full_name?: string | null
    [key: string]: any
  }
  [key: string]: any
}

export default function CommentEmbed({
  supabaseUrl,
  supabaseAnonKey,
  site,
  slug,
  title = 'Komentar',
}: CommentEmbedProps) {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [comments, setComments] = useState<CommentItem[]>([])
  const [author, setAuthor] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const clientRef = useRef<any>(null)

  useEffect(() => {
    let mounted = true
    let currentChannel: any = null
    let authSubscription: { unsubscribe: () => void } | null = null

    async function setup() {
      const sdk = await import(
        /* @vite-ignore */ 'https://esm.sh/@supabase/supabase-js@2'
      )

      const client = sdk.createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      })

      if (!mounted) return

      clientRef.current = client

      const {
        data: { session },
      } = await client.auth.getSession()

      if (mounted) {
        setUser(session?.user ?? null)
      }

      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event: string, session: any) => {
        if (!mounted) return
        setUser(session?.user ?? null)
      })

      authSubscription = subscription

      const { data, error: fetchError } = await client
        .from('comments')
        .select('id, author, content, created_at')
        .eq('site', site)
        .eq('slug', slug)
        .order('created_at', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setComments(data ?? [])
      }

      currentChannel = client
        .channel(`comments:${site}:${slug}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'comments',
            filter: `site=eq.${site}`,
          },
          (payload: { new: CommentItem }) => {
            const newComment = payload.new
            if (newComment.slug !== slug) return
            setComments((prev) => {
              if (prev.some((item) => item.id === newComment.id)) return prev
              return [...prev, newComment]
            })
          },
        )
        .subscribe()
    }

    setup().catch((setupError) => {
      setError(
        setupError instanceof Error ? setupError.message : 'Gagal memuat Supabase SDK',
      )
    })

    return () => {
      mounted = false
      if (authSubscription) {
        authSubscription.unsubscribe()
      }

      if (clientRef.current && currentChannel) {
        clientRef.current.removeChannel(currentChannel)
      }
    }
  }, [supabaseUrl, supabaseAnonKey, site, slug])

  const googleDisplayName =
    user?.user_metadata?.full_name ?? user?.email ?? user?.id ?? ''
  const displayName = googleDisplayName || 'Pengguna'

  useEffect(() => {
    if (user) {
      setAuthor(googleDisplayName)
    } else {
      setAuthor('')
    }
  }, [user, googleDisplayName])

  async function handleSignIn() {
    if (!clientRef.current) return

    setAuthError('')
    setAuthLoading(true)
    const { error: authError } = await clientRef.current.auth.signInWithOAuth({
      provider: 'google',
      options: {
        queryParams: {
          prompt: 'select_account',
        },
      },
    })
    setAuthLoading(false)

    if (authError) {
      setAuthError(authError.message)
    }
  }

  async function handleSignOut() {
    if (!clientRef.current) return

    setAuthError('')
    await clientRef.current.auth.signOut()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!user) {
      setError('Silakan masuk dengan Google sebelum mengirim komentar.')
      return
    }

    if (!author.trim() || !content.trim() || !clientRef.current) return

    setLoading(true)
    setError('')

    const { error: insertError, data: insertedData } = await clientRef.current
      .from('comments')
      .insert({
        site,
        slug,
        author: author.trim(),
        content: content.trim(),
      })
      .select('id, author, content, created_at, slug')
      .single()

    setLoading(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    if (insertedData) {
      setComments((prev) => [...prev, insertedData])
    }

    setContent('')
  }

  return (
    <section id="demo" className="bg-slate-900/70 border border-slate-700 rounded-xl p-6 text-white">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <p className="text-sm text-slate-300 mb-6">
        Thread: <code>{site}</code> / <code>{slug}</code>
      </p>

      <div className="space-y-3 mb-6">
        <div className="flex flex-col gap-2">
          {user ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-300">
                Masuk sebagai <span className="font-semibold">{displayName}</span>
              </p>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs px-3 py-1 rounded-lg border border-slate-700 hover:border-slate-500"
              >
                Keluar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              disabled={authLoading}
              className="w-full max-w-xs text-sm px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700"
            >
              {authLoading ? 'Mengarahkan ke Google...' : 'Masuk dengan Google'}
            </button>
          )}
          <p className="text-xs text-slate-400">
            {user
              ? 'Komentar akan ditandai atas nama akun Google Anda.'
              : 'Harap masuk dengan Google agar komentar tercatat atas nama Anda.'}
          </p>
          {authError ? (
            <p className="text-xs text-red-300">Login: {authError}</p>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 mb-6">
        <input
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2"
          placeholder="Nama"
          required
          disabled={!user}
          readOnly={!!user}
        />
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 min-h-24"
          placeholder="Tulis komentar..."
          required
          disabled={!user}
        />
        <button
          type="submit"
          disabled={
            loading || !clientRef.current || !user
          }
          className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 disabled:bg-cyan-800"
        >
          {loading ? 'Mengirim...' : 'Kirim komentar'}
        </button>
      </form>

      {error ? <p className="text-sm text-red-300 mb-4">Error: {error}</p> : null}

      <div className="space-y-3">
        {comments.length === 0 ? (
          <p className="text-slate-400">Belum ada komentar.</p>
        ) : (
          comments.map((comment) => (
            <article
              key={comment.id}
              className="bg-slate-800 border border-slate-700 rounded-lg p-3"
            >
              <div className="flex justify-between gap-2 mb-2">
                <strong>{comment.author}</strong>
                <time className="text-xs text-slate-400">
                  {new Date(comment.created_at).toLocaleString()}
                </time>
              </div>
              <p className="text-slate-200 whitespace-pre-wrap">{comment.content}</p>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
