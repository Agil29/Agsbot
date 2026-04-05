export type PackageItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  quota: string;
  validity: string;
  active: boolean;
  source: "api1" | "api2" | "manual";
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

export function getAllManualPackages(): Record<Category, PackageItem[]> {
  return manualPackages;
}

export function addManualPackage(category: Category, pkg: Omit<PackageItem, "id" | "source">): PackageItem {
  const newPkg: PackageItem = {
    ...pkg,
    id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    source: "manual",
  };
  manualPackages[category].push(newPkg);
  return newPkg;
}

export function updateManualPackage(
  category: Category,
  id: string,
  updates: Partial<Omit<PackageItem, "id" | "source">>
): PackageItem | null {
  const idx = manualPackages[category].findIndex((p) => p.id === id);
  if (idx === -1) return null;
  manualPackages[category][idx] = { ...manualPackages[category][idx], ...updates };
  return manualPackages[category][idx];
}

export function updateAnyPackage(
  category: Category,
  id: string,
  updates: Partial<Omit<PackageItem, "id" | "source">>
): PackageItem | null {
  const manualIdx = manualPackages[category].findIndex((p) => p.id === id);
  if (manualIdx !== -1) {
    manualPackages[category][manualIdx] = { ...manualPackages[category][manualIdx], ...updates };
    return manualPackages[category][manualIdx];
  }
  const apiIdx = apiPackages[category].findIndex((p) => p.id === id);
  if (apiIdx !== -1) {
    // Persist override so it survives the next API refresh
    apiPackageOverrides[id] = { ...(apiPackageOverrides[id] ?? {}), ...updates };
    apiPackages[category][apiIdx] = { ...apiPackages[category][apiIdx], ...updates };
    return apiPackages[category][apiIdx];
  }
  return null;
}

export function deleteManualPackage(category: Category, id: string): boolean {
  const before = manualPackages[category].length;
  manualPackages[category] = manualPackages[category].filter((p) => p.id !== id);
  return manualPackages[category].length < before;
}

export function getManualPackageById(id: string): { category: Category; pkg: PackageItem } | null {
  for (const cat of ["akrab1", "akrab2", "circle"] as Category[]) {
    const pkg = manualPackages[cat].find((p) => p.id === id);
    if (pkg) return { category: cat, pkg };
  }
  return null;
}
