import test from "node:test";
import assert from "node:assert/strict";

import { hasValidUploadApiKey } from "../src/lib/uploadApiAuth.mjs";
import {
  safeFilename,
  uniqueImageFilename,
  uploadToTelegramChannel,
} from "../src/lib/tgChannelUpload.mjs";

test("upload API key accepts the expected bearer token", async () => {
  const request = new Request("https://example.test/api/upload/tgchannel", {
    headers: { Authorization: "Bearer expected-secret" },
  });
  assert.equal(await hasValidUploadApiKey(request, "expected-secret"), true);
});

test("upload API key rejects absent and incorrect tokens", async () => {
  const absent = new Request("https://example.test/api/upload/tgchannel");
  const wrong = new Request("https://example.test/api/upload/tgchannel", {
    headers: { Authorization: "Bearer wrong-secret" },
  });
  assert.equal(await hasValidUploadApiKey(absent, "expected-secret"), false);
  assert.equal(await hasValidUploadApiKey(wrong, "expected-secret"), false);
});

test("filenames are sanitized and machine uploads are unique", () => {
  assert.equal(safeFilename("../../cover 中文.jpg"), ".._.._cover___.jpg");
  const first = uniqueImageFilename("spectrogram.png", "image/png", new Date("2026-09-18T00:00:00Z"));
  const second = uniqueImageFilename("spectrogram.png", "image/png", new Date("2026-09-18T00:00:00Z"));
  assert.match(first, /^20260918-[0-9a-f-]+-spectrogram\.png$/);
  assert.notEqual(first, second);
});

test("machine image upload preserves the original file and returns a direct URL", async () => {
  const originalFetch = globalThis.fetch;
  let telegramRequest;
  globalThis.fetch = async (url, options) => {
    telegramRequest = { url: String(url), options };
    return Response.json({
      ok: true,
      result: {
        document: {
          file_id: "telegram-file-id",
          file_name: "spectrogram.png",
        },
      },
    });
  };

  const logged = [];
  const env = {
    TG_BOT_TOKEN: "test-token",
    TG_CHAT_ID: "test-chat",
    IMG: {
      prepare() {
        return {
          bind(...values) {
            return {
              async run() {
                logged.push(values);
              },
            };
          },
        };
      },
    },
  };

  try {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "spectrogram.png", { type: "image/png" }));
    const request = new Request("https://images.example/api/upload/tgchannel", {
      method: "POST",
      body: form,
    });
    const response = await uploadToTelegramChannel(request, env, {
      imageOnly: true,
      maxBytes: 10 * 1024 * 1024,
      preserveImages: true,
      uniqueFilename: true,
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.directUrl, "https://images.example/api/cfile/telegram-file-id");
    assert.match(payload.url, /^https:\/\/images\.example\/api\/p\/20260918-|^https:\/\/images\.example\/api\/p\/\d{8}-/);
    assert.match(telegramRequest.url, /\/sendDocument$/);
    assert.equal(logged.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("machine image upload rejects non-image files before contacting Telegram", async () => {
  const form = new FormData();
  form.append("file", new File(["not an image"], "notes.txt", { type: "text/plain" }));
  const request = new Request("https://images.example/api/upload/tgchannel", {
    method: "POST",
    body: form,
  });
  const response = await uploadToTelegramChannel(request, {
    TG_BOT_TOKEN: "test-token",
    TG_CHAT_ID: "test-chat",
    IMG: {},
  }, { imageOnly: true });
  assert.equal(response.status, 415);
});
