-- Product-wide redesign support: private profiles, notification preferences, organization handles and mentions.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_public_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference text NOT NULL DEFAULT 'SYSTEM' CHECK(theme_preference IN ('LIGHT','DARK','SYSTEM'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{"mentions":true,"incidentUpdates":true,"workflow":true}'::jsonb;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS mention_handle text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS public_support_email text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS intake_email text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS support_phone text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_visibility text NOT NULL DEFAULT 'PRIVATE' CHECK(contact_visibility IN ('PRIVATE','PUBLIC'));
CREATE UNIQUE INDEX IF NOT EXISTS organizations_mention_handle_unique ON organizations(lower(mention_handle)) WHERE mention_handle IS NOT NULL;
CREATE INDEX IF NOT EXISTS organizations_mention_search_idx ON organizations(lower(official_name), lower(coalesce(acronym,''))) WHERE active=true AND verification_status IN ('VERIFIED','APPROVED');

CREATE TABLE IF NOT EXISTS organization_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK(target_type IN ('REPORT','COMMENT','OFFICIAL_UPDATE','ROUTING_REVIEW','INTERVENTION_PROPOSAL','MILESTONE','INSPECTION','RESOLUTION','HANDOVER')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,target_type,target_id)
);
CREATE INDEX IF NOT EXISTS organization_mentions_target_idx ON organization_mentions(target_type,target_id);
CREATE INDEX IF NOT EXISTS notifications_user_cursor_idx ON notifications(user_id,created_at DESC,id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_mention_unique ON notifications(user_id,type,(payload->>'mentionId')) WHERE type='ORGANIZATION_MENTION';

UPDATE organizations SET mention_handle=upper(regexp_replace(coalesce(nullif(acronym,''),slug),'[^a-zA-Z0-9_]','','g')) WHERE mention_handle IS NULL;
