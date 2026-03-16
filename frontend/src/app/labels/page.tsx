// Labels page - renders the labels management dashboard.
// LabelsClient is a Client Component that owns label state and CRUD operations.
import LabelsClient from "@/components/LabelsClient";

export default function LabelsPage() {
  return (
    <div className="max-w-2xl">
      <LabelsClient />
    </div>
  );
}
