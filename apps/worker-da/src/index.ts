export { DABroadcast } from "./da";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
};

const KV_KEY_SUBMISSIONS = "submissions";

interface DASubmission {
  root: string;
  keywords: string[];
  keywordScores: { keyword: string; score: number }[];
  rawKeywordScores?: number[];
  siteUrl: string;
  proof: string;
  totalScore?: number;
  timestamp: number;
}

interface Env {
  DA_KV: KVNamespace;
  DA_BROADCAST: DurableObjectNamespace;
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

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...headers },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      const id = env.DA_BROADCAST.idFromName("default");
      const stub = env.DA_BROADCAST.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === "/submit_proof" && request.method === "POST") {
      if (!checkWorkerAuth(request, env)) {
        return jsonResponse({ success: false, error: "Unauthorized" }, 401);
      }
      let body: { proof?: string; root?: string; keywords?: string[]; keywordScores?: { keyword: string; score: number }[]; siteUrl?: string; totalScore?: number };
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
      }
      const { proof, root, keywords, keywordScores, siteUrl, totalScore } = body;
      const rawKeywordScores = (body as any).rawKeywordScores as number[] | undefined;
      if (!proof || !root || !keywords || !keywordScores || !siteUrl) {
        return jsonResponse({ success: false, error: "Missing required fields: proof, root, keywords, siteUrl" }, 400);
      }
      
      const submission: DASubmission = {
        root,
        keywords,
        keywordScores: keywordScores!,
        rawKeywordScores,
        siteUrl,
        proof,
        totalScore,
        timestamp: Date.now(),
      };

      const existing = await env.DA_KV.get(KV_KEY_SUBMISSIONS);
      const list: DASubmission[] = existing ? JSON.parse(existing) : [];
      const idx = list.findIndex((s) => s.root.toLowerCase().replace(/^0x/, "") === root.toLowerCase().replace(/^0x/, ""));
      if (idx >= 0) list[idx] = submission;
      else list.push(submission);
      await env.DA_KV.put(KV_KEY_SUBMISSIONS, JSON.stringify(list));

      const broadcastPayload = JSON.stringify({
        type: "da_broadcast",
        data: {
          root: submission.root,
          keywords: submission.keywords,
          keywordScores: submission.keywordScores,
          rawKeywordScores: submission.rawKeywordScores,
          siteUrl: submission.siteUrl,
          proof: submission.proof,
          totalScore: submission.totalScore,
        },
      });
      const doId = env.DA_BROADCAST.idFromName("default");
      const stub = env.DA_BROADCAST.get(doId);
      let sent = 0;
      try {
        const broadcastRes = await stub.fetch("http://do/broadcast", {
          method: "POST",
          body: broadcastPayload,
          headers: { "Content-Type": "text/plain" },
        });
        if (broadcastRes.ok) {
          const out = (await broadcastRes.json()) as { ok?: boolean; sent?: number };
          sent = typeof out?.sent === "number" ? out.sent : 0;
        }
      } catch (e) {
        console.error("[DA] Broadcast to DO failed:", e);
      }

      return jsonResponse({
        success: true,
        message: "Proof broadcast; indexers that are connected will receive it.",
        sent,
      });
    }

    if (url.pathname === "/ws-count" && request.method === "GET") {
      try {
        const doId = env.DA_BROADCAST.idFromName("default");
        const stub = env.DA_BROADCAST.get(doId);
        const res = await stub.fetch("http://do/count");
        if (res.ok) {
          const data = (await res.json()) as { count?: number };
          return jsonResponse({ connected: data.count ?? 0 });
        }
      } catch (e) {
        console.error("[DA] ws-count failed:", e);
      }
      return jsonResponse({ connected: 0 });
    }

    if (url.pathname === "/submissions" && request.method === "GET") {
      const raw = await env.DA_KV.get(KV_KEY_SUBMISSIONS);
      const list: DASubmission[] = raw ? JSON.parse(raw) : [];
      return jsonResponse({
        success: true,
        count: list.length,
        submissions: list.map((s) => ({
          proof: s.proof,
          root: s.root,
          siteUrl: s.siteUrl,
          keywords: s.keywords,
          keywordScores: s.keywordScores,
          totalScore: s.totalScore,
          rawKeywordScores: s.rawKeywordScores,
          timestamp: s.timestamp,
        })),
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};