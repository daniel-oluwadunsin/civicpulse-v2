-- Additive hardening and operational schema for the public, government and NGO surfaces.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_incident_id uuid REFERENCES incidents(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS processing_stage text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS processing_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS failure_code text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS failure_message text;
ALTER TABLE report_media ADD COLUMN IF NOT EXISTS media_kind text CHECK(media_kind IN ('image','audio','video'));
CREATE UNIQUE INDEX IF NOT EXISTS reports_user_idempotency_idx ON reports(reporter_user_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS public_location_precision text NOT NULL DEFAULT 'COARSE' CHECK (public_location_precision IN ('COARSE','EXACT'));
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS severity integer NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 5);
CREATE INDEX IF NOT EXISTS incidents_public_feed_idx ON incidents(updated_at DESC,id DESC) WHERE public_visibility='PUBLIC';
CREATE INDEX IF NOT EXISTS incidents_category_status_idx ON incidents(category,official_status,updated_at DESC);
CREATE INDEX IF NOT EXISTS incident_assignments_org_idx ON incident_assignments(organization_id,status,assigned_at DESC);
ALTER TABLE incident_assignments ADD COLUMN IF NOT EXISTS ended_at timestamptz;
CREATE TABLE IF NOT EXISTS incident_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id), role text NOT NULL, routing_confidence numeric,
  routing_reason text, routing_method text NOT NULL, assignment_status text NOT NULL, assigned_at timestamptz NOT NULL,
  replaced_by_user_id uuid REFERENCES users(id), replacement_reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incident_updates ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE incident_updates ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE moderation_reports ADD COLUMN IF NOT EXISTS decision_note text;
ALTER TABLE moderation_reports ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES users(id);
ALTER TABLE moderation_reports ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE incident_comments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE incident_comments ADD COLUMN IF NOT EXISTS author_organization_id uuid REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS incident_comments_incident_idx ON incident_comments(incident_id,created_at,id);
CREATE TABLE IF NOT EXISTS incident_comment_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comment_id uuid NOT NULL REFERENCES incident_comments(id) ON DELETE CASCADE,
  prior_body text NOT NULL, edited_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incident_confirmations (
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id uuid REFERENCES reports(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(incident_id,user_id)
);
CREATE TABLE IF NOT EXISTS followed_areas (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,jurisdiction_id));
CREATE TABLE IF NOT EXISTS followed_categories (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, category text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,category));
CREATE TABLE IF NOT EXISTS followed_organizations (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,organization_id));

CREATE TABLE IF NOT EXISTS incident_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  uploader_user_id uuid NOT NULL REFERENCES users(id), uploader_organization_id uuid REFERENCES organizations(id),
  kind text NOT NULL CHECK(kind IN ('CITIZEN','INSPECTION','PROGRESS','RESOLUTION','INTERVENTION')),
  report_media_id uuid REFERENCES report_media(id), cloudinary_public_id text, resource_type text, format text, mime_type text,
  description text, visibility text NOT NULL DEFAULT 'RESTRICTED' CHECK(visibility IN ('RESTRICTED','PUBLIC')),
  moderation_status text NOT NULL DEFAULT 'PENDING' CHECK(moderation_status IN ('PENDING','APPROVED','HIDDEN','REMOVED')),
  created_at timestamptz NOT NULL DEFAULT now(), CHECK(report_media_id IS NOT NULL OR cloudinary_public_id IS NOT NULL)
);
ALTER TABLE incident_evidence ADD COLUMN IF NOT EXISTS public_derivative_url text;
CREATE INDEX IF NOT EXISTS incident_evidence_public_idx ON incident_evidence(incident_id,created_at DESC) WHERE visibility='PUBLIC' AND moderation_status='APPROVED';

CREATE TABLE IF NOT EXISTS incident_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL, actor_user_id uuid REFERENCES users(id), actor_organization_id uuid REFERENCES organizations(id),
  source_type text NOT NULL, source_id uuid, title text NOT NULL, body text,
  visibility text NOT NULL DEFAULT 'PUBLIC' CHECK(visibility IN ('PUBLIC','INTERNAL')),
  metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS timeline_public_cursor_idx ON incident_timeline_events(incident_id,created_at DESC,id DESC) WHERE visibility='PUBLIC';

CREATE TABLE IF NOT EXISTS routing_review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL REFERENCES users(id), organization_id uuid REFERENCES organizations(id), reason text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED','REJECTED')), created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS incident_match_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,
  candidate_incident_ids jsonb NOT NULL DEFAULT '[]', rationale text NOT NULL, confidence numeric,
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED')), created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS incident_coordination_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  requesting_organization_id uuid NOT NULL REFERENCES organizations(id), invited_organization_id uuid NOT NULL REFERENCES organizations(id),
  requested_by_user_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','DECLINED','CANCELLED')),
  responded_by_user_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), responded_at timestamptz,
  UNIQUE(incident_id,invited_organization_id)
);

ALTER TABLE resolution_verifications ADD COLUMN IF NOT EXISTS evidence_id uuid REFERENCES incident_evidence(id);
ALTER TABLE resolution_verifications ADD COLUMN IF NOT EXISTS eligibility_basis text;
ALTER TABLE resolution_verifications ADD COLUMN IF NOT EXISTS distance_band text;
ALTER TABLE resolution_verifications ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS resolution_review_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  verification_id uuid REFERENCES resolution_verifications(id), status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESPONDED','RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, UNIQUE(verification_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS intervention_interest_unique ON intervention_expressions_of_interest(incident_id,organization_id);
ALTER TABLE intervention_proposals ADD COLUMN IF NOT EXISTS intervention_types jsonb NOT NULL DEFAULT '[]';
ALTER TABLE intervention_proposals ADD COLUMN IF NOT EXISTS budget_amount numeric;
ALTER TABLE intervention_proposals ADD COLUMN IF NOT EXISTS currency char(3);
ALTER TABLE intervention_proposals ADD COLUMN IF NOT EXISTS funding_status text;
ALTER TABLE intervention_proposals ADD COLUMN IF NOT EXISTS planned_start date;
ALTER TABLE intervention_proposals ADD COLUMN IF NOT EXISTS planned_end date;
ALTER TABLE intervention_proposals ADD COLUMN IF NOT EXISTS physical_work boolean NOT NULL DEFAULT false;
ALTER TABLE intervention_proposals ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE intervention_proposals ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE intervention_proposals ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE intervention_proposals ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id);
ALTER TABLE intervention_proposals ADD COLUMN IF NOT EXISTS review_reason text;
CREATE INDEX IF NOT EXISTS intervention_discovery_idx ON intervention_proposals(incident_id,status,updated_at DESC);
CREATE TABLE IF NOT EXISTS intervention_participants (proposal_id uuid NOT NULL REFERENCES intervention_proposals(id) ON DELETE CASCADE, organization_id uuid NOT NULL REFERENCES organizations(id), role text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(proposal_id,organization_id));
CREATE TABLE IF NOT EXISTS intervention_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES intervention_proposals(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES users(id), document_type text NOT NULL, title text NOT NULL,
  cloudinary_public_id text NOT NULL UNIQUE, resource_type text NOT NULL, format text, mime_type text NOT NULL,
  visibility text NOT NULL DEFAULT 'RESTRICTED' CHECK(visibility IN ('RESTRICTED','PUBLIC')),
  moderation_status text NOT NULL DEFAULT 'PENDING', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS intervention_revisions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES intervention_proposals(id) ON DELETE CASCADE, version integer NOT NULL, payload jsonb NOT NULL, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(proposal_id,version));
CREATE TABLE IF NOT EXISTS intervention_evidence (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES intervention_proposals(id) ON DELETE CASCADE, milestone_id uuid REFERENCES intervention_milestones(id), cloudinary_public_id text NOT NULL, description text, visibility text NOT NULL DEFAULT 'RESTRICTED', moderation_status text NOT NULL DEFAULT 'PENDING', uploaded_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS intervention_completion_submissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES intervention_proposals(id) ON DELETE CASCADE, submitted_by uuid NOT NULL REFERENCES users(id), statement text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS intervention_inspections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES intervention_proposals(id) ON DELETE CASCADE, organization_id uuid NOT NULL REFERENCES organizations(id), inspector_user_id uuid NOT NULL REFERENCES users(id), decision text NOT NULL CHECK(decision IN ('ACCEPTED','REMEDIATION_REQUIRED','REJECTED')), notes text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS intervention_handover (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL UNIQUE REFERENCES intervention_proposals(id) ON DELETE CASCADE, organization_id uuid NOT NULL REFERENCES organizations(id), completed_by uuid NOT NULL REFERENCES users(id), notes text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS rate_limit_events (bucket text NOT NULL, subject text NOT NULL, window_started_at timestamptz NOT NULL, hits integer NOT NULL DEFAULT 1, PRIMARY KEY(bucket,subject,window_started_at));
CREATE INDEX IF NOT EXISTS rate_limit_cleanup_idx ON rate_limit_events(window_started_at);
