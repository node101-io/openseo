export class DABroadcast {
  private state: DurableObjectState;
  private sessions: Set<WebSocket> = new Set();

  constructor(state: DurableObjectState, _env: Record<string, unknown>) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      this.sessions.add(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname === "/count" && request.method === "GET") {
      return new Response(JSON.stringify({ count: this.sessions.size }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const payload = await request.text();
      let sent = 0;
      const toRemove: WebSocket[] = [];
      for (const ws of this.sessions) {
        try {
          ws.send(payload);
          sent++;
        } catch (_) {
          toRemove.push(ws);
        }
      }
      for (const ws of toRemove) this.sessions.delete(ws);
      return new Response(JSON.stringify({ ok: true, sent }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  }

  webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): void {
  }

  webSocketClose(ws: WebSocket): void {
    this.sessions.delete(ws);
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    this.sessions.delete(ws);
  }
}