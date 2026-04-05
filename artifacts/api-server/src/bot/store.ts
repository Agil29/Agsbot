export type PackageItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  quota: string;
  validity: string;
  active: boolean;
  source: "api1" | "api2" | "manual";
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

export function setApiPackages(category: Category, packages: PackageItem[]) {
  apiPackages[category] = packages;
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
