import { describe, it, expect } from 'vitest';
import { parseGitLog, releaseNotes } from '../scripts/release-notes';

const SEP = '\x1f';
const END = '\x1e';

describe('parseGitLog', () => {
  it('splits subject and body per commit', () => {
    const log = `feat: buttons${SEP}Adds − and + buttons.\n\nBatched.\n${END}\nfix: align${SEP}${END}\n`;
    expect(parseGitLog(log)).toEqual([
      { subject: 'feat: buttons', body: 'Adds − and + buttons.\n\nBatched.' },
      { subject: 'fix: align', body: '' },
    ]);
  });
});

describe('releaseNotes', () => {
  it('lists each commit with its body indented under it', () => {
    const notes = releaseNotes([
      { subject: 'Add − / + buttons to the dial', body: 'Each press moves 0.5°.\nSent once after 1s.' },
      { subject: 'Fix decimal alignment', body: '' },
    ]);
    expect(notes).toBe(
      "## What's changed\n\n" +
        '- **Add − / + buttons to the dial**\n  Each press moves 0.5°.\n  Sent once after 1s.\n' +
        '- **Fix decimal alignment**\n',
    );
  });

  it('drops merge commits and [skip release] commits', () => {
    const notes = releaseNotes([
      { subject: "Merge branch 'x'", body: '' },
      { subject: 'Docs tweak [skip release]', body: '' },
      { subject: 'Real change', body: '' },
    ]);
    expect(notes).toBe("## What's changed\n\n- **Real change**\n");
  });

  it('strips blank lines inside bodies', () => {
    expect(releaseNotes([{ subject: 'A', body: 'one\n\ntwo' }])).toBe("## What's changed\n\n- **A**\n  one\n  two\n");
  });

  it('no commits → maintenance note', () => {
    expect(releaseNotes([])).toBe("## What's changed\n\n- Maintenance release.\n");
  });
});
