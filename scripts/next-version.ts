/**
 * Computes the version for an automatic release on push to main.
 * - No release tags yet: use package.json's version.
 * - package.json's major.minor ahead of the newest tag: start that line at .0 (manual minor/major bump).
 * - Otherwise: newest tag's patch + 1.
 *
 * CLI (used by the Release workflow): node scripts/next-version.ts  → prints "version=X.Y.Z"
 */
type Semver = [number, number, number];

function parse(v: string): Semver | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compare(a: Semver, b: Semver): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function nextVersion(tags: string[], packageVersion: string): string {
  const pkg = parse(packageVersion);
  if (!pkg) throw new Error(`invalid package.json version: ${packageVersion}`);
  const released = tags
    .filter((t) => t.startsWith('v'))
    .map(parse)
    .filter((v): v is Semver => v !== null)
    .sort(compare);
  const latest = released[released.length - 1];
  if (!latest) return pkg.join('.');
  if (compare([pkg[0], pkg[1], 0], [latest[0], latest[1], 0]) > 0) return `${pkg[0]}.${pkg[1]}.0`;
  return `${latest[0]}.${latest[1]}.${latest[2] + 1}`;
}

const isCli = typeof process !== 'undefined' && process.argv[1]?.endsWith('next-version.ts');
if (isCli) {
  const { execSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const tags = execSync("git tag --list 'v*'", { encoding: 'utf8' }).split('\n').filter(Boolean);
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  console.log(`version=${nextVersion(tags, version)}`);
}
