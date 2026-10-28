/**
 * Builds the bundled Tier 1 data (countries + states/provinces) from Natural Earth 1:10m.
 *
 *   node scripts/build-data.ts
 *
 * Downloads the shapefiles once into .cache/ne, simplifies them with mapshaper, and writes
 *   public/data/index.json          search index
 *   public/data/shapes/<id>.json    one GeoJSON geometry per place
 *
 * The simplified geometry is the ground truth the app measures its accuracy against.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import mapshaper from 'mapshaper';

const NE_BASE_URL = 'https://naciscdn.org/naturalearth/10m/cultural';
const CACHE_DIR = '.cache/ne';
const OUT_DIR = 'public/data';

/**
 * Simplification interval as a fraction of each feature's size (√area). Half the app's 0.1%
 * accuracy target, so simplification never dominates the error being visualized.
 */
const SIMPLIFY_FRACTION = 0.0005;
/** Coordinate precision in degrees (~1 m), enough for the smallest places (e.g. Vatican City). */
const PRECISION = 0.00001;

type Kind = 'country' | 'admin1';

/** One autocomplete entry. */
export interface IndexEntry {
  id: string;
  name: string;
  altNames: string[];
  kind: Kind;
  /** Human-readable type, e.g. "Country", "Province", "State". */
  typeLabel: string;
  /** Parent country name for admin-1 regions; null for countries. */
  parent: string | null;
  /** ISO 3166-1 alpha-2 code, when Natural Earth has one. */
  countryCode: string | null;
}

interface Layer {
  file: string;
  kind: Kind;
  fields: string[];
  toEntry(props: Record<string, unknown>): Omit<IndexEntry, 'kind'> | null;
}

interface Feature {
  properties: Record<string, unknown>;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Natural Earth uses "-99" (and sometimes "-1") for missing codes. */
const code = (value: unknown): string | null => {
  const s = str(value);
  return s && !s.startsWith('-') ? s : null;
};

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Splits a Natural Earth list field ("A|B" or "A, B"). */
const list = (value: unknown): string[] => str(value).split(/[|,]/);

/** Distinct, non-empty alternate names, excluding the primary name. */
const altNames = (name: string, candidates: string[]): string[] => {
  const seen = new Set([name.toLowerCase()]);
  const out: string[] = [];
  for (const candidate of candidates.map((c) => c.trim())) {
    if (candidate && !seen.has(candidate.toLowerCase())) {
      seen.add(candidate.toLowerCase());
      out.push(candidate);
    }
  }
  return out;
};

const LAYERS: Layer[] = [
  {
    file: 'ne_10m_admin_0_countries',
    kind: 'country',
    fields: [
      'ADM0_A3',
      'NAME',
      'NAME_LONG',
      'FORMAL_EN',
      'NAME_ALT',
      'ADMIN',
      'BRK_NAME',
      'NAME_EN',
      'ISO_A2_EH',
      'TYPE',
    ],
    toEntry: (p) => {
      // NAME is abbreviated for some places ("St. Vin. and Gren."); ADMIN is the full name but
      // drops diacritics ("Aland"), so keep NAME when the two differ only by accents.
      const plain = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
      const name = plain(str(p.ADMIN)) === plain(str(p.NAME)) ? str(p.NAME) : str(p.ADMIN);
      const type = str(p.TYPE);
      return {
        id: `country-${slug(str(p.ADM0_A3))}`,
        name,
        altNames: altNames(name, [
          ...[p.NAME, p.NAME_LONG, p.FORMAL_EN, p.ADMIN, p.BRK_NAME, p.NAME_EN].map(str),
          ...list(p.NAME_ALT),
        ]),
        typeLabel: type === 'Sovereign country' || type === 'Country' ? 'Country' : 'Territory',
        parent: null,
        countryCode: code(p.ISO_A2_EH),
      };
    },
  },
  {
    file: 'ne_10m_admin_1_states_provinces',
    kind: 'admin1',
    fields: ['adm1_code', 'name', 'name_en', 'name_alt', 'woe_name', 'gn_name', 'type_en', 'type', 'admin', 'iso_a2'],
    toEntry: (p) => {
      const name = str(p.name) || str(p.name_en) || str(p.woe_name) || str(p.gn_name);
      if (!name) return null;
      return {
        id: `admin1-${slug(str(p.adm1_code))}`,
        name,
        altNames: altNames(name, [str(p.name_en), str(p.woe_name), ...list(p.name_alt)]),
        typeLabel: str(p.type_en).split('|')[0] || str(p.type).split('|')[0] || 'Region',
        parent: str(p.admin) || null,
        countryCode: code(p.iso_a2),
      };
    },
  },
];

async function download(file: string): Promise<string> {
  const path = `${CACHE_DIR}/${file}.zip`;
  if (existsSync(path)) return path;
  console.log(`Downloading ${file}…`);
  const response = await fetch(`${NE_BASE_URL}/${file}.zip`);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${file}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  return path;
}

/** Filters fields and simplifies, writing GeoJSON to the cache. Returns its features. */
async function simplify(layer: Layer, zipPath: string): Promise<Feature[]> {
  const out = `${CACHE_DIR}/${layer.file}.simplified.json`;
  await mapshaper.runCommands(
    [
      `-i ${zipPath}`,
      `-target ${layer.file}`,
      `-filter-fields ${layer.fields.join(',')}`,
      `-each "size_m = Math.sqrt(this.area)"`,
      `-simplify variable interval="size_m * ${SIMPLIFY_FRACTION}" keep-shapes`,
      `-filter-fields ${layer.fields.join(',')}`,
      `-o ${out} format=geojson precision=${PRECISION} force`,
    ].join(' '),
  );
  const collection = JSON.parse(await readFile(out, 'utf8')) as { features: Feature[] };
  return collection.features;
}

async function main(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(`${OUT_DIR}/shapes`, { recursive: true });

  const index: IndexEntry[] = [];
  let shapeBytes = 0;
  for (const layer of LAYERS) {
    const features = await simplify(layer, await download(layer.file));
    let written = 0;
    for (const feature of features) {
      const entry = layer.toEntry(feature.properties);
      if (!entry || !feature.geometry) continue;
      const json = JSON.stringify({ id: entry.id, name: entry.name, geometry: feature.geometry });
      await writeFile(`${OUT_DIR}/shapes/${entry.id}.json`, json);
      shapeBytes += json.length;
      index.push({ ...entry, kind: layer.kind });
      written++;
    }
    console.log(`${layer.file}: ${written} of ${features.length} features written`);
  }

  index.sort((a, b) => a.name.localeCompare(b.name));
  const indexJson = JSON.stringify(index);
  await writeFile(`${OUT_DIR}/index.json`, indexJson);
  const mb = (bytes: number): string => (bytes / 1e6).toFixed(1);
  console.log(`index.json: ${index.length} entries, ${mb(indexJson.length)} MB`);
  console.log(`shapes: ${mb(shapeBytes)} MB total`);
}

await main();
