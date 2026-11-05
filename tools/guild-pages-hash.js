#!/usr/bin/env node
/* web#38: change detection for the hourly guild-pages rebuild.
 * Hashes the generated guild output (g/, guilds/, sitemap.xml) into a stable sha256 and writes
 * guilds-manifest.json at the site root, so the deployed site carries the hash of what it serves.
 * The scheduled workflow run fetches <origin>/guilds-manifest.json and skips the deploy when the hash matches.
 * Usage: node tools/guild-pages-hash.js [--out=.] [--write] [--compare-url=https://crusaderstrike.com/guilds-manifest.json]
 *   Prints changed=true|false (also appended to $GITHUB_OUTPUT when set). Any fetch/parse failure => changed=true.
 */
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const TARGETS = ['g', 'guilds', 'sitemap.xml'];
const MANIFEST = 'guilds-manifest.json';

function listFiles(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return [];
  if (!fs.statSync(p).isDirectory()) return [rel];
  return fs.readdirSync(p).flatMap(n => listFiles(root, rel + '/' + n));
}
function hashOutput(root) {
  const files = TARGETS.flatMap(t => listFiles(root, t)).sort();
  const h = crypto.createHash('sha256');
  for (const f of files) { const b = fs.readFileSync(path.join(root, f)); h.update(f + '\0' + b.length + '\0'); h.update(b); }
  return { hash: h.digest('hex'), files: files.length };
}
function writeManifest(root, info) {
  fs.writeFileSync(path.join(root, MANIFEST), JSON.stringify({ hash: info.hash, files: info.files }) + '\n');
}
function decide(current, deployedText) {
  try { const d = JSON.parse(deployedText); return !(d && typeof d.hash === 'string' && d.hash === current); }
  catch (e) { return true; }
}
async function fetchText(url, fetchImpl) {
  try { const r = await (fetchImpl || fetch)(url, { cache: 'no-store' }); return r.ok ? await r.text() : null; }
  catch (e) { return null; }
}
async function main(argv, fetchImpl) {
  const o = Object.fromEntries(argv.map(a => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v === undefined ? true : v]));
  const root = o.out || '.';
  const info = hashOutput(root);
  if (o.write) writeManifest(root, info);
  let changed = true;
  if (o['compare-url']) { const t = await fetchText(o['compare-url'], fetchImpl); changed = t == null ? true : decide(info.hash, t); }
  const line = 'changed=' + changed;
  console.log('guild output sha256 ' + info.hash + ' (' + info.files + ' files); ' + line);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line + '\nhash=' + info.hash + '\n');
  return { ...info, changed };
}
module.exports = { hashOutput, writeManifest, decide, fetchText, main, TARGETS, MANIFEST };
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
