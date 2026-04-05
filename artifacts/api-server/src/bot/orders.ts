export type OrderStatus = "pending" | "paid" | "processing" | "done" | "cancelled";

export type Order = {
  id: string;
  userId: number;
  userName: string;
  category: string;
  packageId: string;
  packageName: string;
  price: number;
  quota: string;
  validity: string;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
};

const orders: Order[] = [];

export function createOrder(data: Omit<Order, "id" | "status" | "createdAt" | "updatedAt">): Order {
  const order: Order = {
    ...data,
    id: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  orders.push(order);
  return order;
}

export function getOrdersByUser(userId: number): Order[] {
  return orders
    .filter((o) => o.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function getAllOrders(): Order[] {
  return [...orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function updateOrderStatus(orderId: string, status: OrderStatus): Order | null {
  const order = orders.find((o) => o.id === orderId);
  if (!order) return null;
  order.status = status;
  order.updatedAt = new Date();
  return order;
}

export function getOrderById(orderId: string): Order | undefined {
  return orders.find((o) => o.id === orderId);
}

export function formatOrderDate(date: Date): string {
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const statusLabel: Record<OrderStatus, string> = {
  pending: "⏳ Menunggu Pembayaran",
  paid: "✅ Pembayaran Diterima",
  processing: "⚙️ Sedang Diproses",
  done: "🎉 Selesai",
  cancelled: "❌ Dibatalkan",
};
