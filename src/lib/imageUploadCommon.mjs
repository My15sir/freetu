const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return Response.json(payload, {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export function safeFilename(name) {
  const value = String(name || "").trim();
  return value.replace(/[^\w.\-]/g, "_").slice(0, 180) || `img-${Date.now()}.png`;
}

function extensionForMime(contentType) {
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  return "";
}

export function uniqueImageFilename(name, contentType, currentTime = new Date()) {
  const cleaned = safeFilename(name);
  const match = /^(.*?)(\.[A-Za-z0-9]{1,10})?$/.exec(cleaned);
  const rawStem = (match?.[1] || "image").replace(/^\.+|\.+$/g, "") || "image";
  const stem = rawStem.slice(0, 80);
  const extension = extensionForMime(contentType) || String(match?.[2] || "").toLowerCase();
  const date = currentTime.toISOString().slice(0, 10).replaceAll("-", "");
  return `${date}-${crypto.randomUUID()}-${stem}${extension}`;
}


export function publicOrigin(request, env) {
  const configured = String(env?.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:") {
      throw new Error("PUBLIC_BASE_URL must use HTTPS");
    }
    return url.origin;
  }
  return new URL(request.url).origin;
}

export async function insertManageLogSafe(db, { id, url, provider, filename, createdAt }) {
  try {
    await db
      .prepare(
        `INSERT INTO img_log (id, url, provider, filename, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(id, url, provider, filename, createdAt)
      .run();
  } catch (_) {
    // Storage success must not be turned into failure by a management-log issue.
  }
}
