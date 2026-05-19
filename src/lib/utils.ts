import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency?: string | null) {
  // Some aggregators omit currency on certain accounts (e.g. SimpleFIN +
  // Fidelity credit cards). Default to USD rather than letting Intl throw.
  const code = currency && currency.trim() ? currency.trim().toUpperCase() : "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(value);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  }
}

export function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}
