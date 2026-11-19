// silicat-proxy: forwards every request to the home server's public Tailscale Funnel address.
// No packages needed (Node 18+). Config comes from environment variables.
const http = require('http');

const TARGET = process.env.TARGET || 'https://silinet.tail719a6d.ts.net';
const PORT = process.env.PORT || 10000;
const target = new URL(TARGET);

// headers that must not be passed along between hops
const DROP_REQ = ['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection', 'te', 'trailer'];
const DROP_RES = ['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length'];

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, TARGET);
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!DROP_REQ.includes(k)) headers[k] = v;
    }
    headers.host = target.host; // Funnel only answers to its own name

    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? req : undefined,
      duplex: 'half',
      redirect: 'manual',
      signal: AbortSignal.timeout(60000),
    });

    const outHeaders = {};
    upstream.headers.forEach((v, k) => {
      if (!DROP_RES.includes(k)) outHeaders[k] = v;
    });
    res.writeHead(upstream.status, outHeaders);
    if (upstream.body) {
      for await (const chunk of upstream.body) res.write(chunk);
    }
    res.end();
  } catch (e) {
    console.error(new Date().toISOString(), 'upstream error:', e.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('upstream unavailable');
  }
});

server.listen(PORT, () => console.log('silicat-proxy on port', PORT, '->', TARGET));
