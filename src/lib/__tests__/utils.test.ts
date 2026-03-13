import { describe, it, expect } from 'vitest';
import { cn, toGrayscale } from '../utils';

// ============================================================================
// cn utility (classname merger)
// ============================================================================

describe('cn utility', () => {
  describe('Basic usage', () => {
    it('should merge class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('should handle single class', () => {
      expect(cn('foo')).toBe('foo');
    });

    it('should handle empty input', () => {
      expect(cn()).toBe('');
    });
  });

  describe('Conditional classes', () => {
    it('should handle falsy values', () => {
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
      expect(cn('foo', null, 'bar')).toBe('foo bar');
      expect(cn('foo', undefined, 'bar')).toBe('foo bar');
    });

    it('should handle conditional expressions', () => {
      const isActive = true;
      expect(cn('base', isActive && 'active')).toBe('base active');

      const isDisabled = false;
      expect(cn('base', isDisabled && 'disabled')).toBe('base');
    });
  });

  describe('Tailwind class merging', () => {
    it('should merge conflicting Tailwind classes', () => {
      // Later padding should override earlier
      expect(cn('p-2', 'p-4')).toBe('p-4');
    });

    it('should merge conflicting colors', () => {
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    });

    it('should keep non-conflicting classes', () => {
      expect(cn('p-2', 'm-4')).toBe('p-2 m-4');
    });

    it('should handle responsive variants', () => {
      expect(cn('md:p-2', 'md:p-4')).toBe('md:p-4');
    });

    it('should keep different breakpoint variants', () => {
      expect(cn('sm:p-2', 'md:p-4')).toBe('sm:p-2 md:p-4');
    });
  });

  describe('Array input', () => {
    it('should handle array of classes', () => {
      expect(cn(['foo', 'bar'])).toBe('foo bar');
    });
  });

  describe('Object input', () => {
    it('should handle object with boolean values', () => {
      expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
    });
  });
});

// ============================================================================
// toGrayscale utility
// ============================================================================

describe('toGrayscale', () => {
  describe('Basic hex conversions', () => {
    it('should convert pure white to white', () => {
      expect(toGrayscale('#ffffff')).toBe('#ffffff');
    });

    it('should convert pure black to black', () => {
      expect(toGrayscale('#000000')).toBe('#000000');
    });

    it('should convert a gray value to itself', () => {
      // #808080 => R=128, G=128, B=128
      // gray = round(0.299*128 + 0.587*128 + 0.114*128) = round(128) = 128 = 0x80
      expect(toGrayscale('#808080')).toBe('#808080');
    });
  });

  describe('Color to grayscale conversions', () => {
    it('should convert pure red using luminance formula', () => {
      // #ff0000 => R=255, G=0, B=0
      // gray = round(0.299*255 + 0.587*0 + 0.114*0) = round(76.245) = 76 = 0x4c
      expect(toGrayscale('#ff0000')).toBe('#4c4c4c');
    });

    it('should convert pure green using luminance formula', () => {
      // #00ff00 => R=0, G=255, B=0
      // gray = round(0.299*0 + 0.587*255 + 0.114*0) = round(149.685) = 150 = 0x96
      expect(toGrayscale('#00ff00')).toBe('#969696');
    });

    it('should convert pure blue using luminance formula', () => {
      // #0000ff => R=0, G=0, B=255
      // gray = round(0.299*0 + 0.587*0 + 0.114*255) = round(29.07) = 29 = 0x1d
      expect(toGrayscale('#0000ff')).toBe('#1d1d1d');
    });

    it('should weight green more heavily than red or blue', () => {
      const redGray = toGrayscale('#ff0000');
      const greenGray = toGrayscale('#00ff00');
      const blueGray = toGrayscale('#0000ff');
      // Green contributes most to luminance, then red, then blue
      // So green -> brightest gray, blue -> darkest gray
      expect(greenGray > redGray).toBe(true);
      expect(redGray > blueGray).toBe(true);
    });
  });

  describe('Non-hex input passthrough', () => {
    it('should return non-hex colors unchanged', () => {
      expect(toGrayscale('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)');
    });

    it('should return named colors unchanged', () => {
      expect(toGrayscale('red')).toBe('red');
    });

    it('should return empty string unchanged', () => {
      expect(toGrayscale('')).toBe('');
    });

    it('should return transparent unchanged', () => {
      expect(toGrayscale('transparent')).toBe('transparent');
    });
  });

  describe('Output format', () => {
    it('should return a 7-character hex string for hex input', () => {
      const result = toGrayscale('#abcdef');
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('should return a grayscale hex where R=G=B', () => {
      const result = toGrayscale('#abcdef');
      const r = result.slice(1, 3);
      const g = result.slice(3, 5);
      const b = result.slice(5, 7);
      expect(r).toBe(g);
      expect(g).toBe(b);
    });

    it('should pad single-digit hex values with leading zero', () => {
      // Very dark color: #030201
      // gray = round(0.299*3 + 0.587*2 + 0.114*1) = round(2.185) = 2 = 0x02
      const result = toGrayscale('#030201');
      expect(result).toBe('#020202');
    });
  });
});
