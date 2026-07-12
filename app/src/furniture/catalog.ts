import type { FurnitureCategory, FurnitureDefinition, FurnitureInstance, Point } from '../types/project'

const catalog: FurnitureDefinition[] = [
  // Seating
  { id: 'sofa-2', name: 'Sofa (2-seat)', category: 'seating', width: 60, depth: 32, shape: { type: 'rect' }, tags: ['sofa', 'couch', 'seating'], builtIn: true },
  { id: 'sofa-3', name: 'Sofa (3-seat)', category: 'seating', width: 84, depth: 32, shape: { type: 'rect' }, tags: ['sofa', 'couch', 'seating'], builtIn: true },
  { id: 'armchair', name: 'Armchair', category: 'seating', width: 32, depth: 32, shape: { type: 'rect' }, tags: ['chair', 'armchair', 'seating'], builtIn: true },
  { id: 'dining-chair', name: 'Dining Chair', category: 'seating', width: 18, depth: 18, shape: { type: 'rect' }, tags: ['chair', 'dining', 'seating'], builtIn: true },
  { id: 'office-chair', name: 'Office Chair', category: 'seating', width: 24, depth: 24, shape: { type: 'rect' }, tags: ['chair', 'office', 'seating'], builtIn: true },
  // Tables
  { id: 'coffee-table', name: 'Coffee Table', category: 'tables', width: 48, depth: 24, shape: { type: 'rect' }, tags: ['table', 'coffee'], builtIn: true },
  { id: 'dining-table-4', name: 'Dining Table (4-person)', category: 'tables', width: 48, depth: 36, shape: { type: 'rect' }, tags: ['table', 'dining'], builtIn: true },
  { id: 'dining-table-6', name: 'Dining Table (6-person)', category: 'tables', width: 72, depth: 36, shape: { type: 'rect' }, tags: ['table', 'dining'], builtIn: true },
  { id: 'desk', name: 'Desk', category: 'tables', width: 60, depth: 30, shape: { type: 'rect' }, tags: ['desk', 'office', 'table'], builtIn: true },
  { id: 'nightstand', name: 'Nightstand', category: 'tables', width: 20, depth: 16, shape: { type: 'rect' }, tags: ['nightstand', 'table', 'bedroom'], builtIn: true },
  // Beds
  { id: 'bed-twin', name: 'Twin Bed', category: 'beds', width: 38, depth: 75, shape: { type: 'rect' }, tags: ['bed', 'twin'], builtIn: true },
  { id: 'bed-full', name: 'Full Bed', category: 'beds', width: 54, depth: 75, shape: { type: 'rect' }, tags: ['bed', 'full', 'double'], builtIn: true },
  { id: 'bed-queen', name: 'Queen Bed', category: 'beds', width: 60, depth: 80, shape: { type: 'rect' }, tags: ['bed', 'queen'], builtIn: true },
  { id: 'bed-king', name: 'King Bed', category: 'beds', width: 76, depth: 80, shape: { type: 'rect' }, tags: ['bed', 'king'], builtIn: true },
  // Storage
  { id: 'dresser', name: 'Dresser', category: 'storage', width: 48, depth: 18, shape: { type: 'rect' }, tags: ['dresser', 'storage', 'bedroom'], builtIn: true },
  { id: 'wardrobe', name: 'Wardrobe', category: 'storage', width: 48, depth: 24, shape: { type: 'rect' }, tags: ['wardrobe', 'closet', 'storage'], builtIn: true },
  { id: 'bookshelf', name: 'Bookshelf', category: 'storage', width: 36, depth: 12, shape: { type: 'rect' }, tags: ['bookshelf', 'bookcase', 'storage'], builtIn: true },
  { id: 'tv-stand', name: 'TV Stand', category: 'storage', width: 48, depth: 16, shape: { type: 'rect' }, tags: ['tv', 'stand', 'storage'], builtIn: true },
  // Appliances
  { id: 'refrigerator', name: 'Refrigerator', category: 'appliances', width: 30, depth: 30, shape: { type: 'rect' }, tags: ['fridge', 'refrigerator', 'kitchen'], builtIn: true },
  { id: 'stove', name: 'Stove / Range', category: 'appliances', width: 30, depth: 25, shape: { type: 'rect' }, tags: ['stove', 'range', 'kitchen'], builtIn: true },
  { id: 'dishwasher', name: 'Dishwasher', category: 'appliances', width: 24, depth: 24, shape: { type: 'rect' }, tags: ['dishwasher', 'kitchen'], builtIn: true },
  { id: 'washer', name: 'Washer', category: 'appliances', width: 27, depth: 28, shape: { type: 'rect' }, tags: ['washer', 'laundry'], builtIn: true },
  { id: 'dryer', name: 'Dryer', category: 'appliances', width: 27, depth: 28, shape: { type: 'rect' }, tags: ['dryer', 'laundry'], builtIn: true },
  // Bathroom
  { id: 'toilet', name: 'Toilet', category: 'bathroom', width: 15, depth: 28, shape: { type: 'rect' }, tags: ['toilet', 'bathroom'], builtIn: true },
  { id: 'sink-pedestal', name: 'Sink (Pedestal)', category: 'bathroom', width: 20, depth: 18, shape: { type: 'rect' }, tags: ['sink', 'bathroom'], builtIn: true },
  { id: 'bathtub', name: 'Bathtub', category: 'bathroom', width: 30, depth: 60, shape: { type: 'rect' }, tags: ['bathtub', 'bath', 'bathroom'], builtIn: true },
  { id: 'shower', name: 'Shower Stall', category: 'bathroom', width: 36, depth: 36, shape: { type: 'rect' }, tags: ['shower', 'bathroom'], builtIn: true },
]

export default catalog

export function findDefinition(id: string): FurnitureDefinition | undefined {
  return catalog.find((d) => d.id === id)
}

// Practical per-category defaults so placed items are visually
// distinguishable before the user customizes them.
export const CATEGORY_COLORS: Record<FurnitureCategory, string> = {
  seating: '#c98a5e',
  tables: '#b08968',
  storage: '#8a7461',
  beds: '#9fb4c9',
  appliances: '#a8adb3',
  bathroom: '#8fb3ae',
  office: '#7e93b0',
  lighting: '#d8c07a',
  other: '#a8a29e',
}

// Floor for furniture width/depth during resize, in world units (inches-equivalent).
export const MIN_FURNITURE_SIZE = 2

export function createFurnitureInstance(def: FurnitureDefinition, center: Point): FurnitureInstance {
  return {
    id: crypto.randomUUID(),
    definitionId: def.id,
    x: center.x - def.width / 2,
    y: center.y - def.depth / 2,
    width: def.width,
    depth: def.depth,
    rotation: 0,
    fillColor: CATEGORY_COLORS[def.category],
    label: def.name,
    locked: false,
    visible: true,
  }
}
