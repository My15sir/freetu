export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { uploadToTelegramChannel } from "@/lib/tgChannelUpload.mjs";

const browserHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function POST(request) {
  const { env } = getRequestContext();
  return uploadToTelegramChannel(request, env, {
    responseHeaders: browserHeaders,
  });
}
