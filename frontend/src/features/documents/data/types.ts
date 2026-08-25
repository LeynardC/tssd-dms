// export interface RemarksEntry {
//   id: string;
//   recipient: string;
//   date: string;
//   time: string;
//   loggedAt: string; // system timestamp, never edited
// }

// export interface DocumentRecord {
//   id: string;
//   category: string;
//   dateEncoded: string; // manual, staff-entered
//   createdAt: string; // automatic, system-stamped, never edited
//   subjectText: string; // always free text
//   referenceCode?: string;
//   personEntity?: string;
//   amount?: number;
//   forwardedTo: { recipient: string; date: string; time: string } | null; // one-time, locked once set
//   remarks: RemarksEntry[]; // unlimited, repeatable
//   additionalInfo?: string;
// }

// export function currentlyAt(doc: DocumentRecord): string {
//   if (doc.remarks.length > 0) {
//     return doc.remarks[doc.remarks.length - 1].recipient;
//   }
//   if (doc.forwardedTo) {
//     return doc.forwardedTo.recipient;
//   }
//   return "Pending";
// }

// export const CATEGORIES = ["AEP", "AMP", "DO 174", "GIP", "PESO", "SPES"];
