const TARGET_ORIGIN = "https://freetu-next16.lijun0515ok.workers.dev";

function rewriteLocation(location, incomingOrigin) {
  if (!location) return location;
  try {
    const url = new URL(location);
    if (url.origin === TARGET_ORIGIN) {
      return `${incomingOrigin}${url.pathname}${url.search}${url.hash}`;
    }
  } catch (_) {
    return location;
  }
  return location;
}

export default {
  async fetch(request) {
    const incomingUrl = new URL(request.url);
    const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, TARGET_ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.set("x-forwarded-host", incomingUrl.host);
    headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));
    headers.set("x-freetu-proxy", "pages");

    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
      init.duplex = "half";
    }

    const upstream = await fetch(new Request(targetUrl, init));
    const responseHeaders = new Headers(upstream.headers);
    const location = responseHeaders.get("location");
    if (location) {
      responseHeaders.set("location", rewriteLocation(location, incomingUrl.origin));
    }
    responseHeaders.set("x-freetu-upstream", "opennext-worker");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  },
};
