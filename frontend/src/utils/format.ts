export function formatCurrency(value: number): string {
  return "₱" + value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
