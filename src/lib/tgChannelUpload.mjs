import {
  IMAGE_MIME_TYPES,
  insertManageLogSafe,
  jsonResponse,
  publicOrigin,
  safeFilename,
  uniqueImageFilename,
} from "./imageUploadCommon.mjs";

function nowMs() {
  return Date.now();
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
    const telegramText = await telegramResponse.text();
    let telegramJson = null;
    try {
      telegramJson = JSON.parse(telegramText);
    } catch (_) {
      telegramJson = null;
    }
    const storedFile = telegramFile(telegramJson);

    if (!telegramResponse.ok || !storedFile?.fileId) {
      const upstreamStatus = telegramResponse.status || 0;
      const upstreamMessage = telegramJson?.description || `Telegram API HTTP ${upstreamStatus}`;
      console.error(
        `[tgchannel] Telegram upload rejected: status=${upstreamStatus} body=${telegramText.slice(0, 300)}`
      );
      return jsonResponse(
        {
          status: 424,
          message: upstreamMessage,
          upstreamStatus,
          success: false,
        },
        424,
        responseHeaders
      );
    }

    const origin = publicOrigin(request, env);
    const publicUrl = `${origin}/api/p/${encodeURIComponent(filename)}`;
    const directUrl = `${origin}/api/cfile/${encodeURIComponent(storedFile.fileId)}`;
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
        referer,
        clientIp,
        createdAt,
      },
      200,
      responseHeaders
    );
  } catch (error) {
    return jsonResponse(
      { status: 503, message: error?.message || String(error), success: false },
      503,
      responseHeaders
    );
  }
}
