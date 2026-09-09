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
}) {
  assertCloudinaryConfigured();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${env.CLOUDINARY_EVIDENCE_FOLDER}/${input.reportId}`;
  const params = {
    timestamp,
    folder,
    type: "authenticated",
    context: `report_id=${input.reportId}|kind=${input.kind}`,
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
  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    sign_url: true,
    secure: true,
    format: format ?? undefined,
  });
}
