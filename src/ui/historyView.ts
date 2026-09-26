import type { App } from '../app/app';
import type { SessionDetail } from '../domain/types';
import { download, exportFileName, sessionToCsv, sessionToJson } from '../persistence/export';
import { h, navigate, type View } from './dom';
import { fmt, t } from './i18n';

const distanceText = (meters: number | undefined) => {
  const d = fmt.distance(meters);
  return `${d.value} ${d.unit}`;
};

export function historyView(app: App): View {
  return (root) => {
    const list = h('div', { class: 'history' }, h('p', { class: 'muted' }, t.loading));
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    root.append(
      h('header', { class: 'title' }, h('a', { class: 'back', href: '#/' }, t.home), h('h1', {}, t.historyTitle)),
      list,
      error,
    );

    const exportDatabase = h('button', { class: 'secondary', onclick: async () => {
      try {
        const bytes = await app.exportDatabase();
        download(`openairbike-${new Date().toISOString().slice(0, 10)}.sqlite`, bytes, 'application/vnd.sqlite3');
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err);
        error.hidden = false;
      }
    } }, t.exportDatabase);

    void app.listSessions().then((sessions) => {
      if (sessions.length === 0) {
        list.replaceChildren(h('p', { class: 'muted' }, t.noWorkouts));
        return;
      }
      list.replaceChildren(
        ...sessions.map((s) =>
          h('a', { class: 'card history-item', href: `#/workout/${s.id}` },
            h('strong', {}, fmt.dateTime(s.startedAt), s.status === 'recording' ? ` · ${t.unfinished}` : ''),
            h('span', {}, fmt.duration(s.activeS)),
            h('span', {}, distanceText(s.summary?.distanceM)),
            h('span', {}, `${fmt.number(s.summary?.energyKcal)} kcal`),
            h('span', {}, t.avgPower(fmt.number(s.summary?.avgPowerW))),
          ),
        ),
        exportDatabase,
      );
    });
  };
}

export function workoutView(app: App, id: string): View {
  return (root) => {
    const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, t.loading));
    root.append(
      h('header', { class: 'title' }, h('a', { class: 'back', href: '#/history' }, t.backToHistory), h('h1', {}, t.workoutTitle)),
      body,
    );
    void app.getSession(id).then((detail) => {
      body.replaceChildren(...(detail ? renderSession(app, detail) : [h('p', {}, t.workoutNotFound)]).filter((el) => el !== null));
    });
  };
}

function renderSession(app: App, detail: SessionDetail): (HTMLElement | null)[] {
  const { session, samples } = detail;
  const s = session.summary;
  const r = t.row;
  const rows: [string, string][] = [
    [r.date, fmt.date(session.startedAt)],
    [r.started, fmt.time(session.startedAt)],
    [r.duration, fmt.duration(session.activeS)],
    [r.distance, distanceText(s?.distanceM)],
    [r.energy, `${fmt.number(s?.energyKcal)} kcal`],
    [r.avgPower, `${fmt.number(s?.avgPowerW)} W`],
    [r.maxPower, `${fmt.number(s?.maxPowerW)} W`],
    [r.avgCadence, `${fmt.number(s?.avgCadenceRpm)} ${t.cadenceUnit}`],
    [r.maxCadence, `${fmt.number(s?.maxCadenceRpm)} ${t.cadenceUnit}`],
    [r.avgSpeed, `${fmt.number(s?.avgSpeedKmh, 1)} km/h`],
    [r.maxSpeed, `${fmt.number(s?.maxSpeedKmh, 1)} km/h`],
  ];
  if (s?.avgHeartRateBpm !== undefined) {
    rows.push(
      [r.avgHeartRate, `${fmt.number(s.avgHeartRateBpm)} ${t.heartRateUnit}`],
      [r.maxHeartRate, `${fmt.number(s.maxHeartRateBpm)} ${t.heartRateUnit}`],
    );
  }
  if (session.device) rows.push([r.bike, session.device.name]);

  return [
    h('table', { class: 'card summary' }, h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v))))),
    session.status === 'recovered' ? h('p', { class: 'muted' }, t.recoveredNote) : null,
    session.status === 'recording' ? h('p', { class: 'muted' }, t.interruptedNote) : null,
    h('p', { class: 'muted' }, t.samplesRecorded(samples.length)),
    h('div', { class: 'row' },
      h('button', { class: 'secondary', onclick: () => download(exportFileName(session.startedAt, 'json'), sessionToJson(detail), 'application/json') }, t.exportJson),
      h('button', { class: 'secondary', onclick: () => download(exportFileName(session.startedAt, 'csv'), sessionToCsv(detail), 'text/csv') }, t.exportCsv),
      h('button', { class: 'danger', onclick: async () => {
        if (!confirm(t.confirmDelete)) return;
        await app.deleteSession(session.id);
        navigate('#/history');
      } }, t.delete),
    ),
    h('a', { class: 'button primary', href: '#/' }, t.done),
  ];
}
