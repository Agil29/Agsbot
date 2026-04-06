import { query, run } from "../lib/db";
import { logger } from "../lib/logger";
import type { MarkupType } from "./markup";

export type ProductMarkupSetting = {
  sku: string;
  category: string;
  type: MarkupType;
  amount: number;
};

// In-memory cache: sku → setting
const productMarkups = new Map<string, ProductMarkupSetting>();

export async function loadProductMarkupsFromDb(): Promise<void> {
  try {
    const rows = await query<{ sku: string; category: string; type: string; amount: string }>(
      "SELECT sku, category, type, amount FROM product_markup"
    );
    productMarkups.clear();
    for (const row of rows) {
      productMarkups.set(row.sku, {
        sku: row.sku,
        category: row.category,
        type: row.type as MarkupType,
        amount: Number(row.amount),
      });
    }
    logger.info({ count: productMarkups.size }, "Loaded product markup settings from DB");
  } catch (err) {
    logger.error({ err }, "Failed to load product markup settings");
  }
}

/** Returns per-product markup if set, otherwise null (caller falls back to category markup). */
export function getProductMarkup(sku: string): ProductMarkupSetting | null {
  return productMarkups.get(sku) ?? null;
}

export function getAllProductMarkups(): ProductMarkupSetting[] {
  return Array.from(productMarkups.values());
}

export async function setProductMarkup(
  sku: string,
  category: string,
  type: MarkupType,
  amount: number
): Promise<ProductMarkupSetting> {
  const setting: ProductMarkupSetting = { sku, category, type, amount };
  productMarkups.set(sku, setting);
  await run(
    `INSERT INTO product_markup (sku, category, type, amount, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (sku) DO UPDATE SET category=$2, type=$3, amount=$4, updated_at=now()`,
    [sku, category, type, amount]
  );
  return setting;
}

export async function deleteProductMarkup(sku: string): Promise<boolean> {
  if (!productMarkups.has(sku)) return false;
  productMarkups.delete(sku);
  await run("DELETE FROM product_markup WHERE sku=$1", [sku]);
  return true;
}
