// Shared sort for entity dropdowns: active-first, then alphabetical by name.
// Companion helper `inactiveLabel` appends " (inactive)" so the user can see
// at a glance which options are disabled in the source list.

export interface Selectable {
  id: string;
  name: string;
  isActive?: boolean;
}

export function sortActiveFirst<T extends Selectable>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aActive = a.isActive !== false;
    const bActive = b.isActive !== false;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function labelForOption(item: Selectable): string {
  return item.isActive === false ? `${item.name} (inactive)` : item.name;
}
