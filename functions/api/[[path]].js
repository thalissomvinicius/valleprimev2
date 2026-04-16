/**
 * Cloudflare Pages Function: Universal API Proxy
 * 
 * This function intercepts ALL requests to /api/* on the Pages domain
 * and proxies them to the Render backend, eliminating CORS entirely.
 * 
 * Route: /functions/api/[[path]].js  → matches /api/*
 */

const RENDER_API = 'https://valleprimev2.onrender.com';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Build target URL: replace pages.dev origin with Render
  const targetUrl = RENDER_API + url.pathname + url.search;

  // Clone request headers (exclude host)
  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-Host', url.hostname);
  headers.delete('host');

  // Forward the request to Render
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'follow',
  });

  try {
    const response = await fetch(proxyRequest);

    // Build response with CORS headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    responseHeaders.set('Access-Control-Max-Age', '86400');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Proxy error: ' + error.message,
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
