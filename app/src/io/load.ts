import type { FurnitureLayout, Project } from '../types/project'
import { PROJECT_VERSION, SUPPORTED_PROJECT_VERSIONS } from '../types/project'
import { DEFAULT_LAYOUT_NAME, createFurnitureLayout } from '../project/layouts'
import { DEFAULT_SETTINGS } from '../store/projectStore'

export class LoadError extends Error {}

// Top-level arrays added after some projects were saved; an older file may
// lack any of them, so each defaults to empty rather than rejecting the file.
// (furnitureLayouts is handled by migrateFurnitureLayouts.)
const BACKFILLED_ARRAY_FIELDS = [
  'rooms',
  'interiorWalls',
  'customFurnitureDefs',
  'furnitureSets',
  'referenceImages',
  'annotations',
] as const

// A genuine .mover.json of any version has at least one of these as an
// array. A file with none of them isn't a slightly-older Mover project, it's
// probably not a Mover project at all - this is where we draw the
// reject/accept line rather than type-checking every field.
const MOVER_ARRAY_FIELDS = [...BACKFILLED_ARRAY_FIELDS, 'furnitureLayouts', 'furnitureInstances']

export function parseProject(json: string): Project {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new LoadError('File is not valid JSON.')
  }
  if (typeof data !== 'object' || data === null) {
    throw new LoadError('File does not contain a project object.')
  }
  const p = data as Record<string, unknown>
  if (!MOVER_ARRAY_FIELDS.some((field) => Array.isArray(p[field]))) {
    throw new LoadError("This doesn't look like a Mover project file.")
  }
  if (typeof p.version !== 'string' || !SUPPORTED_PROJECT_VERSIONS.includes(p.version)) {
    throw new LoadError(`Unsupported project version: ${p.version}`)
  }
  // Older saved projects may be missing settings fields added since (e.g.
  // rulerMode, defaultWallThickness, squareCornersToleranceDeg) or the
  // settings object entirely; fill any gap with the new-project default.
  const settings = typeof p.settings === 'object' && p.settings !== null ? p.settings : {}
  p.settings = { ...DEFAULT_SETTINGS, ...settings }
  for (const field of BACKFILLED_ARRAY_FIELDS) {
    if (!Array.isArray(p[field])) p[field] = []
  }
  migrateFurnitureLayouts(p)
  // Everything above brings the object up to the current shape, so it is now
  // a PROJECT_VERSION project regardless of what it was saved as - the next
  // save writes that version out.
  p.version = PROJECT_VERSION
  return data as Project
}

/** L1 (#28): pre-1.1 projects carry a single flat `furnitureInstances` array.
 * Wrap it in one default layout so an old `.mover.json` opens with all of its
 * furniture in place, under a layout the user can then duplicate.
 *
 * Also repairs a 1.1 project whose `activeFurnitureLayoutId` names no layout
 * (hand-edited file, or one truncated in transit): the rest of the app treats
 * a dangling id as "first layout", and normalizing it here means a save
 * writes back a consistent file rather than preserving the dangling id. */
function migrateFurnitureLayouts(p: Record<string, unknown>): void {
  if (!Array.isArray(p.furnitureLayouts) || p.furnitureLayouts.length === 0) {
    const legacy = Array.isArray(p.furnitureInstances) ? p.furnitureInstances : []
    p.furnitureLayouts = [createFurnitureLayout(DEFAULT_LAYOUT_NAME, legacy)]
  }
  // Dropped rather than kept alongside: leaving it would let an old build
  // re-open the file and silently edit an array nothing else reads.
  delete p.furnitureInstances

  const layouts = p.furnitureLayouts as FurnitureLayout[]
  if (!layouts.some((l) => l.id === p.activeFurnitureLayoutId)) {
    p.activeFurnitureLayoutId = layouts[0].id
  }
}

export function loadFromLocalStorage(): Project | null {
  try {
    const raw = localStorage.getItem('mover:autosave')
    if (!raw) return null
    return parseProject(raw)
  } catch {
    return null
  }
}

export function openProjectFile(): Promise<Project> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.mover.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return reject(new LoadError('No file selected.'))
      const reader = new FileReader()
      reader.onload = () => {
        try {
          resolve(parseProject(reader.result as string))
        } catch (e) {
          reject(e)
        }
      }
      reader.onerror = () => reject(new LoadError('Failed to read file.'))
      reader.readAsText(file)
    }
    input.click()
  })
}
