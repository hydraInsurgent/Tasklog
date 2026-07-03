"use client";

import { Doppel } from "@manucompiles/doppel";

// Doppel - Manu's digital self for Tasklog visitors. Mounted once in the root
// layout; it renders its own fixed-position avatar in the bottom-right corner,
// so it does not affect page layout.
//
// Embedded mode: the API route lives at /api/doppel/chat inside this Next.js
// app, so the widget talks same-origin with no CORS. NEXT_PUBLIC_DOPPEL_API
// overrides the endpoint if the API is ever moved to a standalone server.
const DOPPEL_API = process.env.NEXT_PUBLIC_DOPPEL_API ?? "/api/doppel";

// Hidden until the persona is finished (#84): the avatar is still placeholder
// art, and its fixed bottom-right corner collides with the journal's Evening
// pill on mobile. Set NEXT_PUBLIC_DOPPEL_ENABLED=true to bring it back.
const DOPPEL_ENABLED = process.env.NEXT_PUBLIC_DOPPEL_ENABLED === "true";

export function DoppelWidget() {
  if (!DOPPEL_ENABLED) return null;
  return <Doppel persona="manu" theme="warm-beach" apiEndpoint={DOPPEL_API} />;
}
