export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const upstreamBase = (env?.PDF_UPSTREAM_BASE || "https://valleprimev2.onrender.com").replace(/\/$/, "");
  const upstreamUrl = `${upstreamBase}/api/generate_proposal`;

  const auth = request.headers.get("authorization") || "";
  const contentType = request.headers.get("content-type") || "application/json";

  let bodyText = "";
  try {
    bodyText = await request.text();
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  let resp;
  try {
    resp = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        ...(auth ? { Authorization: auth } : {}),
        Accept: "application/pdf, application/json, text/plain, */*",
      },
      body: bodyText,
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  }

  const contentTypeUpstream = resp.headers.get("content-type") || "application/octet-stream";
  const buf = await resp.arrayBuffer();
  return new Response(buf, {
    status: resp.status,
    headers: {
      "Content-Type": contentTypeUpstream,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

