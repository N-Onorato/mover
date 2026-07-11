import { describe, expect, it } from 'vitest'
import { parseLength } from './units'

describe('parseLength', () => {
  describe('imperial', () => {
    it.each([
      ['6"', 6],
      ['6 in', 6],
      ['6 inches', 6],
      ["6'", 72],
      ['6 ft', 72],
      ['6 feet', 72],
      [`7'3"`, 87],
      [`7' 3"`, 87],
      ['7ft 3in', 87],
      ['7-3', 87],
      [`7' 3.5"`, 87.5],
      ['6 1/2"', 6.5],
      ['72', 72],
      ['6IN', 6],
      [`6' 3"`, 75],
    ])('parses %s as %d inches', (input, expected) => {
      const result = parseLength(input, 'imperial')
      expect(result).toEqual({ ok: true, value: expected })
    })
  })

  describe('metric', () => {
    it.each([
      ['320', 320],
      ['45cm', 45],
      ['45 cm', 45],
      ['6.5m', 650],
      ['6.5 m', 650],
    ])('parses %s as %d cm', (input, expected) => {
      const result = parseLength(input, 'metric')
      expect(result).toEqual({ ok: true, value: expected })
    })
  })

  describe('malformed input', () => {
    it.each([
      [''],
      ['abc'],
      ['-6"'],
      ['0'],
      [`7''`],
      ['6 zz'],
    ])('rejects %s', (input) => {
      const result = parseLength(input, 'imperial')
      expect(result.ok).toBe(false)
    })
  })

  it('allows zero when requireNonZero is false', () => {
    const result = parseLength('0', 'imperial', { requireNonZero: false })
    expect(result).toEqual({ ok: true, value: 0 })
  })
})
