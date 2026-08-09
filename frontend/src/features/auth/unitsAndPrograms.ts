export interface Option {
  value: string;
  label: string;
}

export const UNITS: Option[] = [
  { value: "unit_001", label: "Unit 001" },
  { value: "unit_002", label: "Unit 002" },
  { value: "unit_003", label: "Unit 003" },
];

export const PROGRAMS_BY_UNIT: Record<string, Option[]> = {
  unit_001: [
    { value: "aep", label: "AEP" },
    { value: "amp", label: "AMP" },
    { value: "do174", label: "DO 174" },
    { value: "gip", label: "GIP" },
    { value: "peso", label: "PESO" },
    { value: "spes", label: "SPES" },
  ],
  unit_002: [
    { value: "labor_inspection", label: "Labor Inspection" },
    { value: "labor_relations", label: "Labor Relations" },
  ],
  unit_003: [
    { value: "livelihood", label: "Livelihood" },
    { value: "tupad", label: "TUPAD" },
  ],
};
