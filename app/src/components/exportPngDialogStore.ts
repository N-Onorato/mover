import { create } from 'zustand'

/** O5 (#45): open/closed state of the Export PNG dialog. Its own tiny store
 * (rather than a field on uiStore) so File > Export as PNG in menus.ts can
 * open the dialog without the dialog's state leaking into the canvas's. */
interface ExportPngDialogStore {
  open: boolean
  show: () => void
  hide: () => void
}

export const useExportPngDialogStore = create<ExportPngDialogStore>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))

export function openExportPngDialog(): void {
  useExportPngDialogStore.getState().show()
}
