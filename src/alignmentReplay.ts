/**
 * Which builds of this library can replay a stored `RowAlignment` exactly.
 *
 * A stored alignment is replayed by reading its runs, running the same gap
 * simplification over them and rebuilding the two images. The search that
 * found the runs -- row keying, `similarEnough`, `alignArrays` -- is skipped,
 * so changing it never makes an old alignment replay differently. What does is
 * a change to how runs are read: the run format, `simplifySegments` and its
 * threshold, or how the images are rebuilt from the segments. Only that bumps
 * `REPLAY_REVISION`.
 *
 * Handed runs from a build that reads them differently, the library cannot
 * tell: it composes an image out of them anyway. So whoever stores an
 * alignment stores `ALIGNMENT_REPLAY_STAMP` with it, and whoever replays one
 * asks `canReplayAlignment` first. Neither has to know about versions.
 *
 * Kept free of imports so a caller can ask before loading the rest of the
 * library.
 */

/**
 * How this build reads a stored alignment. Bump it when the run format,
 * `simplifySegments`, `SIMPLIFY_THRESHOLD` or the rebuilding of the images from
 * segments changes -- anything that would make the same runs come out as a
 * different pair of aligned images.
 */
export const REPLAY_REVISION = 1;

/**
 * The oldest revision whose alignments this build still replays exactly.
 *
 * Equal to `REPLAY_REVISION` unless a build keeps the older way of reading runs
 * alongside the new one. Raising `REPLAY_REVISION` without doing that means
 * raising this with it.
 */
export const OLDEST_REPLAYABLE_REVISION = 1;

/**
 * The oldest revision that replays the alignments this build produces exactly.
 *
 * What lets an older build replay a newer one's alignment: a change that only
 * adds to how runs are read, and never writes what it added, leaves this where
 * it was. A change older builds would misread raises it to `REPLAY_REVISION`.
 */
export const REPLAYABLE_FROM_REVISION = 1;

/** What to store alongside an alignment so it can be replayed later. */
export interface AlignmentReplayStamp {
  /** The `REPLAY_REVISION` of the build that produced the alignment. */
  revision: number;
  /** Its `REPLAYABLE_FROM_REVISION`. */
  replayableFrom: number;
}

/** The stamp for alignments this build produces. */
export const ALIGNMENT_REPLAY_STAMP: Readonly<AlignmentReplayStamp> =
  Object.freeze({
    revision: REPLAY_REVISION,
    replayableFrom: REPLAYABLE_FROM_REVISION,
  });

/**
 * Releases that produced alignments before there were stamps to store with
 * them, so callers only recorded the package version.
 *
 * Closed: every later release has a stamp, so none is ever added here. 4.3.0
 * is the first release that returned an alignment, and nothing about reading
 * one changed through 4.4.2.
 */
const STAMP_FOR_UNSTAMPED_VERSION: ReadonlyMap<
  string,
  Readonly<AlignmentReplayStamp>
> = new Map(
  ['4.3.0', '4.4.0', '4.4.1', '4.4.2'].map(version => [
    version,
    Object.freeze({ revision: 1, replayableFrom: 1 }),
  ]),
);

/**
 * What a replaying build reads: its own revision and the oldest it still
 * handles. `canReplayAlignment` defaults to this build's, and takes another
 * so the rule can be checked against builds that do not exist yet.
 */
export interface ReplayerRevisions {
  revision: number;
  oldestReplayable: number;
}

const THIS_REPLAYER: Readonly<ReplayerRevisions> = Object.freeze({
  revision: REPLAY_REVISION,
  oldestReplayable: OLDEST_REPLAYABLE_REVISION,
});

function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Whether this build replays exactly an alignment produced under `stamp`.
 *
 * `stamp` is what was stored with the alignment. For an alignment stored before
 * there were stamps, pass the package version that produced it instead. Both
 * come from storage, so anything malformed, missing or unrecognized is `false`
 * -- the caller then searches for an alignment of its own, as it would without
 * one.
 */
export function canReplayAlignment(
  stamp: AlignmentReplayStamp | string | null | undefined,
  replayer: Readonly<ReplayerRevisions> = THIS_REPLAYER,
): boolean {
  const resolved =
    typeof stamp === 'string' ? STAMP_FOR_UNSTAMPED_VERSION.get(stamp) : stamp;
  if (
    resolved == null ||
    !isRevision(resolved.revision) ||
    !isRevision(resolved.replayableFrom) ||
    resolved.replayableFrom > resolved.revision
  ) {
    return false;
  }
  return (
    resolved.revision >= replayer.oldestReplayable &&
    resolved.replayableFrom <= replayer.revision
  );
}
