import type { Plugin, Connect } from "vite";

// Local-only, fixed-upstream relay. Never logs or persists request bodies or credentials.
export const replicateRelay: Connect.NextHandleFunction = async (
  req,
  res,
  next,
) => {
  if (!req.url?.startsWith("/api/replicate/")) return next();
  const path = req.url.slice("/api/replicate".length);
  const routeAllowed =
    (req.method === "GET" &&
      /^\/v1\/(models\/[\w.-]+\/[\w.-]+(?:\/versions\/[a-f0-9]+)?|predictions\/[a-zA-Z0-9_-]+)$/.test(
        path,
      )) ||
    (req.method === "POST" &&
      (path === "/v1/predictions" ||
        /^\/v1\/models\/[\w.-]+\/[\w.-]+\/predictions$/.test(path)));
  const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
    req.socket.remoteAddress || "",
  );
  const host = req.headers.host || "";
  const trustedHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
  const sameOrigin =
    !req.headers.origin || req.headers.origin === `http://${host}`;
  const send = (status: number, message: string) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ detail: message }));
  };
  if (!local || !trustedHost || !sameOrigin)
    return send(
      403,
      "Replicate relay accepts same-origin localhost requests only.",
    );
  if (!routeAllowed) return send(404, "Unsupported Replicate endpoint.");
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer "))
    return send(401, "Replicate API key required.");
  try {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16 * 1024 * 1024)
        return send(413, "Page image exceeds the 16 MB local relay limit.");
      chunks.push(Buffer.from(chunk));
    }
    const upstream = await fetch(`https://api.replicate.com${path}`, {
      method: req.method,
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        ...(req.method === "POST" ? { Prefer: "wait=60" } : {}),
      },
      body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(75000),
    });
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(await upstream.text());
  } catch {
    send(
      502,
      "Replicate request failed or timed out. Check your connection. A submitted prediction may still incur charges; do not blindly retry.",
    );
  }
};
export function replicatePlugin(): Plugin {
  return {
    name: "local-replicate-relay",
    configureServer(server) {
      server.middlewares.use(replicateRelay);
    },
    configurePreviewServer(server) {
      server.middlewares.use(replicateRelay);
    },
  };
}
