const encoder = new TextEncoder();

function bearerToken(request) {
  const header = String(request.headers.get("authorization") || "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : "";
}

async function sha256(value) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(String(value || "")))
  );
}

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function hasValidUploadApiKey(request, expectedKey) {
  const expected = String(expectedKey || "").trim();
  const provided = bearerToken(request);
  if (!expected || !provided) return false;
  const [providedDigest, expectedDigest] = await Promise.all([
    sha256(provided),
    sha256(expected),
  ]);
  return equalBytes(providedDigest, expectedDigest);
}
