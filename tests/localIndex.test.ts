import { describe as group, expect, it } from 'vitest';
import { LocalIndex, describe, normalize, type IndexEntry } from '../src/search/localIndex';

function entry(id: string, name: string, extra: Partial<IndexEntry> = {}): IndexEntry {
  return { id, name, altNames: [], kind: 'admin1', typeLabel: 'State', parent: 'Somewhere', countryCode: null, ...extra };
}

const index = new LocalIndex([
  entry('ca-on', 'Ontario', { typeLabel: 'Province', parent: 'Canada', altNames: ['Upper Canada'] }),
  entry('us-ga', 'Georgia', { parent: 'United States of America', altNames: ['GA'] }),
  entry('geo', 'Georgia', { kind: 'country', typeLabel: 'Country', parent: null }),
  entry('us-ny', 'New York', { parent: 'United States of America', altNames: ['NY'] }),
  entry('ar-er', 'Entre Ríos', { typeLabel: 'Province', parent: 'Argentina', altNames: ['Entre-Rios'] }),
  entry('cz', 'Czechia', { kind: 'country', typeLabel: 'Country', parent: null, altNames: ['Czech Republic'] }),
  entry('it', 'Italy', { kind: 'country', typeLabel: 'Country', parent: null }),
]);
const ids = (q: string): string[] => index.search(q, 10).map((e) => e.id);

group('LocalIndex.search', () => {
  it('matches name prefixes', () => {
    expect(ids('ont')).toEqual(['ca-on']);
  });

  it('puts countries first among equal matches', () => {
    expect(ids('georgia')).toEqual(['geo', 'us-ga']);
  });

  it('matches later words and alternate names', () => {
    expect(ids('york')).toEqual(['us-ny']);
    expect(ids('czech rep')).toEqual(['cz']);
    expect(ids('ny')).toEqual(['us-ny']);
  });

  it('ignores case, accents and punctuation', () => {
    expect(ids('ENTRE RIOS')).toEqual(['ar-er']);
    expect(ids('entre-rí')).toEqual(['ar-er']);
  });

  it('tolerates small typos', () => {
    expect(ids('ontrio')).toEqual(['ca-on']);
    expect(ids('itlay')).toEqual(['it']);
  });

  it('does not fuzzy-match very short queries', () => {
    expect(ids('itx')).toEqual([]);
  });

  it('ranks exact matches above prefixes', () => {
    const extra = new LocalIndex([entry('long', 'Italy Province'), entry('it', 'Italy', { kind: 'country' })]);
    expect(extra.search('italy', 5).map((e) => e.id)).toEqual(['it', 'long']);
  });

  it('respects the limit and empty queries', () => {
    expect(index.search('georgia', 1).map((e) => e.id)).toEqual(['geo']);
    expect(index.search('  ', 5)).toEqual([]);
  });
});

group('helpers', () => {
  it('normalizes', () => {
    expect(normalize('  Côte d’Ivoire ')).toBe('cote d ivoire');
  });

  it('describes entries', () => {
    expect(describe(entry('ca-on', 'Ontario', { typeLabel: 'Province', parent: 'Canada' }))).toBe('Province, Canada');
    expect(describe(entry('it', 'Italy', { typeLabel: 'Country', parent: null }))).toBe('Country');
  });
});
