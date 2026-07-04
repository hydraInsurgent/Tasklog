// Route: /journal - the daily journaling page (#79).
// A Server Component shell; JournalClient owns all state (date, entries, check-ins).
// The wrapper paints the journal's own paper ground over the app background so the
// section carries its scoped identity edge to edge.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import JournalClient from "@/components/journal/JournalClient";

export default function JournalPage() {
  return (
    <div className="max-w-6xl space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-j-muted hover:text-j-ink focus:outline-none focus:underline transition-colors duration-150"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to tasks
      </Link>
      <JournalClient />
    </div>
  );
}
