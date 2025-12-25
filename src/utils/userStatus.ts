export type UserStatusKey = "pending" | "active" | "disabled";
export type UserStatusLabel = "In attesa" | "Attivo" | "Disattivo";

export type UserStatusResult = {
  approved: boolean;
  disabled: boolean;
  isPending: boolean;
  isActive: boolean;
  isDisabled: boolean;
  statusKey: UserStatusKey;
  statusLabel: UserStatusLabel;
};

export function normalizeBooleanFlag(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;

  let v: unknown = value;
  if (typeof v === "object" && v !== null) {
    const valueOf = (v as { valueOf?: () => unknown }).valueOf;
    if (typeof valueOf === "function") {
      const candidate = valueOf.call(v);
      if (candidate !== v) v = candidate;
    }
    if (typeof v === "object" && v !== null) {
      const obj = v as {
        booleanValue?: unknown;
        stringValue?: unknown;
        integerValue?: unknown;
        doubleValue?: unknown;
      };
      const candidate =
        obj.booleanValue ?? obj.stringValue ?? obj.integerValue ?? obj.doubleValue;
      if (candidate !== undefined) v = candidate;
    }
  }

  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const lower = v.trim().toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0" || lower === "") return false;
    return false;
  }
  if (typeof v === "boolean") return v;

  return false;
}

export function getUserStatus(user: {
  approved?: boolean | string | number | null | undefined;
  disabled?: boolean | string | number | null | undefined;
}): UserStatusResult {
  const approved = normalizeBooleanFlag(user?.approved);
  const disabled = normalizeBooleanFlag(user?.disabled);

  const isDisabled = disabled === true;
  const isActive = approved === true && disabled === false;
  const isPending = approved === false && disabled === false;

  const statusKey: UserStatusKey = isDisabled
    ? "disabled"
    : isActive
    ? "active"
    : "pending";

  const statusLabel: UserStatusLabel =
    statusKey === "disabled"
      ? "Disattivo"
      : statusKey === "active"
      ? "Attivo"
      : "In attesa";

  return {
    approved,
    disabled,
    isPending,
    isActive,
    isDisabled,
    statusKey,
    statusLabel,
  };
}
