import productsData from '@/data/products.json';
import { Product } from '@/types/contracts';

const catalog: Product[] = productsData as Product[];

/**
 * Returns the entire local bundled catalog.
 */
export function getCatalog(): Product[] {
  return catalog;
}

/**
 * Filters catalog items mapped to a given detector class name.
 */
export function byDetectorClass(className: string): Product[] {
  const norm = className.toLowerCase().trim();
  return catalog.filter((p) => p.detectorClasses.some((dc) => dc.toLowerCase() === norm));
}

/**
 * Searches catalog by query string, optionally restricted to a detector class.
 */
export function searchProducts(query: string, detectorClass?: string): Product[] {
  const q = query.toLowerCase().trim();
  let pool = catalog;

  if (detectorClass) {
    const classFiltered = byDetectorClass(detectorClass);
    if (classFiltered.length > 0) {
      pool = classFiltered;
    }
  }

  if (!q) return pool.slice(0, 20);

  return pool
    .filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      if (p.brand && p.brand.toLowerCase().includes(q)) return true;
      if (p.parentName.toLowerCase().includes(q)) return true;
      if (p.aliases.some((a) => a.toLowerCase().includes(q))) return true;
      return false;
    })
    .slice(0, 20);
}

/**
 * Finds a specific product by ID.
 */
export function getProductById(id: string): Product | undefined {
  return catalog.find((p) => p.id === id);
}
