import { createChatRoute } from '@manucompiles/doppel/server';
import path from 'node:path';

// Embedded Doppel API for the Tasklog persona.
//
// Mounted as a Next.js App Router handler so the widget and API share an origin
// (no CORS needed). The corpus is read directly from the Tasklog repo root -
// no document copy required.
//
// Corpus base path: TASKLOG_ROOT env var for production; defaults to one level
// above the Next.js CWD (frontend/ -> Tasklog root) for local dev.

const { POST } = createChatRoute({
  persona: {
    name: 'Manu',
    greeting:
      "Hey! I'm Manu's digital self. Ask me anything about Tasklog - how it works, why it was built, or how I think about software.",
    tone: 'casual, enthusiastic, and honest. Willing to admit what I do not know.',
    owner: 'Manu Dubey',
    role: 'Full-stack developer',
  },
  rag: {
    documents: ['README.md', 'docs/product-design.md', 'docs/architecture.md', 'CHANGELOG.md'],
    documentsBasePath: process.env.TASKLOG_ROOT ?? path.join(process.cwd(), '..'),
  },
});

export { POST };
