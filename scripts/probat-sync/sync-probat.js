'use strict';
// Incremental PROBAT → Supabase sync.
//
//   node sync-probat.js [--dry-run] [--verbose]
//
// Every run:
//   1. Reads Supabase creds from ~/Projects/felicity-web/doug/.env
//      (STAFF_SUPABASE_URL / STAFF_SUPABASE_SERVICE_KEY).
//   2. Asks the roaster for its history list (read-only commands only).
//   3. Inserts any roast not yet in roast_curves (keyed on
//      metrics->>'probat_history_id') as soon as it is finished (its chart stops
//      growing between two reads 8 s apart), so an in-progress roast is
//      never half-synced. Runs every 2 min via launchd.
//   4. Refreshes name/note/weights on the 10 most recent synced entries —
//      operators often type the roast name on the machine after the fact.
//   5. Links each curve to an existing roast_logs row for the same JST day.
//
// IMPORTANT: this script NEVER inserts into roast_logs. That table is the
// billing source of truth — lib/roast-invoice/aggregate.ts sums green_kg from
// it to produce the monthly FCR invoice, so a fabricated row becomes a real
// over-charge. Curves that find no matching log are simply left unlinked for a
// human to resolve in the UI.
//
// Exit code 0 even when the roaster is unreachable (Mac may boot before the
// LAN) — it just logs and tries again next tick.
//
// Every run also writes probat_sync_status (the staff app's roast page warns
// from it) and sends a Telegram alert when the sync is genuinely broken — see
// alert() below. The roaster is switched off on non-roasting days, so
// "unreachable" alone is normal and never alerts.
const fs = require('fs');
const path = require('path');
const { Probat } = require('./probat-client');

const DRY = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const ENV_FILE = process.env.PROBAT_ENV_FILE || '/Users/doug/Projects/felicity-web/doug/.env';
const STATE_FILE = path.join(__dirname, '.alert-state.json');
const FAIL_ALERT_MIN = 60;        // failing for 1 h before alerting
const UNREACH_ALERT_MIN = 30;     // unreachable for 30 min while roasting is happening
const ROASTING_WINDOW_H = 3;      // "roasting is happening" = a roast_logs row in the last 3 h
// A roast is synced as soon as it is finished. creationDate is NOT the charge
// time — it is reset whenever the entry is saved/renamed on the panel — so age
// can't tell us. Instead, entries younger than MIN_AGE_S have their chart read
// twice STABLE_GAP_MS apart: a roast in progress grows at 1 Hz, a finished one
// doesn't. Older entries are always treated as finished.
const MIN_AGE_S = 20 * 60;
const STABLE_GAP_MS = 8000;
const REFRESH_LAST_N = 10;      // re-check metadata on this many recent entries
const GAP_MS = 80;
const PAGE_CHART = 250;

const log = (...a) => console.log(new Date().toISOString(), ...a);
const vlog = (...a) => VERBOSE && log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UNSET = 123821000; // roaster's "no value" sentinel

// --- env ------------------------------------------------------------------
function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = loadEnv(ENV_FILE);
const SB_URL = env.STAFF_SUPABASE_URL;
const SB_KEY = env.STAFF_SUPABASE_SERVICE_KEY;
if (!SB_URL || !SB_KEY) { console.error('missing STAFF_SUPABASE_* in ' + ENV_FILE); process.exit(1); }

// --- tiny supabase REST client ---------------------------------------------
async function sb(pathname, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${pathname}`, {
    method,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation', ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`supabase ${method} ${pathname}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// --- bean resolution --------------------------------------------------------
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function resolveBean(rawName, aliases, beans) {
  const n = norm(rawName);
  if (!n) return null;
  let best = null;
  for (const a of aliases) {
    const an = norm(a.alias);
    if (an.length >= 3 && n.includes(an) && (!best || an.length > best.len)) best = { bean_id: a.bean_id, len: an.length };
  }
  if (best) return best.bean_id;
  // fallback: first word of the probat name appearing in a bean display name
  for (const b of beans) {
    const dn = norm(b.display_name);
    for (const w of (rawName || '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 5 && dn.includes(w)) return b.id;
    }
  }
  return null;
}

// --- roast maths ------------------------------------------------------------
function mergeByTimestamp(rows) {
  const byTs = new Map();
  for (const r of rows) {
    const cur = byTs.get(r.timestamp);
    if (!cur) { byTs.set(r.timestamp, { ...r }); continue; }
    for (const [k, v] of Object.entries(r)) {
      if (v === null || v === undefined) continue;
      if (k === 'event' && cur.event && cur.event !== v) cur.event = `${cur.event}|${v}`;
      else cur[k] = v;
    }
  }
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function computeMetrics(historyId, entry, samples) {
  const ev = (name) => samples.find((s) => s.event && s.event.includes(name));
  const fill = ev('fillEvent'), tp = ev('turningPoint'), cc = ev('colorChangeEvent'),
    fc = ev('firstCrackBeginningEvent'), clear = ev('clearEvent');
  const last = samples[samples.length - 1];
  const declared = entry.roastingTime && entry.roastingTime !== UNSET ? entry.roastingTime : null;
  const fcT = fc ? fc.timestamp : null;
  // end of roast: discharge event if present, else declared time if sane, else last sample
  const endS = clear ? clear.timestamp : (declared && (!fcT || declared > fcT) ? declared : (last ? last.timestamp : null));
  const dev = fcT !== null && endS > fcT ? endS - fcT : null;
  let crashRor = null;
  if (fcT !== null) {
    const seg = samples.filter((s) => s.timestamp >= fcT && s.timestamp <= endS && s.rateOfRise != null).map((s) => s.rateOfRise);
    if (seg.length) crashRor = Math.min(...seg);
  }
  return {
    probat_history_id: historyId,
    charge_temp_c: entry.fillTemp ?? null,
    drop_temp_c: entry.endTemp ?? null,
    total_time_s: endS,
    turning_point_s: tp ? tp.timestamp : null,
    turning_point_c: tp ? tp.beanTemp ?? null : null,
    color_change_s: cc ? cc.timestamp : null,
    fc_start_s: fcT,
    fc_temp_c: fc ? fc.beanTemp ?? null : null,
    dev_time_s: dev,
    dtr_pct: dev && endS ? +((dev / endS) * 100).toFixed(1) : null,
    min_ror_after_fc: crashRor,
    fill_weight_kg: entry.fillWeight || null,
    end_weight_kg: entry.endWeight || null,
    weight_loss_pct: entry.fillWeight > 0 && entry.endWeight > 0
      ? +(((entry.fillWeight - entry.endWeight) / entry.fillWeight) * 100).toFixed(2) : null,
    is_test_roast: !!entry.isTestRoast,
    sample_count: samples.length,
  };
}

const jstDay = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

// --- status + alerts ----------------------------------------------------------
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { failSince: null, unreachSince: null, alerted: null }; }
}
function writeState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch {}
}

async function telegram(text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ALLOWED_USER_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_ALLOWED_USER_ID, text }),
    });
  } catch (e) { log(`telegram failed: ${e.message}`); }
}

async function roastingNow() {
  const since = new Date(Date.now() - ROASTING_WINDOW_H * 3600e3).toISOString();
  try { return (await sb(`roast_logs?roasted_at=gte.${since}&select=id&limit=1`)).length > 0; } catch { return false; }
}

// status: 'ok' | 'unreachable' | 'failed'. Never throws — it runs on the way out.
async function finish(status, message, extra = {}) {
  const now = new Date().toISOString();
  const row = { id: 'p05', checked_at: now, status, message: message.slice(0, 500), ...extra };
  if (status === 'ok') { row.last_ok_at = now; row.last_reachable_at = now; }
  try { await sb('probat_sync_status', { method: 'POST', body: row, headers: { Prefer: 'resolution=merge-duplicates,return=representation' } }); }
  catch (e) { log(`status write failed: ${e.message.slice(0, 120)}`); }

  if (DRY) process.exit(0);
  // 実行間隔に依存しないよう、回数ではなく「いつから続いているか」で判定する
  const st = readState();
  const t = Date.now();
  st.failSince = status === 'failed' ? st.failSince ?? t : null;
  st.unreachSince = status === 'unreachable' ? st.unreachSince ?? t : null;
  const minsSince = (x) => (x ? Math.floor((t - x) / 60e3) : 0);
  if (status === 'ok' && st.alerted) {
    await telegram(`✅ Probat 取り込み 復旧しました（${message}）`);
    st.alerted = null;
  } else if (!st.alerted && minsSince(st.failSince) >= FAIL_ALERT_MIN) {
    await telegram(`⚠️ Probat 取り込みが ${minsSince(st.failSince)} 分失敗し続けています（Mac mini）\n${message.slice(0, 300)}`);
    st.alerted = 'failed';
  } else if (!st.alerted && minsSince(st.unreachSince) >= UNREACH_ALERT_MIN && (await roastingNow())) {
    await telegram(`⚠️ 焙煎中なのに Mac mini から Probat が見えません（${minsSince(st.unreachSince)}分）\nMac mini の有線LAN（en0）とロースター側ルーターを確認してください。カーブがAIレビューに入りません。`);
    st.alerted = 'unreachable';
  }
  writeState(st);
  process.exit(status === 'failed' ? 1 : 0);
}

// --- main -------------------------------------------------------------------
(async () => {
  // 1. what do we already have?
  const existing = await sb(`roast_curves?source=eq.probat_ws&select=id,roast_log_id,bean_id,roasted_at,metrics&order=roasted_at.desc`);
  const byProbatId = new Map(existing.map((c) => [Number(c.metrics.probat_history_id), c]));
  vlog(`supabase: ${existing.length} probat curves already synced`);

  const aliases = await sb('roast_bean_aliases?select=alias,bean_id');
  const beans = await sb('roast_beans?select=id,display_name');

  // 2. talk to the roaster
  const p = new Probat();
  try { await p.connect(); } catch (e) {
    log(`roaster unreachable (${e.message}) — skipping this run`);
    return finish('unreachable', e.message);
  }
  const total = parseInt((await p.send('getHistorySize')).data.historyListSize, 10);
  const summaries = [];
  for (let s = 0; s < total; s += 100) {
    const res = await p.send('listHistories', { startBlock: s, endBlock: Math.min(s + 100, total) - 1 });
    summaries.push(...(res.data || []));
    await sleep(GAP_MS);
  }
  const nowS = Date.now() / 1000;
  const ageS = (s) => nowS - parseInt(s.creationDate, 10);
  const finished = summaries;
  const fresh = summaries.filter((s) => !byProbatId.has(s.id));
  log(`roaster: ${summaries.length} entries, ${fresh.length} new to sync`);

  async function chartOf(id) {
    const raw = [];
    for (let page = 0; page < 20; page++) {
      const res = await p.send('getHistoryChartData', { historyId: id, startBlock: page * PAGE_CHART, endBlock: (page + 1) * PAGE_CHART - 1 });
      if (res.status !== 'ok' || !Array.isArray(res.data) || !res.data.length) break;
      raw.push(...res.data);
      await sleep(GAP_MS);
      if (res.data.length < PAGE_CHART) break;
    }
    return mergeByTimestamp(raw);
  }

  // 3. sync new roasts
  let created = 0, linked = 0, unlinked = 0, unresolved = [];
  for (const s of fresh) {
    let samples = await chartOf(s.id);
    if (ageS(s) <= MIN_AGE_S) {
      // まだ新しい焙煎は、8秒あけて読み直し、記録が増えていなければ焼き終わり
      const lastT = (xs) => (xs.length ? xs[xs.length - 1].timestamp : -1);
      await sleep(STABLE_GAP_MS);
      const again = await chartOf(s.id);
      if (!samples.length || lastT(again) !== lastT(samples) || again.length !== samples.length) {
        log(`#${s.id} still roasting (last sample ${lastT(again)}s) — next run`);
        continue;
      }
      samples = again;
    }
    const entry = (await p.send('getHistoryEntry', { historyId: s.id })).data || {};
    const name = (entry.name || s.name || s.coffeeName || '').trim();
    const beanId = resolveBean(name, aliases, beans);
    if (!beanId && name) unresolved.push(`#${s.id} "${name}"`);
    const roastedAt = new Date(parseInt(s.creationDate, 10) * 1000).toISOString();
    const metrics = computeMetrics(s.id, { ...s, ...entry }, samples);
    const curve = {
      bean_id: beanId,
      roasted_at: roastedAt,
      machine: 'P05III',
      batch_kg: entry.fillWeight || null,
      source: 'probat_ws',
      filename: `probat:${s.id}`,
      charge_temp_c: metrics.charge_temp_c,
      drop_temp_c: metrics.drop_temp_c,
      total_time_s: metrics.total_time_s,
      fc_start_s: metrics.fc_start_s,
      dtr_pct: metrics.dtr_pct,
      weight_loss_pct: metrics.weight_loss_pct,
      samples: samples.map((x) => ({
        t: x.timestamp, bt: x.beanTemp ?? null, et: x.exhaustAirTemp ?? null,
        gas: x.burner ?? null, air: x.exhaustFan ?? null, drum: x.drum ?? null,
        ror: x.rateOfRise ?? null,
      })),
      events: samples.filter((x) => x.event).map((x) => ({ t: x.timestamp, e: x.event, bt: x.beanTemp ?? null })),
      metrics,
      notes: [name, entry.note].filter(Boolean).join(' — ') || null,
    };
    if (DRY) { log(`[dry] would insert #${s.id} "${name}" bean=${beanId} samples=${samples.length}`); continue; }
    const [ins] = await sb('roast_curves', { method: 'POST', body: curve });
    created++;
    vlog(`inserted #${s.id} "${name}" → ${ins.id} (bean=${beanId ?? 'UNRESOLVED'})`);
    byProbatId.set(s.id, ins);
  }

  // 4. refresh metadata on recent entries (names typed after the roast)
  if (!DRY) {
    const recent = finished.filter((s) => byProbatId.has(s.id)).sort((a, b) => b.id - a.id).slice(0, REFRESH_LAST_N);
    for (const s of recent) {
      const cur = byProbatId.get(s.id);
      const entry = (await p.send('getHistoryEntry', { historyId: s.id })).data || {};
      const name = (entry.name || '').trim();
      const beanId = cur.bean_id || resolveBean(name, aliases, beans);
      const patch = {};
      const notes = [name, entry.note].filter(Boolean).join(' — ') || null;
      if (beanId && !cur.bean_id) patch.bean_id = beanId;
      if (notes) patch.notes = notes;
      if (entry.fillWeight > 0 && entry.endWeight > 0)
        patch.weight_loss_pct = +(((entry.fillWeight - entry.endWeight) / entry.fillWeight) * 100).toFixed(2);
      if (Object.keys(patch).length) {
        await sb(`roast_curves?id=eq.${cur.id}`, { method: 'PATCH', body: patch });
        vlog(`refreshed #${s.id}`, Object.keys(patch).join(','));
      }
      await sleep(GAP_MS);
    }
  }
  p.close();

  // 5. link curves ↔ existing roast_logs, day by day.
  //
  // Bean identity can't be trusted as the join key: the roaster stores whatever
  // the operator typed on the machine ("PNG3.6 final") while the iPad log stores
  // a catalogue bean ("PNG_PREMIUM_BULK"), and the alias table resolves those to
  // *different* bean_ids. Matching on bean alone therefore misses real pairs and
  // used to strand curves. So within a JST day we match in decreasing order of
  // confidence and never pair across days.
  if (!DRY) {
    const orphans = await sb('roast_curves?source=eq.probat_ws&roast_log_id=is.null&select=id,bean_id,roasted_at,batch_kg&order=roasted_at.asc');
    const allLogs = await sb('roast_logs?select=id,bean_id,roasted_at,green_kg&order=roasted_at.asc');
    const taken = new Set((await sb('roast_curves?roast_log_id=not.is.null&select=roast_log_id')).map((r) => r.roast_log_id));

    const logsByDay = new Map();
    for (const l of allLogs) {
      if (taken.has(l.id)) continue;
      const d = jstDay(l.roasted_at);
      if (!logsByDay.has(d)) logsByDay.set(d, []);
      logsByDay.get(d).push(l);
    }
    const curvesByDay = new Map();
    for (const c of orphans) {
      const d = jstDay(c.roasted_at);
      if (!curvesByDay.has(d)) curvesByDay.set(d, []);
      curvesByDay.get(d).push(c);
    }

    const eqKg = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.01;
    for (const [day, curves] of curvesByDay) {
      const pool = logsByDay.get(day) || [];
      const pairs = [];
      const claim = (c, l) => { pairs.push([c, l]); pool.splice(pool.indexOf(l), 1); };
      const rest = [...curves];
      for (const passMatch of [
        (c, l) => l.bean_id === c.bean_id && eqKg(l.green_kg, c.batch_kg), // same bean + same weight
        (c, l) => l.bean_id === c.bean_id,                                  // same bean
        (c, l) => eqKg(l.green_kg, c.batch_kg),                             // same weight (alias divergence)
      ]) {
        for (let i = rest.length - 1; i >= 0; i--) {
          const c = rest[i];
          const l = pool.find((x) => passMatch(c, x));
          if (l) { claim(c, l); rest.splice(i, 1); }
        }
      }
      // whatever is left: pair chronologically, but only if the day is balanced,
      // so an unlogged roast never steals a different roast's log row
      if (rest.length && rest.length === pool.length) {
        rest.sort((a, b) => new Date(a.roasted_at) - new Date(b.roasted_at));
        rest.forEach((c, i) => pairs.push([c, pool[i]]));
      } else {
        unlinked += rest.length;
      }
      for (const [c, l] of pairs) {
        // 豆の正はログ側。カーブの bean_id はローストマシンの自由入力名を
        // エイリアス解決した推定にすぎず、「PNG3.6 final」→ PNG_BAROIDA_WASHED
        // のように別豆へ寄る（2026-07-26 に15本の食い違いを確認）。
        const patch = { roast_log_id: l.id };
        if (l.bean_id && l.bean_id !== c.bean_id) patch.bean_id = l.bean_id;
        await sb(`roast_curves?id=eq.${c.id}`, { method: 'PATCH', body: patch });
        linked++;
      }
    }
  }

  log(`done: +${created} curves, ${linked} newly linked, ${unlinked} left unlinked (no matching roast_logs row)`);
  if (unresolved.length) log(`unresolved bean names (add to roast_bean_aliases): ${unresolved.join(', ')}`);
  return finish('ok', `${summaries.length} entries, +${created} curves, ${linked} linked`, {
    roaster_entries: summaries.length, curves_added: created, unlinked, unresolved_names: unresolved,
  });
})().catch((e) => {
  console.error(new Date().toISOString(), 'SYNC FAILED:', e.message);
  return finish('failed', e.message);
});
