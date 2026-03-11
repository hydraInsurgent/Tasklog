// Home page - renders the interactive task list.
// TasksClient is a Client Component that handles all data fetching and mutations.
import TasksClient from "@/components/TasksClient";

export default function HomePage() {
  return <TasksClient />;
}
