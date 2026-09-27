import { describe, expect, it } from '@jest/globals';

import {
  ALIGNMENT_REPLAY_STAMP,
  canReplayAlignment,
  OLDEST_REPLAYABLE_REVISION,
  REPLAY_REVISION,
  REPLAYABLE_FROM_REVISION,
} from '../alignmentReplay.ts';
import type { AlignmentReplayStamp } from '../alignmentReplay.ts';

describe('this build', () => {
  it('replays its own alignments', () => {
    expect(canReplayAlignment(ALIGNMENT_REPLAY_STAMP)).toBe(true);
  });

  it('stamps what it reads', () => {
    expect(ALIGNMENT_REPLAY_STAMP).toEqual({
      revision: REPLAY_REVISION,
      replayableFrom: REPLAYABLE_FROM_REVISION,
    });
  });

  it('keeps its revisions in order', () => {
    expect(OLDEST_REPLAYABLE_REVISION).toBeLessThanOrEqual(REPLAY_REVISION);
    expect(REPLAYABLE_FROM_REVISION).toBeLessThanOrEqual(REPLAY_REVISION);
  });
});

describe('alignments stored before there were stamps', () => {
  it.each(['4.3.0', '4.4.0', '4.4.1', '4.4.2'])(
    'replays one produced by %s',
    version => {
      expect(canReplayAlignment(version)).toBe(true);
    },
  );

  it.each(['4.2.0', '3.0.0', '4.5.0', '', 'toString'])(
    'does not replay one produced by %p',
    version => {
      expect(canReplayAlignment(version)).toBe(false);
    },
  );
});

describe('stamps that came from storage', () => {
  it.each([
    null,
    undefined,
    {},
    { revision: 1 },
    { revision: '1', replayableFrom: 1 },
    { revision: 1.5, replayableFrom: 1 },
    { revision: 0, replayableFrom: 0 },
    { revision: 1, replayableFrom: 2 },
  ])('refuses %p', stamp => {
    expect(
      canReplayAlignment(stamp as AlignmentReplayStamp | null | undefined),
    ).toBe(false);
  });
});

describe('between revisions', () => {
  // A replayer at revision 3 that still reads revision 2 the old way.
  const replayer = { revision: 3, oldestReplayable: 2 };

  function canReplay(revision: number, replayableFrom: number): boolean {
    return canReplayAlignment({ revision, replayableFrom }, replayer);
  }

  it('replays an older alignment it still reads', () => {
    expect(canReplay(2, 2)).toBe(true);
  });

  it('does not replay one older than it still reads', () => {
    expect(canReplay(1, 1)).toBe(false);
  });

  it('replays a newer alignment that says older builds read it', () => {
    expect(canReplay(5, 3)).toBe(true);
  });

  it('does not replay a newer alignment older builds would misread', () => {
    expect(canReplay(4, 4)).toBe(false);
  });
});
