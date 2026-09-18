export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { hasValidUploadApiKey } from "@/lib/uploadApiAuth.mjs";
import { uploadToTelegramChannel } from "@/lib/tgChannelUpload.mjs";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function authError(message, status) {
  return Response.json(
    { status, message, success: false },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Bearer realm="freetu-upload"',
      },
    }
  );
}

export async function POST(request) {
  const { env } = getRequestContext();
  if (!String(env.UPLOAD_API_KEY || "").trim()) {
    return authError("UPLOAD_API_KEY is not configured", 503);
  }
  if (!(await hasValidUploadApiKey(request, env.UPLOAD_API_KEY))) {
    return authError("invalid upload API key", 401);
  }

  return uploadToTelegramChannel(request, env, {
    imageOnly: true,
    maxBytes: MAX_IMAGE_BYTES,
    preserveImages: true,
    uniqueFilename: true,
  });
}
