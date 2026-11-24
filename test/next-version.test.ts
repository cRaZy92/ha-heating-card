import { describe, it, expect } from 'vitest';
import { nextVersion } from '../scripts/next-version';

describe('nextVersion', () => {
  it('no tags yet → package.json version', () => {
    expect(nextVersion([], '0.1.0')).toBe('0.1.0');
  });
  it('bumps the patch of the highest tag', () => {
    expect(nextVersion(['v0.1.0', 'v0.1.2', 'v0.1.1'], '0.1.0')).toBe('0.1.3');
  });
  it('compares numerically, not as strings', () => {
    expect(nextVersion(['v0.1.9', 'v0.1.10'], '0.1.0')).toBe('0.1.11');
  });
  it('package.json minor/major ahead of tags → starts that line at .0', () => {
    expect(nextVersion(['v0.1.7'], '0.2.0')).toBe('0.2.0');
    expect(nextVersion(['v0.1.7'], '1.0.0')).toBe('1.0.0');
  });
  it('ignores tags that are not plain vX.Y.Z', () => {
    expect(nextVersion(['v0.1.4', 'v0.2.0-beta', 'latest', 'v1'], '0.1.0')).toBe('0.1.5');
  });
});
