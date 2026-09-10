import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../app/icons";
import { api } from "../../lib/api";
import { MapPinPicker } from "./MapPinPicker";

type Draft = { id: string };
type DraftDetail = Draft & {
  status: string;
  latitude?: number;
  longitude?: number;
  location_accuracy_meters?: number;
  location_source?: "DEVICE" | "MAP";
  user_confirmed_location: boolean;
  media: Array<{ id: string; media_kind: string; bytes: number }>;
};
type Location = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  source: "DEVICE" | "MAP";
  confirmed: boolean;
};

export function ReportPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [createdDraft, setCreatedDraft] = useState<Draft>();
  const [location, setLocation] = useState<Location>();
  const [message, setMessage] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const resumed = useQuery({
    queryKey: ["report-draft", params.get("draft")],
    queryFn: () => api<DraftDetail>(`/reports/${params.get("draft")}`),
    enabled: !!params.get("draft"),
    retry: false,
  });
  const draft = createdDraft ?? resumed.data;
  const resumedLocation: Location | undefined =
    resumed.data?.latitude !== undefined && resumed.data.longitude !== undefined
      ? {
          latitude: Number(resumed.data.latitude),
          longitude: Number(resumed.data.longitude),
          ...(resumed.data.location_accuracy_meters !== undefined
            ? { accuracyMeters: resumed.data.location_accuracy_meters }
            : {}),
          source: resumed.data.location_source ?? "MAP",
          confirmed: resumed.data.user_confirmed_location,
        }
      : undefined;
  const activeLocation = location ?? resumedLocation;
  const create = useMutation({
    mutationFn: (payload: unknown) =>
      api<Draft>("/reports", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (created) => {
      setCreatedDraft(created);
      setParams({ draft: created.id }, { replace: true });
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const save = useMutation({
    mutationFn: (payload: unknown) =>
      api<void>(`/reports/${draft!.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onError: (error: Error) => setMessage(error.message),
  });
  const submit = useMutation({
    mutationFn: () =>
      api<{ status: string }>(`/reports/${draft!.id}/submit`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: (data) =>
      setMessage(
        `Report received. Status: ${data.status}. Processing continues safely in the background.`,
      ),
    onError: (error: Error) => setMessage(error.message),
  });
  const persistLocation = (next: Location) => {
    setLocation(next);
    if (draft) save.mutate({ location: next });
  };
  const begin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      originalText: data.get("description") || undefined,
      typedLocation: data.get("typedLocation") || undefined,
    });
  };
  const useLocation = () =>
    navigator.geolocation.getCurrentPosition(
      (position) =>
        persistLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          source: "DEVICE",
          confirmed: true,
        }),
      () =>
        setMessage(
          "Location permission was not granted. Place a pin on the map or enter confirmed coordinates below.",
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  const confirmManual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    persistLocation({
      latitude: Number(data.get("latitude")),
      longitude: Number(data.get("longitude")),
      source: "MAP",
      confirmed: true,
    });
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !draft) return;
    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("video/")
          ? "video"
          : null;
    if (!kind)
      return setMessage("Choose an image, audio, or video evidence file.");
    setUploading(true);
    try {
      const sign = await api<{
        timestamp: number;
        folder: string;
        resource_type: string;
        context: string;
        signature: string;
        apiKey: string;
        cloudName: string;
      }>(`/reports/${draft.id}/media/sign-upload`, {
        method: "POST",
        body: JSON.stringify({ kind, mimeType: file.type, bytes: file.size }),
      });
      const form = new FormData();
      for (const [key, value] of Object.entries({
        timestamp: String(sign.timestamp),
        folder: sign.folder,
        context: sign.context,
        type: "authenticated",
        signature: sign.signature,
        api_key: sign.apiKey,
      }))
        form.set(key, value);
      form.set("file", file);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${sign.cloudName}/${sign.resource_type}/upload`,
        { method: "POST", body: form },
      );
      if (!response.ok) throw new Error("Cloudinary rejected the upload.");
      const asset = await response.json();
      await api(`/reports/${draft.id}/media/verify`, {
        method: "POST",
        body: JSON.stringify({
          publicId: asset.public_id,
          resourceType: sign.resource_type,
          mimeType: file.type,
          kind,
        }),
      });
      await queryClient.invalidateQueries({
        queryKey: ["report-draft", draft.id],
      });
      setMessage(
        "Evidence uploaded and verified. It remains restricted until moderation allows display.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Upload failed. Your draft remains editable.",
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };
  const removeMedia = useMutation({
    mutationFn: (mediaId: string) =>
      api<void>(`/reports/${draft!.id}/media/${mediaId}`, {
        method: "DELETE",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["report-draft", draft?.id],
      }),
    onError: (error: Error) => setMessage(error.message),
  });
  return (
    <main className="report-page">
      <p className="eyebrow signal">CivicPulse / Report a problem</p>
      <h1>
        What needs <span>attention?</span>
      </h1>
      <p className="lede">
        Describe what you saw in your own words. You do not need to know the
        category, agency, or language.
      </p>
      {!draft ? (
        <form className="report-start" onSubmit={begin}>
          <label>
            What happened?
            <textarea
              name="description"
              rows={6}
              placeholder="Describe the problem, where it is, and how it is affecting people."
            />
          </label>
          <label>
            Landmark or address (optional)
            <input name="typedLocation" placeholder="e.g. beside Kuto Market" />
          </label>
          <button
            className="button button--primary"
            disabled={create.isPending}
          >
            {create.isPending ? "Creating draft…" : "Continue"}
          </button>
        </form>
      ) : (
        <section className="report-workspace">
          <div className="report-step">
            <p className="eyebrow">01 / EVIDENCE</p>
            <h2>Add what you have</h2>
            <label className="button">
              <Icon name="gallery" />
              {uploading ? "UPLOADING…" : "ADD IMAGE, AUDIO, OR VIDEO"}
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/wav,audio/webm,video/mp4,video/webm,video/quicktime"
                onChange={upload}
                disabled={uploading}
              />
            </label>
            {resumed.data?.media.map((item) => (
              <div className="form-message" key={item.id}>
                <span>
                  {item.media_kind ?? "evidence"} ·{" "}
                  {Math.ceil(item.bytes / 1000)} KB
                </span>{" "}
                <button
                  className="button"
                  type="button"
                  disabled={removeMedia.isPending}
                  onClick={() => removeMedia.mutate(item.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="report-step">
            <p className="eyebrow">02 / LOCATION</p>
            <h2>Confirm the place</h2>
            <button
              type="button"
              className="button button--ink"
              onClick={useLocation}
            >
              <Icon name="location" /> Use device location
            </button>
            <MapPinPicker
              value={activeLocation}
              onPick={(pin) =>
                persistLocation({ ...pin, source: "MAP", confirmed: true })
              }
            />
            <form className="coordinate-form" onSubmit={confirmManual}>
              <label>
                Latitude
                <input
                  name="latitude"
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  defaultValue={activeLocation?.latitude}
                  required
                />
              </label>
              <label>
                Longitude
                <input
                  name="longitude"
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  defaultValue={activeLocation?.longitude}
                  required
                />
              </label>
              <button className="button" type="submit">
                Confirm typed coordinates
              </button>
            </form>
            {activeLocation && (
              <p className="form-message">
                Location confirmed at {activeLocation.latitude.toFixed(5)},{" "}
                {activeLocation.longitude.toFixed(5)}.
              </p>
            )}
          </div>
          <div className="report-step">
            <p className="eyebrow">03 / SUBMIT</p>
            <h2>Send your civic signal</h2>
            <p>
              Your report is saved first, then processed asynchronously. A
              result is never fabricated while a provider is unavailable.
            </p>
            <button
              className="button button--signal"
              disabled={!activeLocation || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "SUBMITTING…" : "SUBMIT REPORT"}
            </button>
          </div>
        </section>
      )}
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
    </main>
  );
}
