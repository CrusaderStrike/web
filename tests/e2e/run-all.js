// Runs every *.e2e.js suite against a static server for THIS checkout on a free port (no stale :8765 server),
// sequentially, CS_E2E_RUNS times each (default 1). Usage: NODE_PATH=... node tests/e2e/run-all.js [suite ...]
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webp': 'image/webp' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(ROOT, p); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(d); });
});
srv.listen(0, '127.0.0.1', () => {
  const port = srv.address().port, runs = +process.env.CS_E2E_RUNS || 1;
  const suites = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(__dirname).filter(f => f.endsWith('.e2e.js')).sort();
  let failed = 0;
  const { spawn } = require('child_process');
  const queue = []; suites.forEach(s => { for (let i = 1; i <= runs; i++) queue.push([s, i]); });
  const next = () => {
    if (!queue.length) { srv.close(); console.log(failed ? 'RESULT FAIL ' + failed + ' run(s)' : 'RESULT ALL PASS'); process.exit(failed ? 1 : 0); }
    const [s, i] = queue.shift(); let out = '';
    const c = spawn(process.execPath, [path.join(__dirname, path.basename(s))], { env: { ...process.env, CS_E2E_PORT: String(port) } });
    c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
    c.on('close', code => {
      const pass = (out.match(/^PASS /mg) || []).length, fail = (out.match(/^FAIL /mg) || []).length;
      if (code || fail) { failed++; console.log(out.split('\n').filter(l => !/^PASS /.test(l)).join('\n')); }
      console.log(`${path.basename(s)} run ${i}: ${pass} pass, ${fail} fail, exit ${code}`); next();
    });
  };
  next();
});
