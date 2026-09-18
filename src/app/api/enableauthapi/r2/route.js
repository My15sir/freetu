export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { uploadToR2 } from "@/lib/r2Upload.mjs";

const browserHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function POST(request) {
  const { env } = getRequestContext();
  return uploadToR2(request, env, {
    responseHeaders: browserHeaders,
  });
}
