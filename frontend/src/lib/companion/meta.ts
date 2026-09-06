// Companion display identity (#87). PAIRED CONTRACT with persona.md beside this
// file (the journal.ts <-> JournalMarkdown.cs precedent): persona.md tells the
// MODEL who it is; this file tells the UI. If the name changes, change BOTH -
// each file references the other in comments.

export const COMPANION_NAME = "Sage";

// Static opening line shown on a fresh daily session. Rendered by the UI, not
// generated - no LLM call fires on page load (P87 UI decision).
export const COMPANION_GREETING =
  "Hey, I'm here. How's your day going - what's on your mind?";

// Starter chips under the greeting; tapping one sends it as the first message.
export const STARTER_CHIPS = ["Plan my day", "Brain dump", "Something's bugging me"];
