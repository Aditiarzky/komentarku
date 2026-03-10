import { FormEvent, useEffect, useRef, useState } from 'react'

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

export default function CommentEmbed({
  supabaseUrl,
  supabaseAnonKey,
  site,
  slug,
  title = 'Komentar',
}: CommentEmbedProps) {
  const [comments, setComments] = useState<CommentItem[]>([])
  const [author, setAuthor] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const clientRef = useRef<any>(null)

  useEffect(() => {
    let mounted = true
    let currentChannel: any = null

    async function setup() {
      const sdk = await import(
        /* @vite-ignore */ 'https://esm.sh/@supabase/supabase-js@2'
      )

      const client = sdk.createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      })

      if (!mounted) return

      clientRef.current = client

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
      if (clientRef.current && currentChannel) {
        clientRef.current.removeChannel(currentChannel)
      }
    }
  }, [supabaseUrl, supabaseAnonKey, site, slug])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!author.trim() || !content.trim() || !clientRef.current) return

    setLoading(true)
    setError('')

    const { error: insertError } = await clientRef.current.from('comments').insert({
      site,
      slug,
      author: author.trim(),
      content: content.trim(),
    })

    setLoading(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setContent('')
  }

  return (
    <section id="demo" className="bg-slate-900/70 border border-slate-700 rounded-xl p-6 text-white">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <p className="text-sm text-slate-300 mb-6">
        Thread: <code>{site}</code> / <code>{slug}</code>
      </p>

      <form onSubmit={handleSubmit} className="space-y-3 mb-6">
        <input
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2"
          placeholder="Nama"
          required
        />
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 min-h-24"
          placeholder="Tulis komentar..."
          required
        />
        <button
          type="submit"
          disabled={loading || !clientRef.current}
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
