export const runtime = "nodejs";

type CachedResponse = { status: number; body: string; contentType: string; expiresAt: number };
const cache = new Map<string, CachedResponse>();
const CACHE_TTL_MS = 5_000;

export async function POST(request: Request): Promise<Response> {
  const rpcUrl = process.env.BASE_RPC_URL ?? "https://base-sepolia.g.alchemy.com/v2/demo";
  const body = await request.text();
  const cacheKey = body;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return new Response(cached.body, {
      status: cached.status,
      headers: {
        "content-type": cached.contentType,
        "cache-control": "no-store",
      },
    });
  }

  const upstream = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  });

  const responseBody = await upstream.text();
  cache.set(cacheKey, {
    status: upstream.status,
    body: responseBody,
    contentType: upstream.headers.get("content-type") ?? "application/json",
    expiresAt: now + CACHE_TTL_MS,
  });
  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}