import { env } from "../config/env.js";
import { pool, transaction } from "./pool.js";

const ADM1_URL =
  "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1.geojson";
const ADM2_URL =
  "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/NGA/ADM2/geoBoundaries-NGA-ADM2.geojson";
const SOURCE = "geoBoundaries / GRID3";
const LICENSE = "CC BY 4.0";
const EFFECTIVE_FROM = "2022-01-01";
const EXPECTED = { ADM1: 37, ADM2: 774 } as const;

type Geometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

type Feature = {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry?: Geometry | null;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

type NormalizedFeature = {
  name: string;
  code: string;
  geometry: Geometry;
};

function usage(): never {
  throw new Error(
    "Boundary import is guarded. Run `npm run db:import:nigeria -- --apply` (add `--allow-test` for civicpulse_test).",
  );
}

function assertCollection(value: unknown, level: "ADM1" | "ADM2") {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { type?: unknown }).type !== "FeatureCollection" ||
    !Array.isArray((value as { features?: unknown }).features)
  ) {
    throw new Error(`${level} download is not a GeoJSON FeatureCollection.`);
  }
  const collection = value as FeatureCollection;
  if (collection.features.length !== EXPECTED[level]) {
    throw new Error(
      `${level} download contains ${collection.features.length} features; expected ${EXPECTED[level]}. Refusing to import a partial dataset.`,
    );
  }
  return collection;
}

function normalize(collection: FeatureCollection, level: "ADM1" | "ADM2") {
  const seen = new Set<string>();
  return collection.features.map((feature, index): NormalizedFeature => {
    const properties = feature.properties ?? {};
    const name =
      typeof properties.shapeName === "string"
        ? properties.shapeName.trim()
        : "";
    const shapeId =
      typeof properties.shapeID === "string" ? properties.shapeID.trim() : "";
    const shapeIso =
      typeof properties.shapeISO === "string" ? properties.shapeISO.trim() : "";
    const code = shapeId || (level === "ADM1" ? shapeIso : "");
    if (!name || !code) {
      throw new Error(
        `${level} feature ${index + 1} is missing shapeName or shapeID.`,
      );
    }
    if (seen.has(code)) {
      throw new Error(`${level} contains duplicate stable code ${code}.`);
    }
    seen.add(code);
    if (
      !feature.geometry ||
      !["Polygon", "MultiPolygon"].includes(feature.geometry.type)
    ) {
      throw new Error(
        `${level} feature ${name} has an unsupported geometry type.`,
      );
    }
    return { name, code, geometry: feature.geometry };
  });
}

async function download(url: string, level: "ADM1" | "ADM2") {
  const response = await fetch(url, {
    headers: { accept: "application/geo+json, application/json" },
  });
  if (!response.ok) {
    throw new Error(`${level} download failed with HTTP ${response.status}.`);
  }
  return normalize(assertCollection(await response.json(), level), level);
}

async function upsertBoundary(
  client: Parameters<Parameters<typeof transaction>[0]>[0],
  input: NormalizedFeature,
  type: "STATE" | "LGA",
  parentId: string | null,
) {
  const existing = await client.query<{ id: string }>(
    "select id from jurisdictions where source = $1 and type = $2 and official_code = $3 limit 1",
    [SOURCE, type, input.code],
  );
  const values = [
    input.name,
    type,
    parentId,
    input.code,
    JSON.stringify(input.geometry),
    SOURCE,
    type === "STATE" ? ADM1_URL : ADM2_URL,
    LICENSE,
    EFFECTIVE_FROM,
  ];
  if (existing.rows[0]) {
    await client.query(
      `update jurisdictions
       set name = $1,
           parent_id = $2,
           boundary = ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))),
           source_url = $4,
           license = $5,
           effective_from = $6,
           active = true
       where id = $7`,
      [
        input.name,
        parentId,
        JSON.stringify(input.geometry),
        type === "STATE" ? ADM1_URL : ADM2_URL,
        LICENSE,
        EFFECTIVE_FROM,
        existing.rows[0].id,
      ],
    );
    return existing.rows[0].id;
  }
  const inserted = await client.query<{ id: string }>(
    `insert into jurisdictions
       (name, type, parent_id, official_code, boundary, source, source_url, license, effective_from)
     values
       ($1, $2, $3, $4,
        ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))),
        $6, $7, $8, $9)
     returning id`,
    values,
  );
  return inserted.rows[0]!.id;
}

async function importBoundaries() {
  const stateFeatures = await download(ADM1_URL, "ADM1");
  const lgaFeatures = await download(ADM2_URL, "ADM2");
  const databaseTarget = env.DATABASE_URL.replace(/:[^:@/]+@/, ":***@");
  console.log(`Validating Nigeria boundaries for ${databaseTarget}`);

  return transaction(async (client) => {
    const countryResult = await client.query<{ id: string }>(
      "select id from jurisdictions where source = $1 and type = 'COUNTRY' and official_code = 'NGA' limit 1",
      [SOURCE],
    );
    let countryId = countryResult.rows[0]?.id;
    if (!countryId) {
      const insertedCountry = await client.query<{ id: string }>(
        `insert into jurisdictions
           (name, type, official_code, boundary, source, source_url, license, effective_from)
         values
           ('Nigeria', 'COUNTRY', 'NGA',
            ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))),
            $2, $3, $4, $5)
         returning id`,
        [
          JSON.stringify(stateFeatures[0]!.geometry),
          SOURCE,
          ADM1_URL,
          LICENSE,
          EFFECTIVE_FROM,
        ],
      );
      countryId = insertedCountry.rows[0]!.id;
    }

    for (const state of stateFeatures) {
      await upsertBoundary(client, state, "STATE", countryId);
    }
    await client.query(
      `update jurisdictions country
       set boundary = sub.boundary,
           active = true,
           source_url = $2,
           license = $3,
           effective_from = $4
       from (
         select ST_Multi(ST_UnaryUnion(ST_Collect(boundary))) as boundary
         from jurisdictions
         where source = $1 and type = 'STATE' and active = true
       ) sub
       where country.id = $5`,
      [SOURCE, ADM1_URL, LICENSE, EFFECTIVE_FROM, countryId],
    );

    for (const lga of lgaFeatures) {
      await upsertBoundary(client, lga, "LGA", null);
    }

    const linkage = await client.query<{ unmatched: string; multiple: string }>(
      `with candidates as (
         select l.id, count(s.id)::text as state_count
         from jurisdictions l
         left join jurisdictions s
           on s.source = $1 and s.type = 'STATE' and s.active = true
          and ST_Covers(s.boundary, ST_PointOnSurface(l.boundary))
         where l.source = $1 and l.type = 'LGA' and l.active = true
         group by l.id
       )
       select count(*) filter (where state_count = '0')::text as unmatched,
              count(*) filter (where state_count <> '0' and state_count <> '1')::text as multiple
       from candidates`,
      [SOURCE],
    );
    const unmatched = Number(linkage.rows[0]?.unmatched ?? 0);
    const multiple = Number(linkage.rows[0]?.multiple ?? 0);
    if (unmatched || multiple) {
      throw new Error(
        `ADM2 parent validation failed: ${unmatched} LGAs are outside a state and ${multiple} match multiple states. No changes were committed.`,
      );
    }
    await client.query(
      `update jurisdictions lga
       set parent_id = matches.state_id
       from (
         select l.id as lga_id, min(s.id::text)::uuid as state_id
         from jurisdictions l
         join jurisdictions s
           on s.source = $1 and s.type = 'STATE' and s.active = true
          and ST_Covers(s.boundary, ST_PointOnSurface(l.boundary))
         where l.source = $1 and l.type = 'LGA' and l.active = true
         group by l.id
         having count(s.id) = 1
       ) matches
       where lga.id = matches.lga_id`,
      [SOURCE],
    );

    const coverage = await client.query<{
      below_threshold: string;
      minimum_ratio: string;
    }>(
      `select
         count(*) filter (
           where ST_Area(ST_Intersection(s.boundary, l.boundary)) /
             nullif(ST_Area(l.boundary), 0) < 0.999
         )::text as below_threshold,
         coalesce(min(
           ST_Area(ST_Intersection(s.boundary, l.boundary)) /
             nullif(ST_Area(l.boundary), 0)
         ), 1)::text as minimum_ratio
       from jurisdictions l
       join jurisdictions s on s.id = l.parent_id
       where l.source = $1 and l.type = 'LGA' and l.active = true
         and s.source = $1 and s.type = 'STATE' and s.active = true`,
      [SOURCE],
    );
    const coverageResult = coverage.rows[0]!;
    if (Number(coverageResult.below_threshold) > 0) {
      throw new Error(
        `ADM2 geometry containment failed: ${coverageResult.below_threshold} LGAs have less than 99.9% overlap with their parent state (minimum ${coverageResult.minimum_ratio}). No changes were committed.`,
      );
    }

    // Incidents created before a boundary release may not have had a resolved
    // jurisdiction. Backfill only unambiguous point-in-polygon matches and
    // leave ambiguous records untouched for the normal routing-review path.
    const backfilled = await client.query(
      `with matches as (
         select i.id,
                min(l.id::text)::uuid as lga_id,
                min(s.id::text)::uuid as state_id
         from incidents i
         join jurisdictions l
           on l.source = $1 and l.type = 'LGA' and l.active = true
          and ST_Covers(l.boundary, i.location)
         join jurisdictions s
           on s.id = l.parent_id and s.source = $1 and s.type = 'STATE' and s.active = true
         where i.location is not null
           and (i.lga_jurisdiction_id is null or i.state_jurisdiction_id is null)
         group by i.id
         having count(l.id) = 1
       )
       update incidents i
       set lga_jurisdiction_id = matches.lga_id,
           state_jurisdiction_id = matches.state_id,
           updated_at = now()
       from matches
       where i.id = matches.id`,
      [SOURCE],
    );

    const validation = await client.query<{
      country_count: string;
      state_count: string;
      lga_count: string;
      invalid_count: string;
      empty_count: string;
      missing_parent_count: string;
    }>(
      `select
         count(*) filter (where type = 'COUNTRY')::text as country_count,
         count(*) filter (where type = 'STATE')::text as state_count,
         count(*) filter (where type = 'LGA')::text as lga_count,
         count(*) filter (where not ST_IsValid(boundary))::text as invalid_count,
         count(*) filter (where ST_IsEmpty(boundary))::text as empty_count,
         count(*) filter (where type in ('STATE', 'LGA') and parent_id is null)::text as missing_parent_count
       from jurisdictions
       where source = $1 and active = true`,
      [SOURCE],
    );
    const result = validation.rows[0]!;
    const expected =
      Number(result.country_count) === 1 &&
      Number(result.state_count) === EXPECTED.ADM1 &&
      Number(result.lga_count) === EXPECTED.ADM2 &&
      Number(result.invalid_count) === 0 &&
      Number(result.empty_count) === 0 &&
      Number(result.missing_parent_count) === 0;
    if (!expected) {
      throw new Error(
        `Boundary validation failed: ${JSON.stringify(result)}. No changes were committed.`,
      );
    }

    await client.query(
      `insert into audit_logs(action, target_type, target_id, metadata)
       values ('JURISDICTION_DATASET_IMPORTED', 'jurisdiction_dataset', $1, $2)`,
      [
        countryId,
        JSON.stringify({
          source: SOURCE,
          license: LICENSE,
          effectiveFrom: EFFECTIVE_FROM,
          adm1Count: EXPECTED.ADM1,
          adm2Count: EXPECTED.ADM2,
          sourceUrls: { adm1: ADM1_URL, adm2: ADM2_URL },
        }),
      ],
    );
    return {
      ...result,
      incidents_backfilled: String(backfilled.rowCount ?? 0),
    };
  });
}

const args = new Set(process.argv.slice(2));
if (!args.has("--apply")) usage();
if (
  /\/civicpulse_test(?:\?|$)/.test(env.DATABASE_URL) &&
  !args.has("--allow-test")
) {
  throw new Error(
    "Refusing to import into civicpulse_test without the explicit --allow-test flag.",
  );
}

importBoundaries()
  .then((result) => {
    console.log(
      `Imported Nigeria jurisdiction dataset: ${JSON.stringify(result)}`,
    );
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
