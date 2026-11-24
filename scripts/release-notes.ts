/**
 * Builds the GitHub release body (shown as the changelog in HA's update dialog) from the
 * commits since the previous release tag.
 *
 * CLI (used by the Release workflow): node scripts/release-notes.ts > notes.md
 */
export interface Commit {
  subject: string;
  body: string;
}

const FIELD = '\x1f';
const RECORD = '\x1e';
export const GIT_LOG_FORMAT = `%s${FIELD}%b${RECORD}`;

export function parseGitLog(log: string): Commit[] {
  return log
    .split(RECORD)
    .map((r) => r.replace(/^\n+/, ''))
    .filter((r) => r.trim())
    .map((r) => {
      const [subject, body = ''] = r.split(FIELD);
      return { subject: subject.trim(), body: body.trim() };
    });
}

export function releaseNotes(commits: Commit[]): string {
  const relevant = commits.filter((c) => !/^Merge /.test(c.subject) && !c.subject.includes('[skip release]'));
  const lines = relevant.map((c) => {
    const body = c.body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `  ${l}\n`)
      .join('');
    return `- **${c.subject}**\n${body}`;
  });
  return `## What's changed\n\n${lines.length ? lines.join('') : '- Maintenance release.\n'}`;
}

const isCli = typeof process !== 'undefined' && process.argv[1]?.endsWith('release-notes.ts');
if (isCli) {
  const { execSync } = await import('node:child_process');
  const sh = (cmd: string) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let range = 'HEAD';
  try {
    range = `${sh("git describe --tags --abbrev=0 --match 'v*' HEAD").trim()}..HEAD`;
  } catch {
    /* no previous release: include all commits */
  }
  process.stdout.write(releaseNotes(parseGitLog(sh(`git log --no-merges --format='${GIT_LOG_FORMAT}' ${range}`))));
}
