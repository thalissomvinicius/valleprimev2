export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function onRequestGet({ request, params, env }) {
  const url = new URL(request.url);
  const codigo = params.codigo;
  const t = url.searchParams.get("t") || String(Date.now());

  const upstreamBase = (env?.CONSULTA_UPSTREAM_BASE || "http://177.221.240.85:8000").replace(/\/$/, "");
  const upstream = new URL(`${upstreamBase}/api/consulta/${encodeURIComponent(codigo)}/`);
  upstream.searchParams.set("t", t);

  const allowedPorts = new Set(["", "80", "443", "8080", "8443", "2052", "2053", "2082", "2083", "2086", "2087", "2095", "2096"]);
  if (!allowedPorts.has(upstream.port)) {
    return new Response(JSON.stringify({
      success: false,
      data: [],
      error: `Porta upstream não suportada no Cloudflare Pages Functions: ${upstream.port || "(vazia)"}`
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  }

  let resp;
  try {
    resp = await fetch(upstream.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, data: [], error: String(e) }), {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const body = await resp.text();
  return new Response(body, {
    status: resp.status,
    headers: {
      "Content-Type": resp.headers.get("content-type") || "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}
