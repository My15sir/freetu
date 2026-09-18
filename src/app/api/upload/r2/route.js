
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { uploadToR2 } from "@/lib/r2Upload.mjs";
import { hasValidUploadApiKey } from "@/lib/uploadApiAuth.mjs";

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
  const { env } = getCloudflareContext();
  if (!String(env.UPLOAD_API_KEY || "").trim()) {
    return authError("UPLOAD_API_KEY is not configured", 503);
  }
  if (!(await hasValidUploadApiKey(request, env.UPLOAD_API_KEY))) {
    return authError("invalid upload API key", 401);
  }

  return uploadToR2(request, env, {
    imageOnly: true,
    maxBytes: MAX_IMAGE_BYTES,
    uniqueFilename: true,
  });
}
