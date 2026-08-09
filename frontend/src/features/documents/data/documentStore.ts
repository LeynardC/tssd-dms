import type { DocumentRecord, RemarksEntry } from "./types";

const STORAGE_KEY = "tssd-dms-documents";

export function getAllDocuments(): DocumentRecord[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DocumentRecord[];
  } catch {
    return [];
  }
}

function saveAll(docs: DocumentRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

export function getDocumentById(id: string): DocumentRecord | null {
  return getAllDocuments().find((d) => d.id === id) ?? null;
}

export interface NewDocumentInput {
  category: string;
  dateEncoded: string;
  subjectText: string;
  referenceCode?: string;
  personEntity?: string;
  amount?: number;
  forwardedTo?: { recipient: string; date: string; time: string } | null;
  firstRemarks?: { recipient: string; date: string; time: string } | null;
  additionalInfo?: string;
}

export function createDocument(input: NewDocumentInput): DocumentRecord {
  const now = new Date().toISOString();
  const remarks: RemarksEntry[] = [];
  if (input.firstRemarks) {
    remarks.push({
      id: crypto.randomUUID(),
      recipient: input.firstRemarks.recipient,
      date: input.firstRemarks.date,
      time: input.firstRemarks.time,
      loggedAt: now,
    });
  }

  const doc: DocumentRecord = {
    id: crypto.randomUUID(),
    category: input.category,
    dateEncoded: input.dateEncoded,
    createdAt: now,
    subjectText: input.subjectText,
    referenceCode: input.referenceCode,
    personEntity: input.personEntity,
    amount: input.amount,
    forwardedTo: input.forwardedTo ?? null,
    remarks,
    additionalInfo: input.additionalInfo,
  };

  const all = getAllDocuments();
  all.push(doc);
  saveAll(all);
  return doc;
}

// Edit: Forwarded To is locked once set (only settable if currently null).
// New Remarks are appended, never replacing existing ones.
export interface EditDocumentInput {
  category?: string;
  referenceCode?: string;
  personEntity?: string;
  amount?: number;
  newForwardedTo?: { recipient: string; date: string; time: string }; // only applied if not already set
  newRemarks?: { recipient: string; date: string; time: string }[];
  additionalInfo?: string;
}

export function updateDocument(
  id: string,
  input: EditDocumentInput,
): DocumentRecord | null {
  const all = getAllDocuments();
  const idx = all.findIndex((d) => d.id === id);
  if (idx === -1) return null;

  const doc = all[idx];
  const now = new Date().toISOString();

  if (input.category !== undefined) doc.category = input.category;
  if (input.referenceCode !== undefined)
    doc.referenceCode = input.referenceCode;
  if (input.personEntity !== undefined) doc.personEntity = input.personEntity;
  if (input.amount !== undefined) doc.amount = input.amount;
  if (input.additionalInfo !== undefined)
    doc.additionalInfo = input.additionalInfo;

  // Forwarded To locks permanently after first set
  if (input.newForwardedTo && !doc.forwardedTo) {
    doc.forwardedTo = input.newForwardedTo;
  }

  // Remarks: always append, never overwrite
  if (input.newRemarks) {
    for (const r of input.newRemarks) {
      if (!r.recipient) continue;
      doc.remarks.push({
        id: crypto.randomUUID(),
        recipient: r.recipient,
        date: r.date,
        time: r.time,
        loggedAt: now,
      });
    }
  }

  all[idx] = doc;
  saveAll(all);
  return doc;
}

export function searchDocuments(query: string): DocumentRecord[] {
  const all = getAllDocuments();
  if (!query.trim()) return all;
  const q = query.toLowerCase();
  return all.filter((d) => {
    return (
      d.subjectText.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      (d.referenceCode ?? "").toLowerCase().includes(q) ||
      (d.personEntity ?? "").toLowerCase().includes(q) ||
      (d.amount?.toString() ?? "").includes(q) ||
      (d.forwardedTo?.recipient ?? "").toLowerCase().includes(q) ||
      d.remarks.some((r) => r.recipient.toLowerCase().includes(q))
    );
  });
}
