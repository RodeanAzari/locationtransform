/** Search over the bundled Natural Earth index: prefix, word-prefix, substring and typo matches. */

/** One entry of public/data/index.json (see scripts/build-data.ts). */
export interface IndexEntry {
  id: string;
  name: string;
  altNames: string[];
  kind: 'country' | 'admin1';
  typeLabel: string;
  parent: string | null;
  countryCode: string | null;
}

interface Prepared {
  entry: IndexEntry;
  name: string;
  nameWords: string[];
  altNames: string[];
  altWords: string[];
}

/** Lowercase, without diacritics, punctuation collapsed to spaces. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Edit distance counting insertions, deletions, substitutions and adjacent transpositions
 * (optimal string alignment), giving up (returning `max + 1`) once it must exceed `max`.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
      }
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > max) return max + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length];
}

/**
 * Whether `q` is within a small edit distance of the start of `name`. The first letter must
 * match the query's first or second letter (typos rarely change it), which keeps this cheap.
 */
function fuzzyPrefix(q: string, name: string): boolean {
  if (q.length < 4 || (name[0] !== q[0] && name[0] !== q[1])) return false;
  const max = q.length >= 7 ? 2 : 1;
  for (let length = q.length - max; length <= q.length + max; length++) {
    if (length > 0 && length <= name.length && editDistance(q, name.slice(0, length), max) <= max) return true;
  }
  return false;
}

/** Exact-text match quality of `q` against an entry; lower is better, `null` for no match. */
function rank(p: Prepared, q: string): number | null {
  if (p.name === q) return 0;
  if (p.name.startsWith(q)) return 1;
  if (p.altNames.includes(q)) return 2;
  if (p.nameWords.some((w) => w.startsWith(q))) return 3;
  if (p.altWords.some((w) => w.startsWith(q)) || p.altNames.some((a) => a.startsWith(q))) return 4;
  if (q.length >= 3 && p.name.includes(q)) return 5;
  return null;
}

/** Rank of typo-tolerant matches, below every exact-text rank. */
const FUZZY_RANK = 6;

export class LocalIndex {
  private readonly prepared: Prepared[];

  constructor(entries: IndexEntry[]) {
    this.prepared = entries.map((entry) => {
      const name = normalize(entry.name);
      const altNames = entry.altNames.map(normalize);
      return { entry, name, nameWords: name.split(' '), altNames, altWords: altNames.flatMap((a) => a.split(' ')) };
    });
  }

  /**
   * Best matches for `query`, at most `limit`. Typo-tolerant matching only runs when nothing
   * matches the text exactly, so it never pads real results with noise. Ties favour
   * countries, then shorter names.
   */
  search(query: string, limit: number): IndexEntry[] {
    const q = normalize(query);
    if (!q) return [];
    const matches: { p: Prepared; score: number }[] = [];
    for (const p of this.prepared) {
      const score = rank(p, q);
      if (score !== null) matches.push({ p, score });
    }
    if (matches.length === 0) {
      for (const p of this.prepared) {
        if (rank(p, q) === null && (fuzzyPrefix(q, p.name) || p.altNames.some((a) => fuzzyPrefix(q, a)))) {
          matches.push({ p, score: FUZZY_RANK });
        }
      }
    }
    matches.sort(
      (a, b) =>
        a.score - b.score ||
        Number(a.p.entry.kind !== 'country') - Number(b.p.entry.kind !== 'country') ||
        a.p.name.length - b.p.name.length ||
        a.p.name.localeCompare(b.p.name),
    );
    return matches.slice(0, limit).map((m) => m.p.entry);
  }
}

/** Display text for a suggestion, e.g. "Province, Canada" or "Country". */
export function describe(entry: IndexEntry): string {
  return entry.parent ? `${entry.typeLabel}, ${entry.parent}` : entry.typeLabel;
}
