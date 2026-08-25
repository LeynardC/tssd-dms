import { apiFetch } from "../../auth/authService";

export interface ActivityLogEntry {
  id: number;
  actor_id: number;
  actor_name: string;
  action: string;
  subject_type: "File" | "Folder" | "Staff" | "Category";
  subject_id: number;
  subject_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function getActivityLog(
  subjectType: "File" | "Folder" | "Staff" | "Category",
  subjectId: number,
): Promise<ActivityLogEntry[]> {
  const params = new URLSearchParams({
    subject_type: subjectType,
    subject_id: String(subjectId),
  });
  const result = await apiFetch<{ entries: ActivityLogEntry[] }>(
    `/api/activity-log?${params.toString()}`,
  );
  return result.entries;
}

// Human-readable label per action string, so the UI doesn't show raw
// "file.renamed" / "folder.retired" style strings to Staff/Chief.
const ACTION_LABELS: Record<string, string> = {
  "file.uploaded": "Uploaded",
  "file.renamed": "Renamed",
  "file.moved": "Moved",
  "file.locked": "Locked",
  "file.unlocked": "Unlocked",
  "file.deleted": "Deleted",
  "folder.created": "Created",
  "folder.renamed": "Renamed",
  "folder.retired": "Retired",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

// One-line description of what changed, built from metadata where useful.
// Falls back to just the label if there's nothing more specific to show.
export function actionDetail(
  entry: ActivityLogEntry,
  folderName?: (id: number) => string | undefined,
): string {
  const meta = entry.metadata ?? {};
  switch (entry.action) {
    case "file.renamed":
    case "folder.renamed":
      return `"${meta.old_name}" → "${meta.new_name}"`;
    case "file.moved": {
      const newId = meta.new_folder_id as number | null;
      if (!newId) return "Moved to root (Unfiled)";
      const name = folderName?.(newId);
      return name ? `Moved into "${name}"` : `Moved into folder #${newId}`;
    }
    default:
      return "";
  }
}
