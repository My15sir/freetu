
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { uploadToTelegramChannel } from "@/lib/tgChannelUpload.mjs";

const browserHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function POST(request) {
  const { env } = getCloudflareContext();
  return uploadToTelegramChannel(request, env, {
    responseHeaders: browserHeaders,
  });
}
