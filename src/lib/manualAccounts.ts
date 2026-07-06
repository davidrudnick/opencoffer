export const ACCOUNT_TYPES = ["depository", "credit", "investment", "loan", "other"] as const;
export const ACCOUNT_GROUPS = ["cash", "credit", "retirement", "brokerage", "hsa", "loan", "other"] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number];

export type ManualAccountInput = {
  name: string;
  type: AccountType;
  accountGroup: AccountGroup;
  balance: number;
  currency?: string | null;
};

export function normalizeManualAccountInput(input: ManualAccountInput) {
  const currency = input.currency?.trim().toUpperCase() || "USD";
  return {
    name: input.name.trim(),
    type: input.type,
    accountGroup: input.accountGroup,
    balance: String(input.balance),
    currency,
  };
}
