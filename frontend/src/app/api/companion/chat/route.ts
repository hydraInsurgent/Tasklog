import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
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

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5115";

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

// Local wall-clock ISO with NO timezone suffix - the codebase convention
// (TimeEntry, CheckIns). toISOString() would store UTC and shift the day.
function localIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

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

async function saveSession(
  id: number,
  messages: SessionRow["messages"],
  sdkSessionId?: string | null,
): Promise<void> {
  await fetch(`${API}/api/companion/sessions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      ...(sdkSessionId ? { sdkSessionId } : {}),
    }),
  });
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
  const messages = Array.isArray(session.messages) ? session.messages : [];
  // Tag computed BEFORE appending, so the gap measures the previous exchange.
  const timeTag = timeContextTag(messages.length > 0 ? messages[messages.length - 1].at : undefined);
  messages.push({ role: "user", content: message, at: localIso() });
  await saveSession(session.id, messages);

  const [persona, projects, cards] = await Promise.all([
    readPersona(),
    projectContext(),
    cardContext(session.id),
  ]);
  const provider = new ClaudeCodeProvider();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: CompanionTurnEvent & { sessionId?: number }) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        for await (const event of provider.runTurn({
          // Decorated copy for the model only; the DB stored the raw words above.
          // Tag on its own line - structurally separate from the user's words.
          message: `${timeTag}\n${message}`,
          resumeSessionId: session.sdkSessionId,
          systemPrompt: persona + projects + cards + nowContext(),
          tools: buildTools(session.id),
        })) {
          if (event.type === "done") {
            // Persist the assistant turn + the resume cursor, then hand the
            // client its session id (it reloads cards keyed on it).
            messages.push({
              role: "assistant",
              content: event.text,
              at: localIso(),
            });
            await saveSession(session.id, messages, event.sdkSessionId);
            send({ ...event, sessionId: session.id });
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
        controller.close();
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
