import { query, run } from "../lib/db";
import { logger } from "../lib/logger";

export type MarkupType = "flat" | "percentage";

export type MarkupSetting = {
  category: string;
  type: MarkupType;
  amount: number;
};

const markupSettings: Record<string, MarkupSetting> = {};

export async function loadMarkupFromDb(): Promise<void> {
  try {
    const rows = await query<{ category: string; type: string; amount: string }>(
      "SELECT category, type, amount FROM markup_settings"
    );
    for (const row of rows) {
      markupSettings[row.category] = {
        category: row.category,
        type: row.type as MarkupType,
        amount: Number(row.amount),
      };
    }
    logger.info({ count: rows.length }, "Loaded markup settings from DB");
  } catch (err) {
    logger.error({ err }, "Failed to load markup settings");
  }
}

export function getMarkup(category: string): MarkupSetting {
  return markupSettings[category] ?? { category, type: "flat", amount: 0 };
}

export function applyMarkup(basePrice: number, markup: MarkupSetting): number {
  if (markup.amount <= 0) return basePrice;
  if (markup.type === "percentage") {
    return Math.ceil(basePrice * (1 + markup.amount / 100));
  }
  return basePrice + markup.amount;
}

export async function setMarkup(category: string, type: MarkupType, amount: number): Promise<MarkupSetting> {
  const setting: MarkupSetting = { category, type, amount };
  markupSettings[category] = setting;
  await run(
    `INSERT INTO markup_settings (category, type, amount) VALUES ($1, $2, $3)
     ON CONFLICT (category) DO UPDATE SET type=$2, amount=$3`,
    [category, type, amount]
  );
  return setting;
}

export function getAllMarkup(): Record<string, MarkupSetting> {
  return { ...markupSettings };
}
