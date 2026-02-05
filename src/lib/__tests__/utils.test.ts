import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

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
