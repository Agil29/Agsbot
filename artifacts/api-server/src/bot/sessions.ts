export type UserSession = {
  step:
    | "idle"
    | "waiting_whatsapp"
    | "select_category"
    | "select_package"
    | "confirm_order"
    | "waiting_nomor_tujuan"
    | "select_payment"
    | "waiting_topup_amount"
    | "waiting_broadcast_message"
    | "broadcast_confirm"
    | "chat_admin"
    | "waiting_admin_reply";
  broadcastMessage?: string;
  replyTargetUserId?: number;
  category?: string;
  selectedCategory?: string;
  packageId?: string;
  selectedPackageName?: string;
  selectedPackagePrice?: number;
  selectedPackageBaseprice?: number;
  selectedPackageQuota?: string;
  selectedPackageValidity?: string;
  selectedSku?: string;
  selectedNomorTujuan?: string;
  paymentMsgId?: number;
  page?: number;
  selectedSource?: string;
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
