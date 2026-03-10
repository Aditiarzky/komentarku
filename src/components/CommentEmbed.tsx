import { useEffect, useMemo, useRef, useState } from 'react'
import { type FormEvent, type ReactNode } from 'react'

type CommentItem = {
  id: string
  author: string
  content: string
  created_at: string
  slug?: string
  parent_id: string | null
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

const PAGE_SIZE = 10

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function renderInline(input: string): ReactNode[] {
  const parts = input.split(/(\|\|[^|]+\|\||!?\[[^\]]*\]\([^\)]+\)|https?:\/\/\S+)/g)

  return parts
    .filter(Boolean)
    .map((part, index) => {
      if (/^\|\|[^|]+\|\|$/.test(part)) {
        return (
          <span key={index} className="rounded bg-slate-700 px-1 text-slate-200">
            {part.slice(2, -2)}
          </span>
        )
      }

      const imageMatch = part.match(/^!\[([^\]]*)\]\(([^\)]+)\)$/)
      if (imageMatch) {
        const alt = imageMatch[1] || 'gambar komentar'
        const src = imageMatch[2].trim()
        if (isValidHttpUrl(src)) {
          return (
            <img
              key={index}
              src={src}
              alt={alt}
              className="max-h-72 w-auto rounded-md border border-slate-700 my-2"
              loading="lazy"
            />
          )
        }
      }

      const linkMatch = part.match(/^\[([^\]]+)\]\(([^\)]+)\)$/)
      if (linkMatch && isValidHttpUrl(linkMatch[2].trim())) {
        return (
          <a
            key={index}
            href={linkMatch[2].trim()}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-300 underline"
          >
            {linkMatch[1]}
          </a>
        )
      }

      if (/^https?:\/\//.test(part) && isValidHttpUrl(part)) {
        return (
          <a key={index} href={part} target="_blank" rel="noreferrer" className="text-cyan-300 underline">
            {part}
          </a>
        )
      }

      return <span key={index}>{part}</span>
    })
}

function renderCommentContent(content: string) {
  return content.split('\n').map((line, idx, arr) => (
    <div key={`${line}-${idx}`}>
      {renderInline(line)}
      {idx < arr.length - 1 ? <br /> : null}
    </div>
  ))
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
  const [replyTarget, setReplyTarget] = useState<CommentItem | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({})
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
        .select('id, author, content, created_at, slug, parent_id')
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

  const { topLevelComments, repliesByParent } = useMemo(() => {
    const topLevel = comments.filter((comment) => !comment.parent_id)
    const replies = comments.reduce<Record<string, CommentItem[]>>((acc, comment) => {
      if (!comment.parent_id) return acc
      if (!acc[comment.parent_id]) acc[comment.parent_id] = []
      acc[comment.parent_id].push(comment)
      return acc
    }, {})

    return { topLevelComments: topLevel, repliesByParent: replies }
  }, [comments])

  const visibleTopLevelComments = topLevelComments.slice(0, visibleCount)
  const hasMoreTopLevel = topLevelComments.length > visibleCount

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

  function insertAtCursor(before: string, after = '') {
    const textarea = document.getElementById('comment-editor') as HTMLTextAreaElement | null
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = content.slice(start, end)
    const replacement = `${before}${selected}${after}`
    const newValue = `${content.slice(0, start)}${replacement}${content.slice(end)}`

    setContent(newValue)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.selectionStart = start + before.length
      textarea.selectionEnd = start + before.length + selected.length
    })
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
        parent_id: replyTarget?.id ?? null,
      })
      .select('id, author, content, created_at, slug, parent_id')
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
    setReplyTarget(null)
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

        {replyTarget ? (
          <div className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex justify-between items-center">
            <span>
              Membalas <strong>{replyTarget.author}</strong>
            </span>
            <button
              type="button"
              onClick={() => setReplyTarget(null)}
              className="text-slate-300 hover:text-white"
            >
              Batal balas
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => insertAtCursor('||', '||')} className="text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500" disabled={!user}>Spoiler</button>
          <button type="button" onClick={() => insertAtCursor('[teks](', ')')} className="text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500" disabled={!user}>Link</button>
          <button type="button" onClick={() => insertAtCursor('![deskripsi](', ')')} className="text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500" disabled={!user}>Image URL</button>
        </div>

        <textarea
          id="comment-editor"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 min-h-28"
          placeholder="Tulis komentar... gunakan ||spoiler|| atau ![alt](url)"
          required
          disabled={!user}
        />
        <p className="text-xs text-slate-400">Format didukung: spoiler <code>||teks||</code>, link <code>[judul](https://...)</code>, image <code>![alt](https://...)</code>.</p>
        <button
          type="submit"
          disabled={
            loading || !clientRef.current || !user
          }
          className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 disabled:bg-cyan-800"
        >
          {loading ? 'Mengirim...' : replyTarget ? 'Kirim balasan' : 'Kirim komentar'}
        </button>
      </form>

      {error ? <p className="text-sm text-red-300 mb-4">Error: {error}</p> : null}

      <div className="space-y-3">
        {comments.length === 0 ? (
          <p className="text-slate-400">Belum ada komentar.</p>
        ) : (
          visibleTopLevelComments.map((comment) => {
            const replies = repliesByParent[comment.id] ?? []
            const showReplies = !!openReplies[comment.id]

            return (
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
                <div className="text-slate-200 whitespace-pre-wrap">{renderCommentContent(comment.content)}</div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <button
                    type="button"
                    className="text-cyan-300 hover:text-cyan-200"
                    onClick={() => setReplyTarget(comment)}
                  >
                    Balas
                  </button>
                  {replies.length > 0 ? (
                    <button
                      type="button"
                      className="text-slate-300 hover:text-white"
                      onClick={() =>
                        setOpenReplies((prev) => ({ ...prev, [comment.id]: !prev[comment.id] }))
                      }
                    >
                      {showReplies ? 'Sembunyikan balasan' : `Lihat balasan (${replies.length})`}
                    </button>
                  ) : null}
                </div>

                {showReplies && replies.length > 0 ? (
                  <div className="mt-3 space-y-2 border-l border-slate-600 pl-3">
                    {replies.map((reply) => (
                      <div key={reply.id} className="rounded-md bg-slate-900/70 border border-slate-700 p-2">
                        <div className="flex justify-between gap-2 mb-1">
                          <strong className="text-sm">{reply.author}</strong>
                          <time className="text-xs text-slate-400">
                            {new Date(reply.created_at).toLocaleString()}
                          </time>
                        </div>
                        <div className="text-sm text-slate-200 whitespace-pre-wrap">{renderCommentContent(reply.content)}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            )
          })
        )}
      </div>

      {hasMoreTopLevel ? (
        <div className="mt-5">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-slate-600 hover:border-slate-400"
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
          >
            Load more
          </button>
        </div>
      ) : null}
    </section>
  )
}
