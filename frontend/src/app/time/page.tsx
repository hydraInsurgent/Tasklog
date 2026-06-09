// Route: /time - the time-tracking timeline dashboard (#77).
// A Server Component shell that renders the client-side TimelineView (which fetches + ticks).
import TimelineView from "@/components/TimelineView";

export default function TimePage() {
  return (
    <div className="max-w-5xl">
      <TimelineView />
    </div>
  );
}
