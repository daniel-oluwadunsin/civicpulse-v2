-- Keep controlled boundary imports idempotent. Nullable codes remain allowed for
-- manually-created jurisdictions, while a source/type/code identifies a
-- versioned imported geometry uniquely.
CREATE UNIQUE INDEX IF NOT EXISTS jurisdictions_source_type_code_uidx
  ON jurisdictions(source, type, official_code)
  WHERE official_code IS NOT NULL;
