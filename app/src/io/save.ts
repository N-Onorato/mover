import type { Project } from '../types/project'

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2)
}

export function downloadProject(project: Project): void {
  const json = serializeProject(project)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.name.replace(/\s+/g, '-').toLowerCase()}.mover.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function saveToLocalStorage(project: Project): void {
  try {
    localStorage.setItem('mover:autosave', serializeProject(project))
    localStorage.setItem('mover:autosave:id', project.id)
  } catch {
    // quota exceeded — silently skip
  }
}
