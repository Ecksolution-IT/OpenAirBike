import type { App } from '../app/app';
import type { SessionDetail } from '../domain/types';
import { download, exportFileName, sessionToCsv, sessionToJson } from '../persistence/export';
import { h, navigate, type View } from './dom';
import { formatDate, formatDateTime, formatDuration, formatKm, formatNumber } from './format';

export function historyView(app: App): View {
  return (root) => {
    const list = h('div', { class: 'history' }, h('p', { class: 'muted' }, 'Loading…'));
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    root.append(
      h('header', { class: 'title' }, h('a', { class: 'back', href: '#/' }, '‹ Home'), h('h1', {}, 'History')),
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
    } }, 'Export database (.sqlite)');

    void app.listSessions().then((sessions) => {
      if (sessions.length === 0) {
        list.replaceChildren(h('p', { class: 'muted' }, 'No workouts yet. Connect the bike and ride.'));
        return;
      }
      list.replaceChildren(
        ...sessions.map((s) =>
          h('a', { class: 'card history-item', href: `#/workout/${s.id}` },
            h('strong', {}, formatDateTime(s.startedAt), s.status === 'recording' ? ' · unfinished' : ''),
            h('span', {}, formatDuration(s.activeS)),
            h('span', {}, `${formatKm(s.summary?.distanceM)} km`),
            h('span', {}, `${formatNumber(s.summary?.energyKcal)} kcal`),
            h('span', {}, `${formatNumber(s.summary?.avgPowerW)} W avg`),
          ),
        ),
        exportDatabase,
      );
    });
  };
}

export function workoutView(app: App, id: string): View {
  return (root) => {
    const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading…'));
    root.append(
      h('header', { class: 'title' }, h('a', { class: 'back', href: '#/history' }, '‹ History'), h('h1', {}, 'Workout')),
      body,
    );
    void app.getSession(id).then((detail) => {
      body.replaceChildren(...(detail ? renderSession(app, detail) : [h('p', {}, 'Workout not found.')]).filter((el) => el !== null));
    });
  };
}

function renderSession(app: App, detail: SessionDetail): (HTMLElement | null)[] {
  const { session, samples } = detail;
  const s = session.summary;
  const rows: [string, string][] = [
    ['Date', formatDate(session.startedAt)],
    ['Started', new Date(session.startedAt).toLocaleTimeString()],
    ['Duration', formatDuration(session.activeS)],
    ['Distance', `${formatKm(s?.distanceM)} km`],
    ['Calories', `${formatNumber(s?.energyKcal)} kcal`],
    ['Avg Power', `${formatNumber(s?.avgPowerW)} W`],
    ['Max Power', `${formatNumber(s?.maxPowerW)} W`],
    ['Avg RPM', formatNumber(s?.avgCadenceRpm)],
    ['Max RPM', formatNumber(s?.maxCadenceRpm)],
    ['Avg Speed', `${formatNumber(s?.avgSpeedKmh, 1)} km/h`],
    ['Max Speed', `${formatNumber(s?.maxSpeedKmh, 1)} km/h`],
  ];
  if (s?.avgHeartRateBpm !== undefined) {
    rows.push(['Avg HR', `${formatNumber(s.avgHeartRateBpm)} bpm`], ['Max HR', `${formatNumber(s.maxHeartRateBpm)} bpm`]);
  }
  if (session.device) rows.push(['Bike', session.device.name]);

  return [
    h('table', { class: 'card summary' }, h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v))))),
    session.status === 'recovered' ? h('p', { class: 'muted' }, 'Recovered after the app closed during the workout; the last seconds may be missing.') : null,
    session.status === 'recording' ? h('p', { class: 'muted' }, 'This workout was interrupted and is not finished yet. It can be saved from the home screen.') : null,
    h('p', { class: 'muted' }, `${samples.length} samples recorded.`),
    h('div', { class: 'row' },
      h('button', { class: 'secondary', onclick: () => download(exportFileName(session.startedAt, 'json'), sessionToJson(detail), 'application/json') }, 'Export JSON'),
      h('button', { class: 'secondary', onclick: () => download(exportFileName(session.startedAt, 'csv'), sessionToCsv(detail), 'text/csv') }, 'Export CSV'),
      h('button', { class: 'danger', onclick: async () => {
        if (!confirm('Delete this workout? This cannot be undone.')) return;
        await app.deleteSession(session.id);
        navigate('#/history');
      } }, 'Delete'),
    ),
    h('a', { class: 'button primary', href: '#/' }, 'Done'),
  ];
}
