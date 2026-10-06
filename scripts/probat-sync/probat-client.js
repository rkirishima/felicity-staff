'use strict';
// Minimal client for the PROBAT "Pilot Roaster Specialty" WebSocket API.
// Protocol (reverse-engineered from main.*.js):
//   transport : ws://<host>/WebSocket , newline-delimited JSON
//   request   : {"command":"<cmd>","roasterID":0,"params":{...},"id":<n>}
//   response  : {"id":<n>,"status":"ok"|"error","roasterID":0,"data":<any>}
//   unsolicited push frames carry a "pushMessage" property and have no id.
const WebSocket = require('ws');
const { findRoaster } = require('./discover');

// Nothing is hardcoded. The roaster runs DHCP (getNetworkConfiguration ->
// {"type":"dhcp"}) so its address can change on its own, and the Mac may be
// dual-homed on two overlapping 192.168.11.0/24 networks — so the *source
// interface* matters as much as the address (the default route points at the
// wrong LAN, where a different device also answers on .2). discover.js resolves
// both. Set PROBAT_HOST + PROBAT_BIND to skip discovery.
const HOST = process.env.PROBAT_HOST || null;
const LOCAL_ADDRESS = process.env.PROBAT_BIND || null;
const MASTER_ID = 0;

class Probat {
  constructor() {
    this.id = 1; this.pending = new Map(); this.pushes = [];
    this.host = HOST; this.localAddress = LOCAL_ADDRESS;
  }

  async connect() {
    if (!this.host || !this.localAddress) {
      const found = await findRoaster();
      if (!found) throw new Error('roaster not found on any local network');
      this.host = found.host;
      this.localAddress = found.localAddress;
    }
    return this.open();
  }

  open() {
    return new Promise((resolve, reject) => {
      // lighttpd's websocket module rejects the upgrade with 400 unless an
      // Origin header is present (browsers always send one; ws does not).
      this.ws = new WebSocket(`ws://${this.host}/WebSocket`, [], {
        localAddress: this.localAddress,
        origin: `http://${this.host}`,
      });
      this.ws.on('open', () => {
        // The UI keeps the socket warm; mirror that so long extractions don't drop.
        this.timer = setInterval(() => this.send('keepAlive').catch(() => {}), 10000);
        resolve();
      });
      this.ws.on('error', reject);
      this.ws.on('message', (buf) => {
        for (const line of buf.toString().split('\n')) {
          if (!line.trim()) continue;
          let msg; try { msg = JSON.parse(line); } catch { continue; }
          if (msg.pushMessage !== undefined) { this.pushes.push(msg); continue; }
          const p = this.pending.get(msg.id);
          if (p) { this.pending.delete(msg.id); p(msg); }
        }
      });
    });
  }

  send(command, params, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      const req = { command, roasterID: MASTER_ID, id };
      if (params !== undefined) req.params = params;
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`timeout: ${command}`)); }, timeoutMs);
      this.pending.set(id, (msg) => { clearTimeout(t); resolve(msg); });
      this.ws.send(JSON.stringify(req) + '\n');
    });
  }

  close() { clearInterval(this.timer); this.ws.close(); }
}

module.exports = { Probat, HOST, LOCAL_ADDRESS };
