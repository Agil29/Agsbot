import { query, run } from "../lib/db";
import { logger } from "../lib/logger";

export type PackageItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  quota: string;
  validity: string;
  active: boolean;
  source: "api1" | "api2" | "dopu" | "manual" | "digiflaz";
  sku?: string;
  stock?: number;
};

export type Category = "akrab1" | "akrab2" | "circle";

const manualPackages: Record<Category, PackageItem[]> = {
  akrab1: [],
  akrab2: [],
  circle: [],
};

const apiPackages: Record<Category, PackageItem[]> = {
  akrab1: [],
  akrab2: [],
  circle: [],
};

// Price/name overrides for API packages — survive refresh cycles
const apiPackageOverrides: Record<string, Partial<Omit<PackageItem, "id" | "source">>> = {};

// ─── Load from DB on startup ───────────────────────────────────────────────

export async function loadStoreFromDb(): Promise<void> {
  try {
    // Load overrides
    const overrideRows = await query<{ package_id: string; overrides: any }>(
      "SELECT package_id, overrides FROM package_overrides"
    );
    for (const row of overrideRows) {
      apiPackageOverrides[row.package_id] = row.overrides;
    }
    logger.info({ count: overrideRows.length }, "Loaded package overrides from DB");

    // Load manual packages
    const pkgRows = await query<any>(
      "SELECT * FROM manual_packages ORDER BY id"
    );
    manualPackages.akrab1 = [];
    manualPackages.akrab2 = [];
    manualPackages.circle = [];
    for (const row of pkgRows) {
      const cat = row.category as Category;
      if (!manualPackages[cat]) continue;
      manualPackages[cat].push({
        id: row.id,
        name: row.name,
        description: row.description,
        price: Number(row.price),
        quota: row.quota,
        validity: row.validity,
        active: row.active,
        source: (row.source ?? "manual") as PackageItem["source"],
        sku: row.sku ?? undefined,
        stock: row.stock ?? undefined,
      });
    }
    logger.info(
      { akrab1: manualPackages.akrab1.length, akrab2: manualPackages.akrab2.length, circle: manualPackages.circle.length },
      "Loaded manual packages from DB"
    );
  } catch (err) {
    logger.error({ err }, "Failed to load store from DB");
  }
}

// ─── API packages ──────────────────────────────────────────────────────────

export function setApiPackages(category: Category, packages: PackageItem[]) {
  apiPackages[category] = packages.map((pkg) => {
    const override = apiPackageOverrides[pkg.id];
    return override ? { ...pkg, ...override } : pkg;
  });
}

export function getPackages(category: Category): PackageItem[] {
  const manual = manualPackages[category].filter((p) => p.active);
  const api = apiPackages[category].filter((p) => p.active);
  return [...api, ...manual];
}

export function getAllPackagesAdmin(category: Category): PackageItem[] {
  const api = apiPackages[category];
  const manual = manualPackages[category];
  return [...api, ...manual];
}

export function getAllManualPackages(): Record<Category, PackageItem[]> {
  return manualPackages;
}

// ─── Manual packages CRUD ──────────────────────────────────────────────────

export function addManualPackage(
  category: Category,
  pkg: Omit<PackageItem, "id"> & { source?: PackageItem["source"] }
): PackageItem {
  const newPkg: PackageItem = {
    ...pkg,
    id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    source: pkg.source ?? "manual",
  };
  manualPackages[category].push(newPkg);

  run(
    `INSERT INTO manual_packages (id, category, name, description, price, quota, validity, active, sku, stock, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [newPkg.id, category, newPkg.name, newPkg.description, newPkg.price, newPkg.quota,
     newPkg.validity, newPkg.active, newPkg.sku ?? null, newPkg.stock ?? null, newPkg.source]
  ).catch((err) => logger.error({ err }, "DB insert manual package failed"));

  return newPkg;
}

export function updateManualPackage(
  category: Category,
  id: string,
  updates: Partial<Omit<PackageItem, "id">>
): PackageItem | null {
  const idx = manualPackages[category].findIndex((p) => p.id === id);
  if (idx === -1) return null;
  manualPackages[category][idx] = { ...manualPackages[category][idx], ...updates };
  const pkg = manualPackages[category][idx];

  run(
    `UPDATE manual_packages SET name=$1, description=$2, price=$3, quota=$4, validity=$5,
     active=$6, sku=$7, stock=$8, source=$9 WHERE id=$10`,
    [pkg.name, pkg.description, pkg.price, pkg.quota, pkg.validity,
     pkg.active, pkg.sku ?? null, pkg.stock ?? null, pkg.source ?? "manual", id]
  ).catch((err) => logger.error({ err }, "DB update manual package failed"));

  return pkg;
}

export function updateAnyPackage(
  category: Category,
  id: string,
  updates: Partial<Omit<PackageItem, "id">>
): PackageItem | null {
  const manualIdx = manualPackages[category].findIndex((p) => p.id === id);
  if (manualIdx !== -1) {
    return updateManualPackage(category, id, updates);
  }
  const apiIdx = apiPackages[category].findIndex((p) => p.id === id);
  if (apiIdx !== -1) {
    // Persist override so it survives the next API refresh
    apiPackageOverrides[id] = { ...(apiPackageOverrides[id] ?? {}), ...updates };
    apiPackages[category][apiIdx] = { ...apiPackages[category][apiIdx], ...updates };

    run(
      `INSERT INTO package_overrides (package_id, overrides)
       VALUES ($1, $2)
       ON CONFLICT (package_id) DO UPDATE SET overrides = $2`,
      [id, JSON.stringify(apiPackageOverrides[id])]
    ).catch((err) => logger.error({ err }, "DB upsert package override failed"));

    return apiPackages[category][apiIdx];
  }
  return null;
}

export function deleteManualPackage(category: Category, id: string): boolean {
  const before = manualPackages[category].length;
  manualPackages[category] = manualPackages[category].filter((p) => p.id !== id);
  const deleted = manualPackages[category].length < before;
  if (deleted) {
    run("DELETE FROM manual_packages WHERE id=$1", [id]).catch((err) =>
      logger.error({ err }, "DB delete manual package failed")
    );
  }
  return deleted;
}

export function getManualPackageById(id: string): { category: Category; pkg: PackageItem } | null {
  for (const cat of ["akrab1", "akrab2", "circle"] as Category[]) {
    const pkg = manualPackages[cat].find((p) => p.id === id);
    if (pkg) return { category: cat, pkg };
  }
  return null;
}
