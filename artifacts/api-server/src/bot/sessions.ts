export type UserSession = {
  step:
    | "idle"
    | "select_category"
    | "select_package"
    | "enter_phone"
    | "confirm_order";
  category?: string;
  packageId?: string;
  selectedPackageName?: string;
  selectedPackagePrice?: number;
};

const sessions = new Map<number, UserSession>();

export function getSession(userId: number): UserSession {
  if (!sessions.has(userId)) {
    sessions.set(userId, { step: "idle" });
  }
  return sessions.get(userId)!;
}

export function setSession(userId: number, session: Partial<UserSession>) {
  const current = getSession(userId);
  sessions.set(userId, { ...current, ...session });
}

export function clearSession(userId: number) {
  sessions.set(userId, { step: "idle" });
}
