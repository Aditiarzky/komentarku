import { createFileRoute } from '@tanstack/react-router'
import CommentEmbed from '../components/CommentEmbed'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://YOUR_PROJECT.supabase.co'
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'YOUR_SUPABASE_ANON_KEY'

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <section className="space-y-4">
          <h1 className="text-4xl font-black">Komentarku Embed (TanStack Start + Supabase)</h1>
          <p className="text-slate-300">
            Komponen komentar realtime yang bisa di-embed ke project React, NestJS,
            Next.js, atau web biasa.
          </p>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
          <h2 className="text-2xl font-bold">Cara setup Supabase</h2>
          <ol className="list-decimal pl-5 space-y-2 text-slate-300">
            <li>Buat project baru di Supabase.</li>
            <li>
              Buka <code>SQL Editor</code> lalu jalankan SQL di bawah untuk tabel dan RLS.
            </li>
            <li>
              Ambil <code>Project URL</code> dan <code>anon public key</code> dari
              <code> Project Settings &gt; API</code>.
            </li>
            <li>
              Simpan key di file <code>.env</code>:
              <pre className="bg-slate-950 border border-slate-700 rounded p-3 mt-2 overflow-x-auto text-sm">
{`VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY`}
              </pre>
            </li>
          </ol>
          <pre className="bg-slate-950 border border-slate-700 rounded p-3 overflow-x-auto text-sm">
{`create extension if not exists "pgcrypto";

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  site text not null,
  slug text not null,
  author text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

create policy "Read comments"
on public.comments
for select
using (true);

create policy "Insert comments"
on public.comments
for insert
with check (char_length(author) <= 80 and char_length(content) <= 2000);`}
          </pre>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
          <h2 className="text-2xl font-bold">Cara embed ke project lain</h2>
          <p className="text-slate-300">Tambahkan container lalu script ini:</p>
          <pre className="bg-slate-950 border border-slate-700 rounded p-3 overflow-x-auto text-sm">
{`<div id="komentarku-thread"></div>
<script
  type="module"
  src="https://YOUR_DOMAIN/comment-embed.js"
  data-host="my-product"
  data-slug="artikel-pertama"
  data-supabase-url="https://YOUR_PROJECT.supabase.co"
  data-supabase-anon-key="YOUR_SUPABASE_ANON_KEY"
></script>`}
          </pre>
          <p className="text-sm text-slate-400">
            Untuk React/NestJS cukup tempel snippet HTML tersebut di layout/view
            (NestJS SSR, EJS, Handlebars, dsb). Script bekerja framework-agnostic.
          </p>
        </section>

        <CommentEmbed
          supabaseUrl={supabaseUrl}
          supabaseAnonKey={supabaseAnonKey}
          site="komentarku-demo"
          slug="homepage"
          title="Demo live comment widget"
        />
      </div>
    </main>
  )
}
