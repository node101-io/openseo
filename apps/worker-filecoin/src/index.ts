const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
};

interface Env {
  FILECOIN_BUCKET: R2Bucket;
  WORKER_API_KEY: string;
}

function getApiKeyFromRequest(request: Request): string | null {
  const fromHeader = request.headers.get("X-API-Key");
  if (fromHeader) return fromHeader;
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

function checkWorkerAuth(request: Request, env: Env): boolean {
  const key = getApiKeyFromRequest(request);
  return key === env.WORKER_API_KEY;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function generateCID(content: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `Qm${hex.substring(0, 44)}`;
}

function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname.startsWith("/html_file/") && request.method === "GET") {
      const cid = decodeURIComponent(url.pathname.slice("/html_file/".length));
      if (!cid) return jsonResponse({ success: false, error: "CID is required" }, 400);

      const object = await env.FILECOIN_BUCKET.get(cid);
      if (!object) {
        return jsonResponse({ success: false, error: `File not found for CID: ${cid}` }, 404);
      }
      const file = await object.text();
      const uploadedTime = (object.customMetadata?.uploadedTime as string) ?? formatDateTime(new Date());

      return jsonResponse({
        success: true,
        cid,
        file,
        uploadedTime,
      });
    }

    if (url.pathname === "/list" && request.method === "GET") {
      try {
        const listed = await env.FILECOIN_BUCKET.list({ limit: 1000 });
        const cids = (listed.objects ?? []).map((o: { key: string }) => o.key);
        return jsonResponse({ success: true, cids });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return jsonResponse({ success: false, error: msg }, 500);
      }
    }

    if (url.pathname === "/send_file" && request.method === "POST") {
      if (!checkWorkerAuth(request, env)) {
        return jsonResponse({ success: false, error: "Unauthorized" }, 401);
      }
      let body: { file?: string };
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
      }
      const file = body.file;
      if (!file || typeof file !== "string") {
        return jsonResponse({ error: "file is required and must be a string" }, 400);
      }

      const cid = await generateCID(file);
      const uploadedTime = formatDateTime(new Date());

      try {
        await env.FILECOIN_BUCKET.put(cid, file, {
          customMetadata: { uploadedTime },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return jsonResponse({ success: false, error: "R2 upload failed", detail: msg }, 500);
      }

      return jsonResponse({
        success: true,
        cid,
        message: "File stored successfully in filecoin",
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};
