import type { Metadata } from "next";
import CompanionClient from "@/components/companion/CompanionClient";

// The companion tab (#87): Sage, the daily conversation surface of the v4.x
// Living Profile line. Server Component shell; everything interactive lives in
// CompanionClient (client-fetched, the JournalClient precedent).
export const metadata: Metadata = { title: "Sage - Tasklog" };

export default function CompanionPage() {
  return <CompanionClient />;
}
