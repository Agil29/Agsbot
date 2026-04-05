export type TopupStatus = "pending" | "confirming" | "done" | "expired" | "cancelled";

export type TopupOrder = {
  id: string;
  userId: number;
  userName: string;
  nominal: number;
  fee: number;
  total: number;
  status: TopupStatus;
  createdAt: Date;
  expiresAt: Date;
  messageId?: number;
  chatId?: number;
};

const topups: TopupOrder[] = [];
const EXPIRY_MINUTES = 7;

export function calculateFee(nominal: number): { fee: number; total: number } {
  let fee: number;
  if (nominal <= 105000) {
    fee = Math.ceil(nominal * 0.007 + 310);
  } else {
    fee = Math.ceil(nominal * 0.01);
  }
  return { fee, total: nominal + fee };
}

export function createTopup(data: {
  userId: number;
  userName: string;
  nominal: number;
  chatId?: number;
  messageId?: number;
}): TopupOrder {
  const { fee, total } = calculateFee(data.nominal);
  const now = new Date();
  const order: TopupOrder = {
    id: `TOPUP${Date.now()}${data.userId}`,
    userId: data.userId,
    userName: data.userName,
    nominal: data.nominal,
    fee,
    total,
    status: "pending",
    createdAt: now,
    expiresAt: new Date(now.getTime() + EXPIRY_MINUTES * 60 * 1000),
    chatId: data.chatId,
    messageId: data.messageId,
  };
  topups.push(order);
  return order;
}

export function getTopupById(id: string): TopupOrder | undefined {
  return topups.find((t) => t.id === id);
}

export function updateTopupStatus(id: string, status: TopupStatus): TopupOrder | null {
  const t = topups.find((t) => t.id === id);
  if (!t) return null;
  t.status = status;
  return t;
}

export function getPendingTopupsByUser(userId: number): TopupOrder[] {
  return topups.filter((t) => t.userId === userId && t.status === "pending");
}

export function getAllTopups(): TopupOrder[] {
  return [...topups].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
