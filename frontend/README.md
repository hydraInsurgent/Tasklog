# Tasklog Frontend

Next.js 16 frontend for Tasklog. Part of the v2 architecture.

For full system documentation see [docs/architecture.md](../docs/architecture.md).

---

## Run

```bash
npm install
npm run dev
```

Runs on `http://localhost:3000`.

## Environment

Copy `.env.local.example` to `.env.local`. The default value works for local dev:

```
NEXT_PUBLIC_API_URL=http://localhost:5115
```

This tells the frontend where the .NET backend is running. All API calls in
`src/lib/api.ts` use this URL as their base. The backend must be running for the app to work.

## Stack

Next.js 16 · React 19 · Tailwind CSS v4 · Lucide icons
Fonts: Space Grotesk (headings) · DM Sans (body)
