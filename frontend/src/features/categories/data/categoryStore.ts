export interface CategoryRecord {
  id: string;
  name: string;
  unit: "Unit 001" | "Unit 002" | "Unit 003";
  status: "Active" | "Retired";
  createdAt: string;
}

const STORAGE_KEY = "tssd-dms-categories";

const DEFAULT_CATEGORIES: Omit<CategoryRecord, "id" | "createdAt">[] = [
  { name: "AEP", unit: "Unit 001", status: "Active" },
  { name: "AMP", unit: "Unit 001", status: "Active" },
  { name: "DO 174", unit: "Unit 001", status: "Active" },
  { name: "GIP", unit: "Unit 001", status: "Active" },
  { name: "PESO", unit: "Unit 001", status: "Active" },
  { name: "SPES", unit: "Unit 001", status: "Active" },
  { name: "Labor Inspection", unit: "Unit 002", status: "Active" },
  { name: "Labor Relations", unit: "Unit 002", status: "Active" },
  { name: "Livelihood", unit: "Unit 003", status: "Active" },
  { name: "TUPAD", unit: "Unit 003", status: "Active" },
];

function seedIfEmpty(): CategoryRecord[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as CategoryRecord[];
    } catch {
      // fall through to reseed
    }
  }
  const now = new Date().toISOString();
  const seeded = DEFAULT_CATEGORIES.map((c) => ({
    ...c,
    id: crypto.randomUUID(),
    createdAt: now,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

export function getAllCategories(): CategoryRecord[] {
  return seedIfEmpty();
}

function saveAll(categories: CategoryRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
}

export function addCategory(
  name: string,
  unit: CategoryRecord["unit"],
): CategoryRecord {
  const all = getAllCategories();
  const record: CategoryRecord = {
    id: crypto.randomUUID(),
    name: name.trim(),
    unit,
    status: "Active",
    createdAt: new Date().toISOString(),
  };
  all.push(record);
  saveAll(all);
  return record;
}

export function renameCategory(id: string, newName: string): void {
  const all = getAllCategories();
  const cat = all.find((c) => c.id === id);
  if (cat) cat.name = newName.trim();
  saveAll(all);
}

export function toggleCategoryStatus(id: string): void {
  const all = getAllCategories();
  const cat = all.find((c) => c.id === id);
  if (cat) cat.status = cat.status === "Active" ? "Retired" : "Active";
  saveAll(all);
}
