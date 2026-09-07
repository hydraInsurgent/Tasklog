import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { localIso } from "@/lib/time";
import {
  ClaudeCodeProvider,
  type CompanionTool,
  type CompanionTurnEvent,
} from "@/lib/companion/provider";

// The companion turn endpoint (#87). One POST = one conversational turn:
//
//   1. get-or-create TODAY's session (server-owned; one session per day)
//   2. append the user's message and SAVE - before any AI runs, so words are
//      never lost even when the model is unreachable (degradability rule)
//   3. stream the Sage turn as NDJSON events (text deltas, proposal cards)
//   4. on completion, save the assistant reply + the SDK session id for resume
//
// Runs on the user's own Claude subscription via the Agent SDK - PC/LAN only in
// v4.0 (P87 Decision 8); this route must not ship to the public OCI instance.
export const dynamic = "force-dynamic";

// Server-to-server base URL: the house convention (lib/api.ts getApiUrl) is the
// private API_URL for server-side code - NEXT_PUBLIC_* is the browser value and
// would loop through the public hostname in a deployed environment (review R14).
const API = process.env.API_URL ?? "http://localhost:5115";

// One chat message is a thought, not a document (review R8). The UI can show
// this limit as a friendly error; the transcript endpoint enforces its own caps.
const MAX_MESSAGE_CHARS = 4000;

// The persona spec is the single authored source of Sage's behavior (and name).
// A file, not inline code, so the same text can serve as claude.ai custom
// instructions later (behavior parity across the two AI doors).
let personaCache: string | null = null;
async function readPersona(): Promise<string> {
  if (personaCache === null) {
    personaCache = await readFile(
      path.join(process.cwd(), "src", "lib", "companion", "persona.md"),
      "utf8",
    );
  }
  return personaCache;
}

interface SessionRow {
  id: number;
  sessionDate: string;
  messages: Array<{ role: string; content: string; at: string }>;
  sdkSessionId: string | null;
}

// localIso comes from lib/time (shared with the client - review R23) so the
// storage format cannot drift between the two writers.

// Sage is a companion, not an oracle: it must know the user's "now" (this
// server IS the user's machine, so server-local time is user-local time).
// Injected per turn - found the hard way when "first thing" cost three turns
// of tonight-vs-tomorrow confusion in the first real conversation.
function nowContext(): string {
  const now = new Date();
  const day = now.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `\n\n## Right now\nIt is ${day}, ${time} (the user's local time). Ground words like today, tonight, this morning, and "first thing" in this.\n`;
}

// Time context prepended to the MODEL-facing copy of each user message (#87).
// An XML tag, NOT prose: a plain "[Sat 9:41 AM] ..." prefix blended into the
// user's words and Sage quoted it back as if the user had typed it ("Two hours
// became 'back after ~2h'"). Claude treats XML tags as structure, so machine
// context and human words stay separable. The tag is stored in the SDK
// transcript, so on resume every past message self-describes its clock time
// and any gap is derivable. The DB transcript and the UI always keep the raw
// words; only the model sees this.
function timeContextTag(prevAt: string | undefined): string {
  const now = new Date();
  const stamp = `${now.toLocaleDateString([], { weekday: "short" })} ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  let since = "";
  if (prevAt) {
    const prev = new Date(prevAt).getTime();
    const gapMin = Math.round((now.getTime() - prev) / 60000);
    // Salience attribute only for a real break; small gaps are derivable from
    // the absolute stamps anyway and noting each would be noise.
    if (!isNaN(gapMin) && gapMin >= 30) {
      const human = gapMin >= 60 ? `~${Math.round(gapMin / 60)}h` : `~${gapMin}m`;
      since = ` since_last_message="${human}"`;
    }
  }
  return `<app_time now="${stamp}"${since}/>`;
}

async function getOrCreateTodaySession(): Promise<SessionRow> {
  const res = await fetch(`${API}/api/companion/sessions`, { method: "POST" });
  if (!res.ok) throw new Error(`session create failed: ${res.status}`);
  return (await res.json()) as SessionRow;
}

// APPENDS the new turn's lines server-side (review R4): concurrent turns from
// two devices interleave instead of last-write-wins clobbering each other.
// Throws on a non-ok response (review R3) - "your words are saved" must never
// be claimed unverified.
async function appendMessages(
  id: number,
  messages: SessionRow["messages"],
  sdkSessionId?: string | null,
): Promise<void> {
  const res = await fetch(`${API}/api/companion/sessions/${id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      ...(sdkSessionId ? { sdkSessionId } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`transcript append failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

// Card outcomes, injected per turn: Sage proposes cards but is never told what
// the user did with them - found when it could not answer "is the procureflow
// task created?". This closes that loop (and stops it re-raising kept things).
async function cardContext(sessionId: number): Promise<string> {
  try {
    const res = await fetch(`${API}/api/captures?sessionId=${sessionId}`);
    if (!res.ok) return "";
    const captures = (await res.json()) as Array<{
      id: number;
      status: string;
      payload: { title?: string };
    }>;
    if (captures.length === 0) return "";
    const label = (s: string) =>
      s === "confirmed" ? "KEPT (task created)" : s === "dismissed" ? "TOSSED by the user" : "still pending";
    const lines = captures.map((c) => `- card #${c.id} "${c.payload.title}": ${label(c.status)}`);
    return `\n\n## Your proposal cards this session (live status)\n${lines.join("\n")}\nIf they say a toss was an accident, point them at the Restore button on that card - you cannot restore it yourself.\n`;
  } catch {
    return "";
  }
}

// Grounding context: the real projects/clients list, injected into the system
// prompt so Sage's projectId guesses on task cards are actual ids, not inventions.
async function projectContext(): Promise<string> {
  try {
    const res = await fetch(`${API}/api/projects`);
    if (!res.ok) return "";
    const projects = (await res.json()) as Array<{
      id: number;
      name: string;
      client?: { name: string } | null;
    }>;
    if (projects.length === 0) return "";
    const lines = projects.map(
      (p) => `- ${p.name} (projectId ${p.id}${p.client ? `, area: ${p.client.name}` : ""})`,
    );
    return `\n\n## Current projects (use these ids for projectId guesses)\n${lines.join("\n")}\n`;
  } catch {
    return "";
  }
}

// The two in-process tools Sage can call (P87 Step 3). Both are thin wrappers
// over the .NET API - the system of record stays on the backend.
function buildTools(sessionId: number): CompanionTool[] {
  const findRelevantTasks: CompanionTool<{ query: z.ZodString }> = {
    name: "find_relevant_tasks",
    description:
      "Semantic search over the user's OPEN tasks. Call this BEFORE proposing a task " +
      "to check whether it already exists (paraphrases match: 'the tax thing' finds " +
      "'File ITR'). Returns top candidates with scores - judge them yourself.",
    schema: { query: z.string().min(1).describe("Short description of the task to look for") },
    handler: async ({ query: text }) => {
      const res = await fetch(`${API}/api/search/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 6 candidates (not the API's default 8): enough for the model to judge
        // a match, small enough not to crowd the turn's context.
        body: JSON.stringify({ query: text, limit: 6 }),
      });
      if (!res.ok) return { result: { error: `search failed: ${res.status}` } };
      return { result: await res.json() };
    },
  };

  const proposeCapture: CompanionTool<{
    title: z.ZodString;
    projectId: z.ZodOptional<z.ZodNumber>;
    newProjectName: z.ZodOptional<z.ZodString>;
    deadline: z.ZodOptional<z.ZodString>;
    span: z.ZodOptional<z.ZodString>;
    confidence: z.ZodOptional<z.ZodNumber>;
  }> = {
    name: "propose_capture",
    description:
      "Propose ONE actionable task you noticed in the conversation. Shows the user a " +
      "card they can keep, edit, or toss - it does NOT create the task directly, and " +
      "you must not assume it was accepted. Use find_relevant_tasks first to avoid " +
      "proposing something that already exists.",
    schema: {
      title: z.string().min(1).describe("Crisp verb-first task title, e.g. 'File the ITR'"),
      projectId: z.number().int().positive().optional()
        .describe("Best-guess project id from the current-projects list; omit if unsure"),
      newProjectName: z.string().min(1).optional()
        .describe(
          "ONLY when the user explicitly asked for (or agreed to) a NEW project for this. " +
          "Never invent projects on your own - default to no project (Inbox).",
        ),
      deadline: z.string().optional()
        .describe("ISO date (yyyy-MM-dd) only when the user stated or clearly implied one"),
      span: z.string().optional()
        .describe("The user's exact words that triggered this proposal (short quote)"),
      confidence: z.number().min(0).max(1).optional()
        .describe("How sure you are this is a real, new actionable"),
    },
    handler: async ({ title, projectId, newProjectName, deadline, span, confidence }) => {
      const res = await fetch(`${API}/api/captures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "task",
          payload: {
            title,
            ...(projectId ? { projectId } : {}),
            ...(newProjectName ? { newProjectName } : {}),
            ...(deadline ? { deadline } : {}),
          },
          sessionId,
          span,
          confidence,
          source: "companion",
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        return { result: { proposed: false, error: err } };
      }
      const capture = (await res.json()) as { id: number; status: string };
      // Dedupe echo (the API returns the existing row for a repeat title): a
      // previously DISMISSED item must not resurface as a new card.
      if (capture.status === "dismissed") {
        return {
          result: {
            proposed: false,
            note: "The user already dismissed this exact proposal. Do not raise it again.",
          },
        };
      }
      if (capture.status === "confirmed") {
        return {
          result: { proposed: false, note: "Already confirmed earlier - it is on their list." },
        };
      }
      return {
        result: {
          proposed: true,
          captureId: capture.id,
          note: "Card shown to the user. Do not assume it was accepted.",
        },
        event: { type: "card", capture },
      };
    },
  };

  const updateCapture: CompanionTool<{
    captureId: z.ZodNumber;
    title: z.ZodString;
    projectId: z.ZodOptional<z.ZodNumber>;
    newProjectName: z.ZodOptional<z.ZodString>;
    deadline: z.ZodOptional<z.ZodString>;
  }> = {
    name: "update_capture",
    description:
      "Update ONE of your still-proposed cards when the user asks to change it " +
      "(different project, a new project, reworded title, deadline). Send the card's " +
      "FULL corrected content - it replaces what was there. Kept or tossed cards " +
      "cannot be changed. Never use this to re-open something the user tossed.",
    schema: {
      captureId: z.number().int().positive().describe("The id of the card you proposed earlier"),
      title: z.string().min(1).describe("The full task title (restate it, edited or not)"),
      projectId: z.number().int().positive().optional()
        .describe("Existing project id, when the user wants it filed there"),
      newProjectName: z.string().min(1).optional()
        .describe("When the user asked for a NEW project for this task"),
      deadline: z.string().optional().describe("ISO date (yyyy-MM-dd), when wanted"),
    },
    handler: async ({ captureId, title, projectId, newProjectName, deadline }) => {
      const res = await fetch(`${API}/api/captures/${captureId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // sessionId scopes the edit to THIS conversation (review R7): the
          // model must not be able to rewrite another day's pending cards.
          sessionId,
          payload: {
            title,
            ...(projectId ? { projectId } : {}),
            ...(newProjectName ? { newProjectName } : {}),
            ...(deadline ? { deadline } : {}),
          },
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        return { result: { updated: false, error: err } };
      }
      const capture = (await res.json()) as { id: number };
      return {
        result: {
          updated: true,
          note: "Card updated on screen. The user still decides keep or toss.",
        },
        // The client upserts by id, so the card visibly morphs in place.
        event: { type: "card", capture },
      };
    },
  };

  // Erase the per-tool arg generics at this one boundary: the provider re-narrows
  // when the SDK hands back schema-validated args (see provider.ts).
  return [findRelevantTasks, proposeCapture, updateCapture] as unknown as CompanionTool[];
}

export async function POST(request: Request): Promise<Response> {
  // Kill-switch (#88 R1): the companion runs ONLY where explicitly enabled -
  // COMPANION_ENABLED=1 in the RUNTIME env (PC .env.local; phone service env).
  // Anywhere else (the public OCI VM included) this route is an inert 404, so
  // a routine deploy can never violate the PC/LAN-only stance by accident.
  if (process.env.COMPANION_ENABLED !== "1") {
    return new Response(null, { status: 404 });
  }

  let message: string;
  try {
    const body = (await request.json()) as { message?: string };
    message = (body.message ?? "").trim();
  } catch {
    return Response.json({ message: "Body must be JSON." }, { status: 400 });
  }
  if (!message) {
    return Response.json({ message: "message is required." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return Response.json(
      { message: `A message can be at most ${MAX_MESSAGE_CHARS} characters - split the long one up.` },
      { status: 400 },
    );
  }

  // Save-first: the user's words reach the DB before the AI is even attempted.
  let session: SessionRow;
  try {
    session = await getOrCreateTodaySession();
  } catch {
    return Response.json(
      { message: "Tasklog API is unreachable - cannot save the conversation." },
      { status: 502 },
    );
  }
  const prior = Array.isArray(session.messages) ? session.messages : [];
  // Tag computed from the previous exchange's last message.
  const timeTag = timeContextTag(prior.length > 0 ? prior[prior.length - 1].at : undefined);
  try {
    await appendMessages(session.id, [{ role: "user", content: message, at: localIso() }]);
  } catch {
    // If the words cannot be persisted, the turn must not run at all - the
    // client's "NOT saved" copy depends on this being honest (review R3).
    return Response.json(
      { message: "Could not save your message - the turn was not started." },
      { status: 502 },
    );
  }

  // Neutralize any <app_time-shaped text inside the USER's words before the
  // genuine tag is prepended (review R6): pasted content must never be able to
  // masquerade as the app's own machine context.
  const safeMessage = message.replace(/<app_time/gi, "&lt;app_time");

  const [persona, projects, cards] = await Promise.all([
    readPersona(),
    projectContext(),
    cardContext(session.id),
  ]);
  const provider = new ClaudeCodeProvider();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The consumer can vanish mid-stream (tab closed, phone locked). The
      // provider loop must keep draining so the done-save still runs (review
      // R12) - enqueue failures just flip `closed` instead of aborting.
      let closed = false;
      const send = (event: CompanionTurnEvent & { sessionId?: number }) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };

      try {
        for await (const event of provider.runTurn({
          // Decorated copy for the model only; the DB stored the raw words above.
          // Tag on its own line - structurally separate from the user's words.
          message: `${timeTag}\n${safeMessage}`,
          resumeSessionId: session.sdkSessionId,
          systemPrompt: persona + projects + cards + nowContext(),
          tools: buildTools(session.id),
        })) {
          if (event.type === "done") {
            // Persist the assistant turn + resume cursor BEFORE telling the
            // client the turn is done. Empty turns save nothing (review R2) -
            // but the sdk cursor is still recorded for resume. The sessionId on
            // the event lets the client detect a midnight rollover and
            // reconcile (review R10/R22).
            try {
              await appendMessages(
                session.id,
                event.text
                  ? [{ role: "assistant", content: event.text, at: localIso() }]
                  : [],
                event.sdkSessionId,
              );
              send({ ...event, sessionId: session.id });
            } catch {
              send({
                type: "error",
                message: "Sage replied, but the reply could not be saved to the transcript.",
              });
            }
          } else if (event.type === "error") {
            // Words the user already watched stream must survive a failure
            // (review R2): persist the partial text before surfacing the error.
            if (event.partialText) {
              try {
                await appendMessages(session.id, [
                  { role: "assistant", content: event.partialText, at: localIso() },
                ]);
              } catch {
                // the error event below already tells the user things went wrong
              }
            }
            send(event);
          } else {
            send(event);
          }
        }
      } catch (err) {
        // The user's message is already saved; the UI shows a soft error.
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed/cancelled by the consumer
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
