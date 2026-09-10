import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../app/icons";
import { useTheme } from "../../app/theme";
import { api } from "../../lib/api";
type Profile = {
  email: string;
  display_name: string;
  avatar_public_id?: string;
  theme_preference: "LIGHT" | "DARK" | "SYSTEM";
  notification_preferences: {
    mentions: boolean;
    incidentUpdates: boolean;
    workflow: boolean;
  };
  created_at: string;
};
export default function AccountPage() {
  const qc = useQueryClient(),
    theme = useTheme(),
    navigate = useNavigate();
  const [avatarMessage, setAvatarMessage] = useState<string>();
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => api<Profile>("/users/me/profile"),
    retry: false,
  });
  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api<Profile>("/users/me/profile", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      qc.setQueryData(["profile"], data);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  const prefs = useMutation({
    mutationFn: (data: Record<string, boolean>) =>
      api<void>("/users/me/notification-preferences", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
  const avatar = useMutation({
    mutationFn: async (file: File) => {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5_000_000
      )
        throw new Error("Choose a JPG, PNG, or WebP avatar smaller than 5 MB.");
      const sign = await api<{
        timestamp: number;
        folder: string;
        resource_type: "image";
        context: string;
        signature: string;
        apiKey: string;
        cloudName: string;
      }>("/users/me/avatar/sign-upload", {
        method: "POST",
        body: JSON.stringify({ mimeType: file.type, bytes: file.size }),
      });
      const upload = new FormData();
      upload.set("file", file);
      upload.set("timestamp", String(sign.timestamp));
      upload.set("folder", sign.folder);
      upload.set("context", sign.context);
      upload.set("type", "authenticated");
      upload.set("signature", sign.signature);
      upload.set("api_key", sign.apiKey);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${sign.cloudName}/${sign.resource_type}/upload`,
        { method: "POST", body: upload },
      );
      if (!response.ok)
        throw new Error("Avatar upload could not be completed.");
      const asset = (await response.json()) as { public_id: string };
      await api<void>("/users/me/avatar/verify", {
        method: "POST",
        body: JSON.stringify({
          publicId: asset.public_id,
          mimeType: file.type,
        }),
      });
    },
    onSuccess: async () => {
      setAvatarMessage("Avatar saved.");
      await qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error: Error) => setAvatarMessage(error.message),
  });
  const removeAvatar = useMutation({
    mutationFn: () => api<void>("/users/me/avatar", { method: "DELETE" }),
    onSuccess: async () => {
      setAvatarMessage("Avatar removed.");
      await qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error: Error) => setAvatarMessage(error.message),
  });
  const logoutAll = useMutation({
    mutationFn: () =>
      api<void>("/auth/logout-all", { method: "POST", body: "{}" }),
    onSuccess: () => {
      qc.clear();
      navigate("/", { replace: true });
    },
  });
  if (profile.error)
    return (
      <main className="page-container">
        <div className="empty-state">
          <Icon name="profile" />
          <h1>Sign in to manage your profile.</h1>
        </div>
      </main>
    );
  return (
    <main className="page-container">
      <div className="page-heading">
        <div>
          <p className="kicker">Private by default</p>
          <h1>Profile & preferences</h1>
          <p>
            Your reports, follows, affected status, exact location and activity
            are never displayed as a public citizen profile.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-card">
          <div className="section-title">
            <Icon name="profile" />
            <div>
              <h2>Account</h2>
              <p>
                The name below is used on comments when you participate as
                yourself.
              </p>
            </div>
          </div>
          <form
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              save.mutate({
                displayName: new FormData(e.currentTarget).get("displayName"),
              });
            }}
          >
            <label>
              Display name
              <input
                name="displayName"
                defaultValue={profile.data?.display_name}
              />
            </label>
            <label>
              Email
              <input value={profile.data?.email ?? ""} readOnly />
            </label>
            <button
              className="button button--primary"
              disabled={save.isPending}
            >
              Save account
            </button>
          </form>
          <div className="avatar-settings">
            <div className="avatar-settings__copy">
              <strong>Comment avatar</strong>
              <small>
                Optional. This is shown only where you choose to display a
                public comment identity.
              </small>
            </div>
            <div className="button-row">
              <label className="button">
                {avatar.isPending ? "Uploading…" : "Upload avatar"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  disabled={avatar.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) avatar.mutate(file);
                  }}
                />
              </label>
              {profile.data?.avatar_public_id && (
                <button
                  className="button button--quiet"
                  type="button"
                  onClick={() => removeAvatar.mutate()}
                  disabled={removeAvatar.isPending}
                >
                  Remove
                </button>
              )}
            </div>
            {avatarMessage && <small role="status">{avatarMessage}</small>}
          </div>
        </section>
        <section className="settings-card">
          <div className="section-title">
            <Icon name="sun" />
            <div>
              <h2>Appearance</h2>
              <p>Use your device theme or choose a product-wide mode.</p>
            </div>
          </div>
          <div className="segmented">
            {(["system", "light", "dark"] as const).map((value) => (
              <button
                key={value}
                className={theme.preference === value ? "active" : ""}
                onClick={() => {
                  theme.setPreference(value);
                  save.mutate({ themePreference: value.toUpperCase() });
                }}
              >
                {value}
              </button>
            ))}
          </div>
        </section>
        <section className="settings-card">
          <div className="section-title">
            <Icon name="security" />
            <div>
              <h2>Sessions</h2>
              <p>
                Sign out of every device if you no longer recognize a session.
              </p>
            </div>
          </div>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => logoutAll.mutate()}
            disabled={logoutAll.isPending}
          >
            {logoutAll.isPending ? "Signing out…" : "Sign out all devices"}
          </button>
        </section>
        <section className="settings-card">
          <div className="section-title">
            <Icon name="notification" />
            <div>
              <h2>Activity preferences</h2>
              <p>
                Choose which meaningful actions appear in your in-app activity
                center.
              </p>
            </div>
          </div>
          <form
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              prefs.mutate({
                mentions: d.has("mentions"),
                incidentUpdates: d.has("incidentUpdates"),
                workflow: d.has("workflow"),
              });
            }}
          >
            {[
              ["mentions", "Organization mentions"],
              ["incidentUpdates", "Followed incident updates"],
              ["workflow", "Government and NGO workflow"],
            ].map(([name, title]) => (
              <label className="check-row" key={name}>
                <input
                  type="checkbox"
                  name={name}
                  defaultChecked={
                    profile.data?.notification_preferences?.[
                      name as keyof Profile["notification_preferences"]
                    ] ?? true
                  }
                />
                <span>
                  <strong>{title}</strong>
                  <small>Show these events in Activity.</small>
                </span>
              </label>
            ))}
            <button className="button button--primary">
              Save notifications
            </button>
          </form>
        </section>
        <section className="settings-card">
          <div className="section-title">
            <Icon name="security" />
            <div>
              <h2>Privacy</h2>
              <p>
                Citizen profiles are not discoverable. Evidence originals and
                exact locations remain restricted.
              </p>
            </div>
          </div>
          <div className="privacy-note">
            <Icon name="success" />
            <span>Your profile is private by default.</span>
          </div>
        </section>
      </div>
    </main>
  );
}
