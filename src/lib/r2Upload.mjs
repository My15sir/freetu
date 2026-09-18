import {
  IMAGE_MIME_TYPES,
  insertManageLogSafe,
  jsonResponse,
  safeFilename,
  uniqueImageFilename,
} from "./imageUploadCommon.mjs";

export async function uploadToR2(request, env, options = {}) {
  const {
    imageOnly = false,
    maxBytes = null,
    uniqueFilename = false,
    responseHeaders = {},
  } = options;

  if (!env.IMGRS) {
    return jsonResponse(
      { status: 500, message: "R2 binding IMGRS is not configured", success: false },
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

  try {
    const putResult = await env.IMGRS.put(filename, file, {
      httpMetadata: { contentType },
    });
    if (!putResult) {
      return jsonResponse(
        { status: 503, message: "R2 put failed", success: false },
        503,
        responseHeaders
      );
    }

    const requestUrl = new URL(request.url);
    const publicUrl = `${requestUrl.origin}/api/p/${encodeURIComponent(filename)}`;
    const directUrl = `${requestUrl.origin}/api/rfile/${encodeURIComponent(filename)}`;
    const createdAt = Date.now();
    const id = crypto.randomUUID();

    await insertManageLogSafe(env.IMG, {
      id,
      url: `/rfile/${filename}`,
      provider: "r2",
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
        provider: "r2",
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
