export type UnitSystem = 'imperial' | 'metric'

export function formatLength(value: number, units: UnitSystem): string {
  if (units === 'metric') {
    if (value >= 100) return `${(value / 100).toFixed(2)} m`
    return `${value.toFixed(1)} cm`
  }
  const totalInches = value
  const feet = Math.floor(totalInches / 12)
  const inches = totalInches % 12
  if (feet === 0) return `${inches.toFixed(1)}"`
  if (inches === 0) return `${feet}'`
  return `${feet}' ${inches.toFixed(1)}"`
}

export function convertToImperial(value: number): number {
  return value / 2.54
}

export function convertToMetric(value: number): number {
  return value * 2.54
}
