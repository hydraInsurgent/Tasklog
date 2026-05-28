// Habits page - lists tasks tracked as daily habits, each with its streak,
// a last-7-days dot row, and a done-today toggle.
// HabitsClient is a Client Component that owns habit state and check-in actions.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import HabitsClient from "@/components/HabitsClient";

export default function HabitsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary focus:outline-none focus:underline transition-colors duration-150"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to tasks
      </Link>
      <HabitsClient />
    </div>
  );
}
