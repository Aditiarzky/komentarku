import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const script = document.currentScript
const root = document.getElementById('komentarku-thread')

if (!script || !root) {
  throw new Error('comment-embed.js butuh <div id="komentarku-thread"></div>')
}

const site = script.dataset.host
const slug = script.dataset.slug
const supabaseUrl = script.dataset.supabaseUrl
const supabaseAnonKey = script.dataset.supabaseAnonKey

if (!site || !slug || !supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing data-host, data-slug, data-supabase-url, atau data-supabase-anon-key')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
})

root.innerHTML = `
  <style>
    .kk-wrap{font-family:Inter,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;padding:16px}
    .kk-title{font-weight:700;font-size:20px;margin:0 0 10px}
    .kk-input,.kk-textarea{width:100%;box-sizing:border-box;background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:8px;padding:10px;margin-bottom:8px}
    .kk-btn{background:#06b6d4;color:white;border:none;border-radius:8px;padding:10px 14px;cursor:pointer}
    .kk-item{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px;margin-top:8px}
    .kk-meta{font-size:12px;color:#94a3b8;display:flex;justify-content:space-between;margin-bottom:6px}
    .kk-empty{color:#94a3b8}
    .kk-error{color:#fca5a5;font-size:13px;margin:8px 0}
  </style>
  <section class="kk-wrap">
    <h3 class="kk-title">Komentar</h3>
    <form id="kk-form">
      <input class="kk-input" id="kk-author" placeholder="Nama" required />
      <textarea class="kk-textarea" id="kk-content" placeholder="Tulis komentar..." required></textarea>
      <button class="kk-btn" id="kk-submit" type="submit">Kirim komentar</button>
    </form>
    <p id="kk-error" class="kk-error" style="display:none"></p>
    <div id="kk-list"></div>
  </section>
`

const form = root.querySelector('#kk-form')
const authorInput = root.querySelector('#kk-author')
const contentInput = root.querySelector('#kk-content')
const list = root.querySelector('#kk-list')
const errorEl = root.querySelector('#kk-error')

function renderComments(comments) {
  if (!comments.length) {
    list.innerHTML = '<p class="kk-empty">Belum ada komentar.</p>'
    return
  }

  list.innerHTML = comments
    .map(
      (comment) => `
      <article class="kk-item">
        <div class="kk-meta">
          <strong>${escapeHtml(comment.author)}</strong>
          <time>${new Date(comment.created_at).toLocaleString()}</time>
        </div>
        <p>${escapeHtml(comment.content).replace(/\n/g, '<br/>')}</p>
      </article>
    `,
    )
    .join('')
}

function showError(message = '') {
  if (!message) {
    errorEl.style.display = 'none'
    errorEl.textContent = ''
    return
  }

  errorEl.style.display = 'block'
  errorEl.textContent = message
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

let comments = []

async function loadInitialComments() {
  const { data, error } = await supabase
    .from('comments')
    .select('id, author, content, created_at')
    .eq('site', site)
    .eq('slug', slug)
    .order('created_at', { ascending: true })

  if (error) {
    showError(error.message)
    return
  }

  comments = data ?? []
  renderComments(comments)
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  showError()

  const author = authorInput.value.trim()
  const content = contentInput.value.trim()

  if (!author || !content) return

  const { error } = await supabase.from('comments').insert({
    site,
    slug,
    author,
    content,
  })

  if (error) {
    showError(error.message)
    return
  }

  contentInput.value = ''
})

supabase
  .channel(`comments:${site}:${slug}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'comments',
      filter: `site=eq.${site}`,
    },
    (payload) => {
      const newComment = payload.new
      if (newComment.slug !== slug) return
      if (comments.some((item) => item.id === newComment.id)) return
      comments.push(newComment)
      renderComments(comments)
    },
  )
  .subscribe()

loadInitialComments()
