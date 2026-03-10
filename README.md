# Komentarku (TanStack Start + Supabase)

Widget komentar realtime yang bisa dipakai sebagai:
- demo React component di aplikasi ini
- script embed untuk aplikasi lain (React, NestJS, Next.js, atau web biasa)

## Menjalankan project

```bash
npm install
npm run dev
```

## Setup Supabase

1. Buat project di Supabase.
2. Buka **SQL Editor** dan jalankan SQL berikut:

```sql
create extension if not exists "pgcrypto";

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  site text not null,
  slug text not null,
  author text not null,
  content text not null,
  parent_id uuid null references public.comments(id) on delete cascade,
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
with check (
  char_length(author) <= 80
  and char_length(content) <= 2000
  and (parent_id is null or parent_id <> id)
);
```

3. Ambil credential dari **Project Settings → API**:
   - `Project URL`
   - `anon public key`

4. Simpan ke `.env`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

> Simpan **service_role key** hanya di backend/server. Jangan expose ke browser.

### Migrasi jika tabel `comments` sudah terlanjur dibuat

Jalankan SQL berikut agar fitur reply aktif tanpa reset data:

```sql
alter table public.comments
add column if not exists parent_id uuid null references public.comments(id) on delete cascade;
```


## Embed ke project lain

Tambahkan container + script berikut di halaman target:

```html
<div id="komentarku-thread"></div>
<script
  type="module"
  src="https://YOUR_DOMAIN/comment-embed.js"
  data-host="my-product"
  data-slug="artikel-pertama"
  data-supabase-url="https://YOUR_PROJECT.supabase.co"
  data-supabase-anon-key="YOUR_SUPABASE_ANON_KEY"
></script>
```

Keterangan:
- `data-host`: namespace project/app kamu (contoh: `my-product`)
- `data-slug`: id halaman/thread (contoh: `artikel-pertama`)

File embed script ada di `public/comment-embed.js`.
