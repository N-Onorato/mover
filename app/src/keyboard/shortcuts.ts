/** I5 (#24): the single source of truth for Mover's keyboard shortcuts.
 *
 * Every place that binds a key (MenuBar, Toolbar, the drawing tools,
 * LayoutCanvas, the cheat sheet itself) matches it through
 * `matchesShortcut(e, id)`, every place that displays one (menu entries,
 * toolbar tooltips, ShortcutSheet) renders it from here, and `ShortcutId` is
 * derived from this table - so a label and its binding can't disagree, and a
 * reference to a shortcut that doesn't exist fails to compile.
 * shortcuts.test.ts checks the other direction: that nothing listed here is
 * left unbound.
 *
 * `gesture` entries are the exception: pointer gestures (Space-drag, Ctrl
 * held while dragging, ...) are read straight off pointer events, so they're
 * documented here for the cheat sheet and each code site carries a comment
 * pointing back to its entry. */

export type ShortcutCategory = 'File' | 'Edit' | 'Tools' | 'View' | 'Canvas' | 'Drawing' | 'Help'

/** Display order of the categories in the cheat sheet. */
export const SHORTCUT_CATEGORIES: readonly ShortcutCategory[] = [
  'File',
  'Edit',
  'Tools',
  'View',
  'Canvas',
  'Drawing',
  'Help',
]

export interface KeyCombo {
  /** Compared against KeyboardEvent.key (case-insensitively for letters), so
   * shifted characters like '?' match on any keyboard layout. */
  key: string
  /** Ctrl on Windows/Linux, ⌘ on Mac. */
  mod?: boolean
  /** Literal Ctrl on every platform. */
  ctrl?: boolean
  /** Only checked when set: undefined means "either". */
  shift?: boolean
}

export interface ShortcutDef {
  category: ShortcutCategory
  label: string
  /** 'drawing' shortcuts only act while a drawing operation is in progress,
   * so they may reuse a key a 'global' shortcut uses (Backspace). */
  scope: 'global' | 'drawing'
  /** Keys the code binds via matchesShortcut. */
  combos?: KeyCombo[]
  /** Display-only pointer gestures; each inner array is one alternative's
   * keycaps, e.g. [['Space', 'Drag'], ['Middle-drag']]. */
  gesture?: string[][]
}

export const SHORTCUTS = {
  save: { category: 'File', label: 'Save', scope: 'global', combos: [{ key: 's', mod: true }] },

  undo: {
    category: 'Edit',
    label: 'Undo',
    scope: 'global',
    combos: [{ key: 'z', mod: true, shift: false }],
  },
  redo: {
    category: 'Edit',
    label: 'Redo',
    scope: 'global',
    combos: [
      { key: 'z', mod: true, shift: true },
      { key: 'y', mod: true },
    ],
  },
  deleteSelected: {
    category: 'Edit',
    label: 'Delete selected',
    scope: 'global',
    combos: [{ key: 'Delete' }, { key: 'Backspace' }],
  },
  selectAll: {
    category: 'Edit',
    label: 'Select all',
    scope: 'global',
    combos: [{ key: 'a', mod: true }],
  },

  'tool.select': { category: 'Tools', label: 'Select tool', scope: 'global', combos: [{ key: '1' }] },
  'tool.room': { category: 'Tools', label: 'Room tool', scope: 'global', combos: [{ key: '2' }] },
  'tool.interiorWall': {
    category: 'Tools',
    label: 'Interior wall tool',
    scope: 'global',
    combos: [{ key: '3' }],
  },
  'tool.image': {
    category: 'Tools',
    label: 'Import reference image',
    scope: 'global',
    combos: [{ key: '4' }],
  },
  'tool.annotation': {
    category: 'Tools',
    label: 'Annotation tool',
    scope: 'global',
    combos: [{ key: '5' }],
  },

  zoomIn: {
    category: 'View',
    label: 'Zoom in',
    scope: 'global',
    combos: [
      { key: '=', mod: true },
      { key: '+', mod: true },
    ],
  },
  zoomOut: { category: 'View', label: 'Zoom out', scope: 'global', combos: [{ key: '-', mod: true }] },
  resetZoom: {
    category: 'View',
    label: 'Reset zoom',
    scope: 'global',
    combos: [{ key: '0', mod: true }],
  },

  'canvas.pan': {
    category: 'Canvas',
    label: 'Pan',
    scope: 'global',
    gesture: [['Space', 'Drag'], ['Middle-drag']],
  },
  'canvas.zoom': { category: 'Canvas', label: 'Zoom at cursor', scope: 'global', gesture: [['Scroll']] },
  'canvas.snapInvert': {
    category: 'Canvas',
    label: 'Flip snap-to-grid while held',
    scope: 'global',
    gesture: [['Ctrl', 'Drag']],
  },
  'canvas.marqueeAdd': {
    category: 'Canvas',
    label: 'Add to selection',
    scope: 'global',
    gesture: [['Shift', 'Drag']],
  },

  'drawing.finish': {
    category: 'Drawing',
    label: 'Finish room',
    scope: 'drawing',
    combos: [{ key: 'Enter' }],
  },
  'drawing.closeRoom': {
    category: 'Drawing',
    label: 'Close room',
    scope: 'drawing',
    gesture: [['Double-click']],
  },
  'drawing.undoPoint': {
    category: 'Drawing',
    label: 'Remove last point',
    scope: 'drawing',
    combos: [{ key: 'Backspace' }],
  },
  'drawing.cancel': {
    category: 'Drawing',
    label: 'Cancel drawing / placement',
    scope: 'drawing',
    combos: [{ key: 'Escape' }],
  },

  'help.shortcuts': {
    category: 'Help',
    label: 'Keyboard shortcuts',
    scope: 'global',
    combos: [{ key: '?' }],
  },
} satisfies Record<string, ShortcutDef>

export type ShortcutId = keyof typeof SHORTCUTS

const DEFS: Record<ShortcutId, ShortcutDef> = SHORTCUTS

export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform ?? '')

/** The subset of KeyboardEvent matching needs - keeps tests DOM-free. */
export type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

export function comboMatches(e: KeyLike, combo: KeyCombo): boolean {
  if (e.altKey) return false
  if (e.key.toLowerCase() !== combo.key.toLowerCase()) return false
  const ctrlOrMeta = e.ctrlKey || e.metaKey
  if (combo.ctrl) {
    // A literal-Ctrl combo must not also fire on ⌘.
    if (!e.ctrlKey || e.metaKey) return false
  } else if (combo.mod) {
    if (!ctrlOrMeta) return false
  } else if (ctrlOrMeta) {
    // Plain keys ('1', '?') stay clear of browser/OS chords like Ctrl+1.
    return false
  }
  if (combo.shift !== undefined && combo.shift !== e.shiftKey) return false
  return true
}

export function matchesShortcut(e: KeyLike, id: ShortcutId): boolean {
  return DEFS[id].combos?.some((c) => comboMatches(e, c)) ?? false
}

/** The first shortcut in the given scope bound to this key, if any. */
export function findShortcut(e: KeyLike, scope: ShortcutDef['scope']): ShortcutId | undefined {
  return (Object.keys(DEFS) as ShortcutId[]).find(
    (id) => DEFS[id].scope === scope && matchesShortcut(e, id),
  )
}

const KEY_NAMES: Record<string, string> = {
  Delete: 'Del',
  Backspace: 'Backspace',
  Escape: 'Esc',
  Enter: 'Enter',
}

function comboKeycaps(combo: KeyCombo, mac: boolean): string[] {
  const caps: string[] = []
  if (combo.mod) caps.push(mac ? '⌘' : 'Ctrl')
  if (combo.ctrl) caps.push('Ctrl')
  if (combo.shift) caps.push('Shift')
  caps.push(KEY_NAMES[combo.key] ?? (combo.key.length === 1 ? combo.key.toUpperCase() : combo.key))
  return caps
}

/** Each alternative's keycaps, e.g. redo -> [['Ctrl','Shift','Z'], ['Ctrl','Y']]. */
export function shortcutKeycaps(id: ShortcutId, mac = isMac): string[][] {
  const def = DEFS[id]
  return def.gesture ?? def.combos?.map((c) => comboKeycaps(c, mac)) ?? []
}

/** One-line form for menu entries and tooltips: the first alternative only,
 * which is the canonical one (a menu row has no room for "or"). */
export function formatShortcut(id: ShortcutId, mac = isMac): string {
  return shortcutKeycaps(id, mac)[0]?.join('+') ?? ''
}

export interface ShortcutGroup {
  category: ShortcutCategory
  items: { id: ShortcutId; label: string; keycaps: string[][] }[]
}

/** Every shortcut grouped by category, in SHORTCUT_CATEGORIES order. */
export function shortcutGroups(mac = isMac): ShortcutGroup[] {
  const ids = Object.keys(DEFS) as ShortcutId[]
  return SHORTCUT_CATEGORIES.map((category) => ({
    category,
    items: ids
      .filter((id) => DEFS[id].category === category)
      .map((id) => ({ id, label: DEFS[id].label, keycaps: shortcutKeycaps(id, mac) })),
  })).filter((g) => g.items.length > 0)
}

/** True while the user is typing into a field, where single-key shortcuts
 * ('?', '1', Backspace) must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}
