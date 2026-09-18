const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return Response.json(payload, {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function nowMs() {
  return Date.now();
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

async function insertManageLogSafe(db, { id, url, provider, filename, createdAt }) {
  try {
    await db
      .prepare(
        `INSERT INTO img_log (id, url, provider, filename, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(id, url, provider, filename, createdAt)
      .run();
  } catch (_) {
    // Upload success must not be turned into failure by a management-log issue.
  }
}

function telegramFile(response) {
  if (!response?.ok) return null;
  const details = (file) => ({
    fileId: file.file_id,
    fileName: file.file_name || file.file_unique_id,
  });

  if (response.result?.photo) {
    const largest = response.result.photo.reduce((previous, current) =>
      previous.file_size > current.file_size ? previous : current
    );
    return details(largest);
  }
  if (response.result?.video) return details(response.result.video);
  if (response.result?.audio) return details(response.result.audio);
  if (response.result?.document) return details(response.result.document);
  return null;
}

function telegramTarget(contentType, preserveImages) {
  if (contentType.startsWith("image/") && preserveImages) {
    return { endpoint: "sendDocument", field: "document" };
  }
  if (contentType.startsWith("image/")) return { endpoint: "sendPhoto", field: "photo" };
  if (contentType.startsWith("video/")) return { endpoint: "sendVideo", field: "video" };
  if (contentType.startsWith("audio/")) return { endpoint: "sendAudio", field: "audio" };
  return { endpoint: "sendDocument", field: "document" };
}

export async function uploadToTelegramChannel(request, env, options = {}) {
  const {
    imageOnly = false,
    maxBytes = null,
    preserveImages = false,
    uniqueFilename = false,
    responseHeaders = {},
  } = options;

  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) {
    return jsonResponse(
      { status: 500, message: "TG_BOT_TOKEN or TG_CHAT_ID is not set", success: false },
      500,
      responseHeaders
    );
  }
  if (!env.IMG) {
    return jsonResponse(
      { status: 500, message: "D1(IMG) is not bound", success: false },
      500,
      responseHeaders
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (_) {
    return jsonResponse(
      { status: 400, message: "multipart/form-data body is required", success: false },
      400,
      responseHeaders
    );
  }

  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return jsonResponse(
      { status: 400, message: "file is required", success: false },
      400,
      responseHeaders
    );
  }

  const contentType = String(file.type || "application/octet-stream").toLowerCase();
  const forwardedFor = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
  const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "IP not found";
  const referer = request.headers.get("referer") || "Referer";
  if (imageOnly && !IMAGE_MIME_TYPES.has(contentType)) {
    return jsonResponse(
      { status: 415, message: "only JPEG, PNG and WebP images are allowed", success: false },
      415,
      responseHeaders
    );
  }
  if (maxBytes && Number(file.size || 0) > maxBytes) {
    return jsonResponse(
      { status: 413, message: `file exceeds ${maxBytes} bytes`, success: false },
      413,
      responseHeaders
    );
  }

  const requestedName = formData.get("name") || file.name;
  const filename = uniqueFilename
    ? uniqueImageFilename(requestedName, contentType)
    : safeFilename(requestedName);
  const { endpoint, field } = telegramTarget(contentType, preserveImages);
  const telegramUrl = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${endpoint}`;
  const telegramForm = new FormData();
  telegramForm.append("chat_id", env.TG_CHAT_ID);
  telegramForm.append(field, file, filename);

  try {
    const telegramResponse = await fetch(telegramUrl, {
      method: "POST",
      headers: { "User-Agent": "Mozilla/5.0" },
      body: telegramForm,
    });
    const telegramJson = await telegramResponse.json().catch(() => null);
    const storedFile = telegramFile(telegramJson);

    if (!telegramResponse.ok || !storedFile?.fileId) {
      return jsonResponse(
        {
          status: 502,
          message: telegramJson?.description || "Telegram upload failed",
          success: false,
        },
        502,
        responseHeaders
      );
    }

    const requestUrl = new URL(request.url);
    const publicUrl = `${requestUrl.origin}/api/p/${encodeURIComponent(filename)}`;
    const directUrl = `${requestUrl.origin}/api/cfile/${encodeURIComponent(storedFile.fileId)}`;
    const createdAt = nowMs();
    const id = crypto.randomUUID();

    await insertManageLogSafe(env.IMG, {
      id,
      url: `/cfile/${storedFile.fileId}`,
      provider: "tgchannel",
      filename,
      createdAt,
    });

    return jsonResponse(
      {
        code: 200,
        success: true,
        id,
        name: filename,
        url: publicUrl,
        directUrl,
        provider: "tgchannel",
        createdAt,
      },
      200,
      responseHeaders
    );
  } catch (error) {
    return jsonResponse(
      { status: 502, message: error?.message || String(error), success: false },
      502,
      responseHeaders
    );
  }
}
