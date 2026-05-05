# CORS (Cross-Origin Resource Sharing) Explained

**Last updated:** 2026-05-05 - first encountered while deploying Tasklog to a phone home-server (existing CORS config in the backend prompted the question).

## Mental model

CORS is **a browser-enforced policy** that decides whether JavaScript on one origin is allowed to **read responses** from a different origin. It is not a server-side authentication mechanism. Any non-browser client (curl, another server, a script) ignores CORS entirely.

## Why it exists

In the early web, JavaScript on `evil.com` could fetch from `bank.com` while you were logged into your bank, read the response, and send it back to evil.com's owner. The browser was the only common element that could see this happening (the server has no idea who is hosting the page making the request).

The browser's defense became the **Same-Origin Policy**: by default, JS on origin A cannot read responses from origin B. CORS is the controlled way for origin B to **opt in** to letting origin A read its responses.

An "origin" is the triple `(scheme, host, port)`: `http://localhost:3000` and `http://localhost:5115` are different origins because the ports differ.

## How it actually works

The dance, simplified, when JS on `evil.com` calls `fetch("http://192.168.1.51:5115/api/tasks")`:

1. Browser notices: this request crosses origins.
2. For "non-simple" requests (anything with custom headers, methods like `PUT`/`DELETE`, etc.), the browser first sends a **preflight** `OPTIONS` request to the server: "Hi, I'm `evil.com` and I want to do this. Do you allow it?"
3. Server responds with CORS headers:
   - `Access-Control-Allow-Origin: <origin>` or `*`
   - `Access-Control-Allow-Methods: GET, POST, ...`
   - `Access-Control-Allow-Headers: ...`
4. If the preflight is OK, the browser sends the real request.
5. The browser then decides: based on the response headers, **do I let the JS see this response?**

Critical detail: the server **received and ran the request anyway**. CORS only controls whether the *response* is visible to the JS. For state-changing requests (`POST /api/tasks`), the side effect already happened by the time the browser hides the response. (CSRF is the related but different attack that exploits this.)

## Common misconceptions

- **"CORS protects my server from unauthorized requests."** No. CORS protects users' browsers from leaking responses to malicious sites. It's a client-side barrier. Anyone with `curl` ignores it.
- **"`Access-Control-Allow-Origin: *` is always insecure."** It depends. For a public read-only API (weather, sports scores), `*` is fine. For an API returning per-user data with cookie auth, `*` is dangerous because malicious sites can make the user's logged-in browser send cookies and read responses. (Note: the spec doesn't allow `*` together with credentials, so cookie auth + `*` actually fails by design.)
- **"Disabling CORS makes things more secure."** No. Restrictive CORS makes JS-from-other-origins fail. Restrictive CORS does nothing about non-browser clients.
- **"CORS prevents CSRF."** No. CSRF and CORS overlap but solve different problems. CSRF is mitigated by tokens, SameSite cookies, and same-origin checks - not by CORS.

## When it matters in practice

### LAN-only single-user app with no auth (Tasklog phone deploy)

Risk surface:
- API only reachable on the LAN (no port forward).
- No login, no sensitive data outside the LAN.
- "Allow any origin" means: a malicious website you visit while on home wifi, **knowing your specific IP**, could make your browser hit the API.

Verdict: low real-world risk. "Allow any origin" is fine.

### Same app once you port-forward to the internet

Risk surface explodes:
- Anyone can hit the API with `curl` directly (CORS doesn't matter for that).
- Any website any user visits could make their browser hit your API and read responses.

Mitigation: at minimum tighten CORS to known origins (`https://yourdomain.com`), and add real authentication. CORS alone is not enough.

### Frontend on `domain.com` calling backend on `api.domain.com`

These are different origins. Backend must explicitly allow `https://domain.com` in `Access-Control-Allow-Origin`, or use a reverse proxy so both appear under the same origin. The latter is usually cleaner.

### Frontend and backend on the same origin via a reverse proxy

When nginx / Caddy / Next.js rewrites route both `/api/*` and `/` to different services under the same domain, the browser sees no cross-origin request at all. CORS becomes irrelevant. This is why production deploys often skip CORS entirely.

## Configuration in common stacks

### ASP.NET Core (Tasklog's backend)

In `Program.cs`:
```csharp
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));
// ...
app.UseCors();
```

For production, replace `AllowAnyOrigin()` with `WithOrigins("https://your.domain")`.

### Express / Fastify

Use the `cors` middleware package. Defaults to `*`; you should set `origin: "https://your.domain"` for production.

## Further reading

- MDN on CORS: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
- Fetch spec, CORS protocol: https://fetch.spec.whatwg.org/#http-cors-protocol
- Why `*` and credentials together don't work: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSNotSupportingCredentials
