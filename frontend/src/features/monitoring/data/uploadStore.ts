import type { PeriodEntry } from "./mockMonitoring";

const STORAGE_KEY_PREFIX = "tssd-dms-uploaded-files:";
const MAX_STORED_FILE_BYTES = 10 * 1024 * 1024; // 10MB safety cap per file

export interface PeriodWithSource {
  period: PeriodEntry;
  file: UploadedFileRecord;
}

export interface QuarterlyActual {
  quarter: string;
  beneficiaries: number;
  fund: number;
}

export interface UploadedFileRecord {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  periods: PeriodEntry[];
  warnings: string[];
  quarterly?: Record<string, QuarterlyActual[]>;
  fileBase64?: string; // original file, for re-download — omitted if too large
  fileTooLargeToStore?: boolean;
  unutilizedFunds?: {
    lgu: string;
    startingBalance: number | null;
    remainingBalance: number | null;
  }[];
  folderId?: number | null;
}

function storageKey(programId: string): string {
  return STORAGE_KEY_PREFIX + programId;
}

export function getUploadedFiles(programId: string): UploadedFileRecord[] {
  const raw = localStorage.getItem(storageKey(programId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as UploadedFileRecord[];
  } catch {
    return [];
  }
}

export function getUploadById(
  programId: string,
  id: string,
): UploadedFileRecord | null {
  return getUploadedFiles(programId).find((f) => f.id === id) ?? null;
}

export function getUploadsInFolder(
  programId: string,
  folderId: number | null,
): UploadedFileRecord[] {
  return getUploadedFiles(programId).filter(
    (f) => (f.folderId ?? null) === folderId,
  );
}

// Every upload is kept — this is now a history, not a single overwritten record.
export function saveUploadedFile(
  programId: string,
  record: {
    fileName: string;
    uploadedBy: string;
    periods: PeriodEntry[];
    warnings: string[];
    quarterly?: Record<string, QuarterlyActual[]>;
    unutilizedFunds?: {
      lgu: string;
      startingBalance: number | null;
      remainingBalance: number | null;
    }[];
    rawFileBytes?: ArrayBuffer;
    folderId?: number | null;
  },
): UploadedFileRecord {
  const existing = getUploadedFiles(programId);

  let fileBase64: string | undefined;
  let fileTooLargeToStore = false;

  if (record.rawFileBytes) {
    if (record.rawFileBytes.byteLength > MAX_STORED_FILE_BYTES) {
      fileTooLargeToStore = true;
    } else {
      const bytes = new Uint8Array(record.rawFileBytes);
      let binary = "";
      for (let i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i]);
      fileBase64 = btoa(binary);
    }
  }

  const full: UploadedFileRecord = {
    id: crypto.randomUUID(),
    uploadedAt: new Date().toISOString(),
    fileName: record.fileName,
    uploadedBy: record.uploadedBy,
    periods: record.periods,
    warnings: record.warnings,
    quarterly: record.quarterly,
    unutilizedFunds: record.unutilizedFunds,
    fileBase64,
    fileTooLargeToStore,
    folderId: record.folderId ?? null,
  };

  try {
    localStorage.setItem(
      storageKey(programId),
      JSON.stringify([...existing, full]),
    );
  } catch {
    // Quota exceeded — retry without the file bytes so the parsed data still saves.
    const withoutFile = {
      ...full,
      fileBase64: undefined,
      fileTooLargeToStore: true,
    };
    localStorage.setItem(
      storageKey(programId),
      JSON.stringify([...existing, withoutFile]),
    );
    return withoutFile;
  }
  return full;
}

export function getPeriodsWithSource(programId: string): PeriodWithSource[] {
  const files = [...getUploadedFiles(programId)].sort((a, b) =>
    a.uploadedAt.localeCompare(b.uploadedAt),
  );
  const byKey = new Map<string, PeriodWithSource>();

  for (const file of files) {
    for (const period of file.periods) {
      const periodId = period.quarter
        ? `${period.year}-${period.quarter}`
        : `${period.year}`;
      const key = `${periodId}::${period.scope}`;
      byKey.set(key, { period, file }); // later (more recent) file overwrites same key
    }
  }
  return [...byKey.values()];
}

// Most recent upload — what dashboards show "live" by default.
export function getLatestUpload(programId: string): UploadedFileRecord | null {
  const files = getUploadedFiles(programId);
  if (files.length === 0) return null;
  return files.reduce((latest, f) =>
    f.uploadedAt > latest.uploadedAt ? f : latest,
  );
}

export function getUploadedPeriods(programId: string): PeriodEntry[] {
  return getLatestUpload(programId)?.periods ?? [];
}

export function deleteUploadedFile(programId: string, id: string): void {
  const existing = getUploadedFiles(programId);
  localStorage.setItem(
    storageKey(programId),
    JSON.stringify(existing.filter((f) => f.id !== id)),
  );
}
