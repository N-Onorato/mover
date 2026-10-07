import { describe, expect, it } from 'vitest'
import {
  SHORTCUTS,
  comboMatches,
  findShortcut,
  formatShortcut,
  matchesShortcut,
  shortcutGroups,
  shortcutKeycaps,
  type KeyLike,
  type ShortcutDef,
  type ShortcutId,
} from './shortcuts'
import { buildMenus } from '../components/menus'
import { TOOLBAR_TOOLS } from '../components/toolbarTools'
import { TOOL_LABELS, type Tool } from '../store/uiStore'

function key(k: string, mods: Partial<Omit<KeyLike, 'key'>> = {}): KeyLike {
  return { key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods }
}

const DEFS: Record<ShortcutId, ShortcutDef> = SHORTCUTS
const ALL_IDS = Object.keys(DEFS) as ShortcutId[]

describe('matchesShortcut', () => {
  it('tells undo and redo apart by Shift', () => {
    expect(matchesShortcut(key('z', { ctrlKey: true }), 'undo')).toBe(true)
    expect(matchesShortcut(key('z', { ctrlKey: true }), 'redo')).toBe(false)
    expect(matchesShortcut(key('Z', { ctrlKey: true, shiftKey: true }), 'redo')).toBe(true)
    expect(matchesShortcut(key('Z', { ctrlKey: true, shiftKey: true }), 'undo')).toBe(false)
    expect(matchesShortcut(key('y', { ctrlKey: true }), 'redo')).toBe(true)
  })

  it('accepts ⌘ for mod shortcuts', () => {
    expect(matchesShortcut(key('z', { metaKey: true }), 'undo')).toBe(true)
    expect(matchesShortcut(key('s', { metaKey: true }), 'save')).toBe(true)
  })

  it('rejects Alt and missing modifiers', () => {
    expect(matchesShortcut(key('z', { ctrlKey: true, altKey: true }), 'undo')).toBe(false)
    expect(matchesShortcut(key('z'), 'undo')).toBe(false)
  })

  it('matches ? regardless of the Shift needed to type it', () => {
    expect(matchesShortcut(key('?', { shiftKey: true }), 'help.shortcuts')).toBe(true)
    expect(matchesShortcut(key('/'), 'help.shortcuts')).toBe(false)
  })

  it('keeps plain keys clear of Ctrl/⌘ chords', () => {
    expect(matchesShortcut(key('1'), 'tool.select')).toBe(true)
    expect(matchesShortcut(key('1', { ctrlKey: true }), 'tool.select')).toBe(false)
    expect(matchesShortcut(key('1', { metaKey: true }), 'tool.select')).toBe(false)
  })

  it('binds both Delete and Backspace to delete', () => {
    expect(matchesShortcut(key('Delete'), 'deleteSelected')).toBe(true)
    expect(matchesShortcut(key('Backspace'), 'deleteSelected')).toBe(true)
  })

  it('accepts both = and + for zoom in', () => {
    expect(matchesShortcut(key('=', { ctrlKey: true }), 'zoomIn')).toBe(true)
    expect(matchesShortcut(key('+', { ctrlKey: true, shiftKey: true }), 'zoomIn')).toBe(true)
  })

  it('requires literal Ctrl, not ⌘, for ctrl combos', () => {
    expect(comboMatches(key('x', { ctrlKey: true }), { key: 'x', ctrl: true })).toBe(true)
    expect(comboMatches(key('x', { metaKey: true }), { key: 'x', ctrl: true })).toBe(false)
  })

  it('findShortcut only looks inside the given scope', () => {
    expect(findShortcut(key('Backspace'), 'global')).toBe('deleteSelected')
    expect(findShortcut(key('Backspace'), 'drawing')).toBe('drawing.undoPoint')
    expect(findShortcut(key('q'), 'global')).toBeUndefined()
  })
})

describe('formatShortcut', () => {
  it('uses ⌘ on Mac and Ctrl elsewhere', () => {
    expect(formatShortcut('save', true)).toBe('⌘+S')
    expect(formatShortcut('save', false)).toBe('Ctrl+S')
    expect(formatShortcut('redo', false)).toBe('Ctrl+Shift+Z')
  })

  it('names special keys', () => {
    expect(formatShortcut('deleteSelected', false)).toBe('Del')
    expect(formatShortcut('drawing.cancel', false)).toBe('Esc')
  })

  it('lists every alternative as keycaps', () => {
    expect(shortcutKeycaps('redo', false)).toEqual([
      ['Ctrl', 'Shift', 'Z'],
      ['Ctrl', 'Y'],
    ])
    expect(shortcutKeycaps('canvas.pan', false)).toEqual([['Space', 'Drag'], ['Middle-drag']])
  })
})

describe('registry consistency', () => {
  it('has no two shortcuts in one scope bound to the same combo', () => {
    const seen = new Map<string, ShortcutId>()
    for (const id of ALL_IDS) {
      for (const c of DEFS[id].combos ?? []) {
        const sig = [DEFS[id].scope, c.key.toLowerCase(), !!c.mod, !!c.ctrl, c.shift ?? 'any'].join('|')
        expect(seen.get(sig), `${id} collides with ${seen.get(sig)}`).toBeUndefined()
        seen.set(sig, id)
      }
    }
  })

  it('gives every entry either keys or a gesture', () => {
    for (const id of ALL_IDS) {
      expect(DEFS[id].combos?.length || DEFS[id].gesture?.length, id).toBeTruthy()
    }
  })

  it('lists every shortcut in the cheat sheet exactly once', () => {
    const listed = shortcutGroups(false).flatMap((g) => g.items.map((i) => i.id))
    expect([...listed].sort()).toEqual([...ALL_IDS].sort())
  })
})

// The drift check the issue asks for: every key the cheat sheet advertises
// for File/Edit/View/Help is actually wired to a menu entry (MenuBar
// dispatches keys from its entries), and every tool has a toolbar key.
describe('nothing in the registry is left unbound', () => {
  const menus = buildMenus({
    showGrid: true,
    snapToGrid: true,
    units: 'imperial',
    rulerMode: 'feet-inches',
    view: { x: 0, y: 0, scale: 1 },
    hasSelection: true,
    canUndo: true,
    canRedo: true,
    onOpenSettings: () => {},
    onOpenShortcuts: () => {},
  })
  const menuIds = new Set(
    menus.flatMap((m) => m.entries.flatMap((e) => (e !== 'separator' && e.shortcutId ? [e.shortcutId] : []))),
  )

  it('binds every File/Edit/View/Help shortcut through a menu entry', () => {
    const menuCategories = new Set(['File', 'Edit', 'View', 'Help'])
    for (const id of ALL_IDS) {
      if (menuCategories.has(DEFS[id].category) && DEFS[id].combos) {
        expect(menuIds.has(id), `${id} has no menu entry`).toBe(true)
      }
    }
  })

  it('omits the Help menu when no cheat sheet is available (touch)', () => {
    const touchMenus = buildMenus({
      showGrid: true,
      snapToGrid: true,
      units: 'imperial',
      rulerMode: 'feet-inches',
      view: { x: 0, y: 0, scale: 1 },
      hasSelection: false,
      canUndo: false,
      canRedo: false,
    })
    expect(touchMenus.some((m) => m.label === 'Help')).toBe(false)
  })

  it('gives every tool a toolbar key from the Tools category', () => {
    const tools = Object.keys(TOOL_LABELS) as Tool[]
    expect(TOOLBAR_TOOLS.map((t) => t.id).sort()).toEqual([...tools].sort())
    const toolShortcutIds = ALL_IDS.filter((id) => DEFS[id].category === 'Tools').sort()
    expect(TOOLBAR_TOOLS.map((t) => t.shortcutId).sort()).toEqual(toolShortcutIds)
  })
})
