/**
 * Diagnose / hardware proof (Milestones 0 and "First Ride"): composition root of the developer
 * tool. Wires the Web Bluetooth transport to the probe and the FTMS decoder and renders plain
 * text. The live view shows canonical telemetry only; FTMS details appear in debug mode.
 * No storage, no app state.
 */
import { capabilitiesFromFeatures } from '../../src/adapters/ftms-indoor-bike/canonical';
import { PROFILES, resolveProfile, type DeviceProfile } from '../../src/adapters/profiles';
import { FTMS_SERVICE, uuidName } from '../../src/protocol/ftms/uuids';
import type { TelemetrySample } from '../../src/telemetry/types';
import type { ConnectionState, GattNotification } from '../../src/transport/types';
import { isWebBluetoothAvailable, requestAnyDevice, requestDevice, WebBluetoothTransport } from '../../src/transport/webBluetooth';
import { CaptureLog, type ChooserMode } from './capture';
import { describeLive, PacketDecoder } from './decoder';
import { PROBE_SERVICES, probeDevice, type ProbeReport } from './probe';

const MAX_LOG_LINES = 300;
/** Record times kept to estimate the notification rate (research R11). */
const RATE_WINDOW = 20;

const el = (id: string) => document.getElementById(id) as HTMLElement;
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
const raw = document.getElementById('raw') as HTMLInputElement;

let transport: WebBluetoothTransport | undefined;
let capture: CaptureLog | undefined;
let decoder = new PacketDecoder();
let report: ProbeReport | undefined;
let lastSample: TelemetrySample | undefined;
let profile: DeviceProfile | undefined;
let chooser: ChooserMode = 'ftms';
let deviceName: string | undefined;
let state: ConnectionState = 'disconnected';
let packets = 0;
let recordCount = 0;
let records: number[] = [];
const logLines: string[] = [];

const clock = (at: number) => new Date(at).toISOString().slice(11, 23);

function log(line: string, at = Date.now()) {
  logLines.push(`${clock(at)}  ${line}`);
  if (logLines.length > MAX_LOG_LINES) logLines.splice(0, logLines.length - MAX_LOG_LINES);
  const pre = el('log');
  pre.textContent = logLines.join('\n');
  pre.scrollTop = pre.scrollHeight;
}

function renderStatus() {
  const rate =
    records.length > 1 ? `${((records.length - 1) / ((records[records.length - 1] - records[0]) / 1000)).toFixed(2)} records/s` : '–';
  el('status').textContent = [
    `Connection: ${state}${deviceName ? ` (${deviceName})` : ''}`,
    `Chooser mode: ${chooser}`,
    `Packets: ${packets} · complete records: ${recordCount} · rate: ${rate}`,
    `Raw packets in capture: ${capture?.packetCount ?? 0}`,
  ].join('\n');
  button('disconnect').disabled = !transport || state === 'disconnected';
  button('download').disabled = !capture;
}

function renderProbe() {
  if (!report) return;
  const info = report.deviceInformation;
  el('device').textContent = [
    `Advertised name: ${deviceName ?? '(none)'}`,
    `Device Information: ${Object.entries(info).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}`,
    `Profile: ${profile?.displayName} (${profile?.id})`,
    `Rogue Echo Bike V3 recognised: ${profile?.id === 'rogue-echo-bike-v3' ? 'yes' : 'no'}`,
    ...(report.problems.length ? ['', 'Problems:', ...report.problems.map((p) => `  - ${p}`)] : []),
  ].join('\n');

  el('gatt').textContent =
    report.inventory
      .map((s) => [`${s.uuid}  ${uuidName(s.uuid)}`, ...s.characteristics.map((c) => `  ${c.uuid}  ${uuidName(c.uuid)}  [${c.properties.join(', ')}]`)].join('\n'))
      .join('\n') || '(no accessible services)';

  const f = report.features;
  el('features').textContent = f
    ? [
        `Machine features (0x${f.rawMachineFeatures.toString(16).padStart(8, '0')}): ${f.machineFeatures.join(', ') || 'none'}`,
        `Target setting features (0x${f.rawTargetSettingFeatures.toString(16).padStart(8, '0')}): ${f.targetSettingFeatures.join(', ') || 'none'}`,
        `Subscribed: ${report.subscribed.map((u) => uuidName(u)).join(', ') || 'nothing'}`,
      ].join('\n')
    : 'Not read.';
}

function renderLive() {
  const declared = report?.features && capabilitiesFromFeatures(report.features);
  const header = lastSample ? `Last record ${clock(lastSample.at)}` : 'No complete Indoor Bike Data record yet — start pedalling.';
  el('live').textContent = [header, '', ...describeLive(lastSample, declared)].join('\n');
}

function renderConformance() {
  el('conformance').textContent = decoder
    .conformanceReport()
    .map((c) => `${c.status.toUpperCase().padEnd(8)} ${c.id}  ${c.title}${c.detail ? ` — ${c.detail}` : ''}`)
    .join('\n');
}

function onNotification(n: GattNotification) {
  packets++;
  capture?.packet(n);
  const d = decoder.decode(n);
  log(`${d.name}${raw.checked ? `  [${d.hex}]` : ''}  ${d.text}`, n.receivedAt);
  if (d.telemetry) {
    recordCount++;
    records.push(n.receivedAt);
    if (records.length > RATE_WINDOW) records = records.slice(-RATE_WINDOW);
    lastSample = d.telemetry;
    renderLive();
    renderConformance();
  }
  renderStatus();
}

async function scan(mode: ChooserMode) {
  if (transport) await transport.disconnect();
  let device: BluetoothDevice;
  try {
    device =
      mode === 'all'
        ? await requestAnyDevice(PROBE_SERVICES)
        : await requestDevice({
            services: mode === 'ftms' ? [FTMS_SERVICE] : [],
            namePrefixes: mode === 'names' ? [...new Set(PROFILES.flatMap((p) => p.namePrefixes))] : [],
            optionalServices: PROBE_SERVICES,
          });
  } catch (err) {
    log(`Chooser: ${String(err)}`);
    return;
  }

  chooser = mode;
  deviceName = device.name ?? undefined;
  report = undefined;
  lastSample = undefined;
  profile = undefined;
  packets = 0;
  recordCount = 0;
  records = [];
  decoder = new PacketDecoder();
  const startedAt = Date.now();
  const cap = new CaptureLog(startedAt, mode, deviceName);
  cap.recordPackets = raw.checked;
  capture = cap;
  cap.event(startedAt, 'chosen', `mode=${mode}`);

  const t = new WebBluetoothTransport(device);
  transport = t;
  t.on('state', (s) => {
    state = s;
    cap.event(Date.now(), 'state', s);
    if (s === 'reconnecting') decoder.linkLost();
    log(`Connection: ${s}`);
    renderStatus();
  });
  t.on('log', (line) => log(line));
  t.on('notification', onNotification);

  try {
    await t.connect(async (link) => {
      const r = await probeDevice(link, {
        log: (line) => log(line),
        read: (service, characteristic, value) => cap.read(Date.now(), service, characteristic, value),
      });
      report = r;
      decoder.setDevice(r);
      profile = resolveProfile({ name: deviceName, ...r.deviceInformation });
      cap.setProbe(r, { id: profile.id, name: profile.displayName });
      cap.event(Date.now(), 'setup', `${r.subscribed.length} subscription(s), ${r.problems.length} problem(s)`);
      renderProbe();
      renderLive();
      renderConformance();
    });
  } catch (err) {
    cap.event(Date.now(), 'error', String(err));
    log(`Connect failed: ${String(err)}`);
  }
  renderStatus();
}

function download() {
  if (!capture) return;
  const json = JSON.stringify(capture.toJSON(new Date(), navigator.userAgent), null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `openairbike-capture-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

if (!isWebBluetoothAvailable()) {
  el('unsupported').hidden = false;
  for (const id of ['scan-ftms', 'scan-names', 'scan-all']) button(id).disabled = true;
}
button('scan-ftms').onclick = () => void scan('ftms');
button('scan-names').onclick = () => void scan('names');
button('scan-all').onclick = () => void scan('all');
button('disconnect').onclick = () => void transport?.disconnect();
button('download').onclick = download;
const debug = document.getElementById('debug') as HTMLInputElement;
debug.onchange = () => document.body.classList.toggle('debug', debug.checked);
// Release the bike when the page goes away, so the console or another app can connect.
window.addEventListener('pagehide', () => void transport?.disconnect());
raw.onchange = () => {
  if (capture) capture.recordPackets = raw.checked;
};
renderStatus();
