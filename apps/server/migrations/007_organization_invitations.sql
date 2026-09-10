-- Invitation-only organization access. Tokens are stored as hashes and are single-use.
CREATE TABLE IF NOT EXISTS organization_onboarding_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  organization_kind text NOT NULL CHECK (organization_kind IN ('GOVERNMENT', 'NGO')),
  organization_name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  invited_by uuid NOT NULL REFERENCES users(id),
  accepted_by uuid REFERENCES users(id),
  organization_id uuid REFERENCES organizations(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_onboarding_pending_email_kind_idx
  ON organization_onboarding_invitations(lower(email), organization_kind)
  WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS organization_onboarding_invitation_status_idx
  ON organization_onboarding_invitations(status, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_member_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('MEMBER', 'OFFICER', 'MANAGER', 'ORG_ADMIN')),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  invited_by uuid NOT NULL REFERENCES users(id),
  accepted_by uuid REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_member_pending_email_idx
  ON organization_member_invitations(organization_id, lower(email))
  WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS organization_member_invitation_status_idx
  ON organization_member_invitations(organization_id, status, created_at DESC);
