// Labels page - renders the labels management dashboard.
// LabelsClient is a Client Component that owns label state and CRUD operations.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import LabelsClient from "@/components/LabelsClient";

export default function LabelsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 focus:outline-none focus:underline transition-colors duration-150"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to tasks
      </Link>
      <LabelsClient />
    </div>
  );
}
