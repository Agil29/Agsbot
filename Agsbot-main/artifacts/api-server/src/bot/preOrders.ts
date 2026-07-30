// Pre-order module (stubs only - feature disabled)
export function loadPreOrdersFromDb(): Promise<void> { return Promise.resolve(); }
export function getPendingPreOrders(): never[] { return []; }
export function hasActivePendingPreOrder(_nomor: string, _sku: string): boolean { return false; }
export function createPreOrder(_opts: any): any { return { id: "" }; }
export function updatePreOrderStatus(_id: string, _status: string, _extra?: any): void {}
export function getAllPreOrders(): never[] { return []; }
export function getPreOrderById(_id: string): null { return null; }
export function getPreOrdersByUser(_userId: number): never[] { return []; }
