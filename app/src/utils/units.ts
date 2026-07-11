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

export type ParseLengthResult =
  | { ok: true; value: number }
  | { ok: false; error: string }

function parseNumberOrFraction(tok: string): number {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(tok)
  if (mixed) {
    const whole = Number(mixed[1])
    const n = Number(mixed[2])
    const d = Number(mixed[3])
    return d === 0 ? NaN : whole + n / d
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(tok)
  if (fraction) {
    const n = Number(fraction[1])
    const d = Number(fraction[2])
    return d === 0 ? NaN : n / d
  }
  return Number(tok)
}

function feetInches(feet: number, inches: number): number {
  return feet * 12 + inches
}

const NUM = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+`
const FT = String.raw`(?:'|feet|ft)`
const IN = String.raw`(?:"|inches|inch|in)`

const RE_DASH = new RegExp(String.raw`^(\d+)\s*-\s*(\d+(?:\.\d+)?)$`)
const RE_FEET_INCHES = new RegExp(String.raw`^(${NUM})\s*${FT}\s*(?:(${NUM})\s*${IN}?)?$`, 'i')
const RE_INCHES_ONLY = new RegExp(String.raw`^(${NUM})\s*${IN}$`, 'i')
const RE_BARE = new RegExp(String.raw`^(${NUM})$`)

const RE_METERS = /^(\d+(?:\.\d+)?)\s*m$/i
const RE_CM = /^(\d+(?:\.\d+)?)\s*cm$/i
const RE_METRIC_BARE = /^(\d+(?:\.\d+)?)$/

/**
 * Parses a flexible length string into a number in the given unit system's
 * world unit (inches for imperial, cm for metric) - matching the contract
 * of formatLength/distance() elsewhere in this codebase.
 */
export function parseLength(
  raw: string,
  units: UnitSystem,
  options: { requireNonZero?: boolean } = {},
): ParseLengthResult {
  const requireNonZero = options.requireNonZero ?? true
  const s = raw.trim()
  if (s === '') return { ok: false, error: 'Enter a length.' }

  const finish = (value: number): ParseLengthResult => {
    if (!Number.isFinite(value)) return { ok: false, error: `"${raw}" is not a valid length.` }
    if (value < 0) return { ok: false, error: 'Length cannot be negative.' }
    if (value === 0 && requireNonZero) return { ok: false, error: 'Length must be greater than zero.' }
    return { ok: true, value }
  }

  if (units === 'metric') {
    let m = RE_METERS.exec(s)
    if (m) return finish(Number(m[1]) * 100)
    m = RE_CM.exec(s)
    if (m) return finish(Number(m[1]))
    m = RE_METRIC_BARE.exec(s)
    if (m) return finish(Number(m[1]))
    return { ok: false, error: `"${s}" is not a valid metric length (try "320", "45cm", or "6.5m").` }
  }

  let m = RE_DASH.exec(s)
  if (m) return finish(feetInches(Number(m[1]), Number(m[2])))

  m = RE_FEET_INCHES.exec(s)
  if (m) {
    const feet = parseNumberOrFraction(m[1])
    const inches = m[2] !== undefined ? parseNumberOrFraction(m[2]) : 0
    if (Number.isFinite(feet) && Number.isFinite(inches)) return finish(feetInches(feet, inches))
  }

  m = RE_INCHES_ONLY.exec(s)
  if (m) {
    const inches = parseNumberOrFraction(m[1])
    if (Number.isFinite(inches)) return finish(inches)
  }

  m = RE_BARE.exec(s)
  if (m) {
    const inches = parseNumberOrFraction(m[1])
    if (Number.isFinite(inches)) return finish(inches)
  }

  return { ok: false, error: `"${s}" is not a valid length (try 6", 7'3", or 72).` }
}
