/** True when the primary input is a coarse pointer (finger/touch). Evaluated
 * once at module load — devices don't change primary pointer mid-session, and
 * a constant keeps hit-test thresholds stable for the whole interaction. */
export const isCoarsePointer =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/** Distance (screen px) within which a click on the first room point closes
 * the polygon. Shared by RoomTool (hit test) and SelectionLayer (close-circle
 * indicator) so the visual always matches the behavior. */
export const ROOM_CLOSE_THRESHOLD_PX = isCoarsePointer ? 24 : 14
