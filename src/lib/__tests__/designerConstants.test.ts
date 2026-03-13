import { describe, it, expect } from 'vitest';
import {
  FLOW_ZONE_COLORS,
  DIFFICULTY_BADGE_COLORS,
  SAWTOOTH_EXPECTED_DISPLAY,
} from '@/lib/designerConstants';

// ============================================================================
// FLOW_ZONE_COLORS
// ============================================================================

describe('FLOW_ZONE_COLORS', () => {
  const expectedZones = ['flow', 'boredom', 'frustration'] as const;

  it('should have entries for all 3 flow zones', () => {
    for (const zone of expectedZones) {
      expect(FLOW_ZONE_COLORS[zone]).toBeDefined();
    }
  });

  it('should have exactly 3 zones', () => {
    expect(Object.keys(FLOW_ZONE_COLORS)).toHaveLength(3);
  });

  it.each(expectedZones)('zone "%s" should have bg, text, and border properties', (zone) => {
    const colors = FLOW_ZONE_COLORS[zone];
    expect(colors).toHaveProperty('bg');
    expect(colors).toHaveProperty('text');
    expect(colors).toHaveProperty('border');
  });

  it.each(expectedZones)('zone "%s" properties should be non-empty strings', (zone) => {
    const colors = FLOW_ZONE_COLORS[zone];
    expect(typeof colors.bg).toBe('string');
    expect(typeof colors.text).toBe('string');
    expect(typeof colors.border).toBe('string');
    expect(colors.bg.length).toBeGreaterThan(0);
    expect(colors.text.length).toBeGreaterThan(0);
    expect(colors.border.length).toBeGreaterThan(0);
  });

  it('should have distinct color families for each zone', () => {
    // Each zone should have a different color family
    expect(FLOW_ZONE_COLORS.flow.bg).not.toBe(FLOW_ZONE_COLORS.boredom.bg);
    expect(FLOW_ZONE_COLORS.flow.bg).not.toBe(FLOW_ZONE_COLORS.frustration.bg);
    expect(FLOW_ZONE_COLORS.boredom.bg).not.toBe(FLOW_ZONE_COLORS.frustration.bg);
  });
});

// ============================================================================
// DIFFICULTY_BADGE_COLORS
// ============================================================================

describe('DIFFICULTY_BADGE_COLORS', () => {
  const expectedTiers = ['easy', 'medium', 'hard', 'superHard'] as const;

  it('should have entries for all 4 difficulty tiers', () => {
    for (const tier of expectedTiers) {
      expect(DIFFICULTY_BADGE_COLORS[tier]).toBeDefined();
    }
  });

  it('should have exactly 4 tiers', () => {
    expect(Object.keys(DIFFICULTY_BADGE_COLORS)).toHaveLength(4);
  });

  it.each(expectedTiers)('tier "%s" should have bg and text properties', (tier) => {
    const colors = DIFFICULTY_BADGE_COLORS[tier];
    expect(colors).toHaveProperty('bg');
    expect(colors).toHaveProperty('text');
  });

  it.each(expectedTiers)('tier "%s" properties should be non-empty strings', (tier) => {
    const colors = DIFFICULTY_BADGE_COLORS[tier];
    expect(typeof colors.bg).toBe('string');
    expect(typeof colors.text).toBe('string');
    expect(colors.bg.length).toBeGreaterThan(0);
    expect(colors.text.length).toBeGreaterThan(0);
  });

  it('should have distinct background colors for each tier', () => {
    const bgs = expectedTiers.map((tier) => DIFFICULTY_BADGE_COLORS[tier].bg);
    const uniqueBgs = new Set(bgs);
    expect(uniqueBgs.size).toBe(4);
  });
});

// ============================================================================
// SAWTOOTH_EXPECTED_DISPLAY
// ============================================================================

describe('SAWTOOTH_EXPECTED_DISPLAY', () => {
  it('should have entries for all 10 positions', () => {
    for (let i = 1; i <= 10; i++) {
      expect(SAWTOOTH_EXPECTED_DISPLAY[i as keyof typeof SAWTOOTH_EXPECTED_DISPLAY]).toBeDefined();
    }
  });

  it('should have exactly 10 entries', () => {
    expect(Object.keys(SAWTOOTH_EXPECTED_DISPLAY)).toHaveLength(10);
  });

  it('should only contain valid difficulty tier strings', () => {
    const validTiers = ['easy', 'medium', 'hard', 'superHard'];
    for (let i = 1; i <= 10; i++) {
      const value = SAWTOOTH_EXPECTED_DISPLAY[i as keyof typeof SAWTOOTH_EXPECTED_DISPLAY];
      expect(validTiers).toContain(value);
    }
  });

  it('should match the expected sawtooth pattern', () => {
    expect(SAWTOOTH_EXPECTED_DISPLAY[1]).toBe('easy');
    expect(SAWTOOTH_EXPECTED_DISPLAY[2]).toBe('easy');
    expect(SAWTOOTH_EXPECTED_DISPLAY[3]).toBe('medium');
    expect(SAWTOOTH_EXPECTED_DISPLAY[4]).toBe('medium');
    expect(SAWTOOTH_EXPECTED_DISPLAY[5]).toBe('hard');
    expect(SAWTOOTH_EXPECTED_DISPLAY[6]).toBe('medium');
    expect(SAWTOOTH_EXPECTED_DISPLAY[7]).toBe('medium');
    expect(SAWTOOTH_EXPECTED_DISPLAY[8]).toBe('hard');
    expect(SAWTOOTH_EXPECTED_DISPLAY[9]).toBe('hard');
    expect(SAWTOOTH_EXPECTED_DISPLAY[10]).toBe('superHard');
  });

  it('should start with easy and end with superHard', () => {
    expect(SAWTOOTH_EXPECTED_DISPLAY[1]).toBe('easy');
    expect(SAWTOOTH_EXPECTED_DISPLAY[10]).toBe('superHard');
  });
});
