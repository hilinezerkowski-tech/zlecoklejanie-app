# ZlecOklejanie.pl — Marketplace

## Stack
- **Next.js 14** (App Router, TypeScript)
- **Supabase** (Auth, PostgreSQL, Row Level Security, Storage)
- **Tailwind CSS**
- **Vercel** (hosting)

## Setup

1. Skopiuj `.env.local.example` do `.env.local` i uzupełnij klucze Supabase
2. `npm install`
3. Uruchom migrację SQL w Supabase Dashboard → SQL Editor → wklej `supabase/migrations/001_initial_schema.sql`
4. `npm run dev`

## Struktura

```
src/
├── app/
│   ├── (auth)/login/       # Strona logowania (magic-link + hasło)
│   ├── (dashboard)/
│   │   ├── admin/           # Panel admina
│   │   ├── studio/          # Panel studia
│   │   └── klient/          # Panel klienta
│   ├── auth/callback/       # Magic-link callback
│   └── layout.tsx           # Root layout
├── components/ui/           # Komponenty UI
├── lib/supabase/            # Supabase client (server + browser)
├── types/                   # TypeScript types
└── middleware.ts             # Auth + role routing
```

## Role
- **Klient** → magic-link → `/klient`
- **Studio** → magic-link → `/studio`
- **Admin** → email + hasło → `/admin`
