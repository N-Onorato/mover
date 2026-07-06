export class ImageLoadError extends Error {}

export interface LoadedImage {
  dataUrl: string
  width: number
  height: number
}

function readImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new ImageLoadError('Failed to read image dimensions.'))
    img.src = dataUrl
  })
}

export function openImageFile(): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return reject(new ImageLoadError('No file selected.'))
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string
          const { width, height } = await readImageDimensions(dataUrl)
          resolve({ dataUrl, width, height })
        } catch (e) {
          reject(e)
        }
      }
      reader.onerror = () => reject(new ImageLoadError('Failed to read file.'))
      reader.readAsDataURL(file)
    }
    input.click()
  })
}
