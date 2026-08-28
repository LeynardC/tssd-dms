import { apiFetch } from "../../auth/authService";

export interface ActivityLogEntry {
  id: number;
  actor_id: number;
  actor_name: string;
  action: string;
  subject_type: "File" | "Folder" | "Staff" | "Program" | "Unit";
  subject_id: number;
  subject_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function getActivityLog(
  subjectType: "File" | "Folder" | "Staff" | "Program" | "Unit",
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
  "file.replaced": "Replaced",
  "file.renamed": "Renamed",
  "file.moved": "Moved",
  "file.locked": "Locked",
  "file.unlocked": "Unlocked",
  "file.deleted": "Moved to Recycle Bin",
  "file.restored": "Restored",
  "file.purged": "Permanently Deleted",
  "folder.created": "Created",
  "folder.renamed": "Renamed",
  "folder.retired": "Moved to Recycle Bin",
  "folder.restored": "Restored",
  "folder.purged": "Permanently Deleted",
  "oauth_link.requested": "Requested Google Link",
  "oauth_link.approved": "Approved Google Link",
  "oauth_link.rejected": "Rejected Google Link",
  "oauth_link.unlinked": "Unlinked Google Account",
  "oauth_link.cancelled": "Cancelled Google Link Request",
  "program.created": "Created",
  "program.renamed": "Renamed",
  "program.retired": "Retired",
  "program.restored": "Reactivated",
  "program.profile_updated": "Profile Updated",
  "unit.created": "Created",
  "unit.renamed": "Renamed",
  "unit.description_updated": "Description Updated",
  "unit.retired": "Retired",
  "unit.restored": "Reactivated",
};

function formatBytes(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

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
    case "file.replaced": {
      const oldSize = meta.old_size_bytes as number | undefined;
      const newSize = meta.new_size_bytes as number | undefined;
      if (oldSize === undefined || newSize === undefined) return "";
      return `${formatBytes(oldSize)} → ${formatBytes(newSize)}`;
    }
    default:
      return "";
  }
}
