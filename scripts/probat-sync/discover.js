'use strict';
// Locate the PROBAT on whatever network it happens to be on.
//
// Two reasons this can't be hardcoded:
//   1. The roaster is on DHCP (getNetworkConfiguration -> {"type":"dhcp"}), so its
//      address can change on its own.
//   2. The Mac is (or was) dual-homed on two overlapping 192.168.11.0/24 networks,
//      so reaching the roaster needs the *right source interface*, not just the
//      right IP — the default route points at the wrong LAN.
//
// Strategy: try the cached {host, localAddress} first, then sweep each local IPv4
// /24 with a cheap TCP connect, confirming with an HTTP HEAD that we found the
// roaster's lighttpd and not some other web device on the same subnet.
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const CACHE = path.join(__dirname, '.roaster-cache.json');
const PORT = 80;
const CONNECT_MS = 400;
const CONCURRENCY = 32;

/** HEAD / and return the raw response head, or null. */
function probe(host, localAddress, timeout = CONNECT_MS) {
  return new Promise((resolve) => {
    let out = '';
    const done = (v) => { try { s.destroy(); } catch {} resolve(v); };
    const s = net.connect({ host, port: PORT, localAddress, timeout });
    s.on('connect', () => s.write('HEAD / HTTP/1.0\r\n\r\n'));
    s.on('data', (d) => { out += d; if (out.length > 512) done(out); });
    s.on('close', () => resolve(out || null));
    s.on('error', () => done(null));
    s.on('timeout', () => done(null));
  });
}

// The roaster serves its Angular bundle from lighttpd. Other devices on these
// LANs run mini_httpd (Buffalo APs) or return nothing, so this is enough to
// tell them apart without fetching the whole page.
const looksLikeRoaster = (head) => !!head && /^HTTP\/1\.[01] 200/.test(head) && /lighttpd/i.test(head);

/** Confirm the host really is a Probat by checking the page title. */
async function confirm(host, localAddress) {
  const body = await new Promise((resolve) => {
    let out = '';
    const s = net.connect({ host, port: PORT, localAddress, timeout: 3000 });
    s.on('connect', () => s.write('GET / HTTP/1.0\r\n\r\n'));
    s.on('data', (d) => { out += d; if (out.length > 4096) { s.destroy(); resolve(out); } });
    s.on('close', () => resolve(out));
    s.on('error', () => resolve(''));
    s.on('timeout', () => { s.destroy(); resolve(out); });
  });
  return /<title>\s*Probat/i.test(body);
}

function localIPv4s() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ iface: name, address: a.address });
    }
  }
  return out;
}

async function sweep(localAddress) {
  const base = localAddress.split('.').slice(0, 3).join('.');
  const self = Number(localAddress.split('.')[3]);
  const targets = [];
  for (let i = 1; i < 255; i++) if (i !== self) targets.push(`${base}.${i}`);

  const hits = [];
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const i = next++;
      if (i >= targets.length) return;
      const host = targets[i];
      if (looksLikeRoaster(await probe(host, localAddress))) hits.push(host);
    }
  }));
  return hits;
}

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return null; }
}

/**
 * @returns {Promise<{host:string, localAddress:string}|null>}
 */
async function findRoaster({ verbose = false } = {}) {
  const log = (...a) => verbose && console.log(...a);

  // 1. cached location, still valid?
  const cached = readCache();
  if (cached?.host && cached?.localAddress) {
    const stillLocal = localIPv4s().some((n) => n.address === cached.localAddress);
    if (stillLocal && looksLikeRoaster(await probe(cached.host, cached.localAddress, 1500))) {
      log(`roaster at cached ${cached.host} via ${cached.localAddress}`);
      return cached;
    }
  }

  // 2. sweep every local /24
  for (const { iface, address } of localIPv4s()) {
    log(`scanning ${address}/24 on ${iface}...`);
    for (const host of await sweep(address)) {
      if (await confirm(host, address)) {
        const found = { host, localAddress: address, iface };
        fs.writeFileSync(CACHE, JSON.stringify(found, null, 2));
        log(`found roaster at ${host} via ${iface} (${address})`);
        return found;
      }
    }
  }
  return null;
}

module.exports = { findRoaster, probe, looksLikeRoaster };

if (require.main === module) {
  findRoaster({ verbose: true }).then((r) => {
    console.log(r ? JSON.stringify(r) : 'roaster not found on any local network');
    process.exit(r ? 0 : 1);
  });
}
