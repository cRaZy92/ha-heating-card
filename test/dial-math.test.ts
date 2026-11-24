import { describe, it, expect } from 'vitest';
import { valueToAngle, angleToValue, snap, hitsArc, tempColor, pointToAngle } from '../src/dial-math';

describe('valueToAngle', () => {
  it('maps range onto 135..405', () => {
    expect(valueToAngle(5, 5, 30)).toBe(135);
    expect(valueToAngle(30, 5, 30)).toBe(405);
    expect(valueToAngle(17.5, 5, 30)).toBe(270);
  });
  it('clamps out-of-range values', () => {
    expect(valueToAngle(40, 5, 30)).toBe(405);
    expect(valueToAngle(0, 5, 30)).toBe(135);
  });
});

describe('angleToValue', () => {
  it('maps angles back to snapped values', () => {
    expect(angleToValue(270, 5, 30, 0.5)).toBe(17.5);
    expect(angleToValue(135, 5, 30, 0.5)).toBe(5);
    expect(angleToValue(45, 5, 30, 0.5)).toBe(30);
    expect(angleToValue(0, 5, 30, 0.5)).toBe(26);
  });
  it('angles in the bottom gap snap to the nearer end', () => {
    expect(angleToValue(80, 5, 30, 0.5)).toBe(30);
    expect(angleToValue(100, 5, 30, 0.5)).toBe(5);
    expect(angleToValue(120, 5, 30, 0.5)).toBe(5);
  });
});

describe('snap', () => {
  it('rounds to step from min', () => {
    expect(snap(21.3, 0.5, 5)).toBe(21.5);
    expect(snap(21.2, 0.5, 5)).toBe(21);
  });
});

describe('pointToAngle', () => {
  it('returns SVG angles 0..360', () => {
    expect(pointToAngle(270, 150, 150, 150)).toBe(0);
    expect(pointToAngle(150, 270, 150, 150)).toBe(90);
    expect(pointToAngle(150, 30, 150, 150)).toBe(270);
  });
});

describe('hitsArc', () => {
  it('hits only within the ring band', () => {
    expect(hitsArc(270, 150, 150, 150, 120, 20)).toBe(true);
    expect(hitsArc(150, 150, 150, 150, 120, 20)).toBe(false);
    expect(hitsArc(295, 150, 150, 150, 120, 20)).toBe(false);
  });
  it('does not hit inside the bottom gap', () => {
    expect(hitsArc(150, 270, 150, 150, 120, 20)).toBe(false);
  });
});

describe('tempColor', () => {
  it('interpolates blue → orange → red', () => {
    expect(tempColor(5, 5, 30)).toBe('rgb(63, 127, 255)');
    expect(tempColor(17.5, 5, 30)).toBe('rgb(255, 152, 0)');
    expect(tempColor(30, 5, 30)).toBe('rgb(229, 57, 53)');
  });
});

describe('angleToValue with previous value (gap overshoot)', () => {
  it('overshooting past max into the gap stays at max', () => {
    expect(angleToValue(100, 5, 30, 0.5, 29.5)).toBe(30);
    expect(angleToValue(120, 5, 30, 0.5, 29.5)).toBe(30);
  });
  it('overshooting past min into the gap stays at min', () => {
    expect(angleToValue(80, 5, 30, 0.5, 6)).toBe(5);
  });
});
