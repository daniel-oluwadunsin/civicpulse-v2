import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
if (env.cloudinaryConfigured)
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME!,
    api_key: env.CLOUDINARY_API_KEY!,
    api_secret: env.CLOUDINARY_API_SECRET!,
    secure: true,
  });
export const allowedMedia = new Map([
  ["image", ["image/jpeg", "image/png", "image/webp"]],
  ["audio", ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm"]],
  ["video", ["video/mp4", "video/webm", "video/quicktime"]],
]);
export const mediaLimits = {
  image: { bytes: 15_000_000, count: 8 },
  audio: { bytes: 25_000_000, count: 3 },
  video: { bytes: 100_000_000, count: 3 },
} as const;
export function assertCloudinaryConfigured() {
  if (!env.cloudinaryConfigured)
    throw new AppError(
      503,
      "MEDIA_UNAVAILABLE",
      "Media uploads are not configured.",
    );
}
export function signUpload(input: {
  reportId: string;
  kind: "image" | "audio" | "video";
  mimeType: string;
  bytes: number;
}) {
  assertCloudinaryConfigured();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${env.CLOUDINARY_EVIDENCE_FOLDER}/${input.reportId}`;
  const params = {
    timestamp,
    folder,
    type: "authenticated",
    context: `report_id=${input.reportId}|kind=${input.kind}|mime_type=${input.mimeType}|declared_bytes=${input.bytes}`,
  };
  return {
    ...params,
    resource_type: input.kind === "image" ? "image" : "video",
    signature: cloudinary.utils.api_sign_request(
      params,
      env.CLOUDINARY_API_SECRET!,
    ),
    apiKey: env.CLOUDINARY_API_KEY!,
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
  };
}

export function signEvidenceUpload(input: {
  scopeId: string;
  purpose: "GOVERNMENT" | "INTERVENTION" | "ORGANIZATION" | "AVATAR";
  kind: "image" | "audio" | "video";
  mimeType: string;
  bytes: number;
}) {
  assertCloudinaryConfigured();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${env.CLOUDINARY_EVIDENCE_FOLDER}/${input.purpose.toLowerCase()}/${input.scopeId}`;
  const params = {
    timestamp,
    folder,
    type: "authenticated",
    context: `scope_id=${input.scopeId}|purpose=${input.purpose}|kind=${input.kind}|mime_type=${input.mimeType}|declared_bytes=${input.bytes}`,
  };
  return {
    ...params,
    resource_type: input.kind === "image" ? "image" : "video",
    signature: cloudinary.utils.api_sign_request(
      params,
      env.CLOUDINARY_API_SECRET!,
    ),
    apiKey: env.CLOUDINARY_API_KEY!,
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
  };
}

export function signAvatarUpload(input: {
  userId: string;
  mimeType: string;
  bytes: number;
}) {
  return signEvidenceUpload({
    scopeId: input.userId,
    purpose: "AVATAR",
    kind: "image",
    mimeType: input.mimeType,
    bytes: input.bytes,
  });
}

export async function destroyAsset(
  publicId: string,
  resourceType: "image" | "video",
) {
  assertCloudinaryConfigured();
  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    invalidate: true,
  });
}
export async function verifyAsset(
  publicId: string,
  resourceType: "image" | "video",
) {
  assertCloudinaryConfigured();
  return cloudinary.api.resource(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    context: true,
  });
}
export function authenticatedAssetUrl(
  publicId: string,
  resourceType: "image" | "video",
  format?: string | null,
) {
  assertCloudinaryConfigured();
  if (!format)
    throw new AppError(
      409,
      "MEDIA_FORMAT_MISSING",
      "Verified evidence is missing its delivery format.",
    );
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: resourceType,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 300,
    attachment: false,
  });
}
