import type { Project } from '../types/project'

export class LoadError extends Error {}

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
  if (p.version !== '1.0') {
    throw new LoadError(`Unsupported project version: ${p.version}`)
  }
  // TODO: schema validation and migrations
  const settings = p.settings as Record<string, unknown> | undefined
  if (settings && settings.rulerMode === undefined) {
    settings.rulerMode = 'feet-inches'
  }
  return data as Project
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
