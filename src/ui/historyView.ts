import type { App } from '../app/app';
import type { Workout } from '../recording/workout';
import { download, exportFileName, workoutToCsv, workoutToJson } from '../persistence/export';
import { h, navigate, type View } from './dom';
import { formatDate, formatDateTime, formatDuration, formatKm, formatNumber } from './format';

export function historyView(app: App): View {
  return (root) => {
    const list = h('div', { class: 'history' }, h('p', { class: 'muted' }, 'Loading…'));
    root.append(
      h('header', { class: 'title' }, h('a', { class: 'back', href: '#/' }, '‹ Home'), h('h1', {}, 'History')),
      list,
    );

    void app.store.list().then((workouts) => {
      if (workouts.length === 0) {
        list.replaceChildren(h('p', { class: 'muted' }, 'No workouts yet. Connect the bike and ride.'));
        return;
      }
      list.replaceChildren(
        ...workouts.map((w) =>
          h('a', { class: 'card history-item', href: `#/workout/${w.id}` },
            h('strong', {}, formatDateTime(w.startedAt)),
            h('span', {}, formatDuration(w.summary.durationS)),
            h('span', {}, `${formatKm(w.summary.distanceM)} km`),
            h('span', {}, `${formatNumber(w.summary.energyKcal)} kcal`),
            h('span', {}, `${formatNumber(w.summary.avgPowerW)} W avg`),
          ),
        ),
        h('button', { class: 'secondary', onclick: async () => {
          const all = await app.store.all();
          download(`openairbike-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(all, null, 2), 'application/json');
        } }, 'Export all workouts (JSON)'),
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
    void app.store.get(id).then((workout) => {
      body.replaceChildren(...(workout ? renderWorkout(app, workout) : [h('p', {}, 'Workout not found.')]).filter((el) => el !== null));
    });
  };
}

function renderWorkout(app: App, w: Workout): (HTMLElement | null)[] {
  const s = w.summary;
  const rows: [string, string][] = [
    ['Date', formatDate(w.startedAt)],
    ['Started', new Date(w.startedAt).toLocaleTimeString()],
    ['Duration', formatDuration(s.durationS)],
    ['Distance', `${formatKm(s.distanceM)} km`],
    ['Calories', `${formatNumber(s.energyKcal)} kcal`],
    ['Avg Power', `${formatNumber(s.avgPowerW)} W`],
    ['Max Power', `${formatNumber(s.maxPowerW)} W`],
    ['Avg RPM', formatNumber(s.avgCadenceRpm)],
    ['Max RPM', formatNumber(s.maxCadenceRpm)],
    ['Avg Speed', `${formatNumber(s.avgSpeedKmh, 1)} km/h`],
    ['Max Speed', `${formatNumber(s.maxSpeedKmh, 1)} km/h`],
  ];
  if (s.avgHeartRateBpm !== undefined) {
    rows.push(['Avg HR', `${formatNumber(s.avgHeartRateBpm)} bpm`], ['Max HR', `${formatNumber(s.maxHeartRateBpm)} bpm`]);
  }
  if (w.device) rows.push(['Bike', w.device.name]);

  return [
    h('table', { class: 'card summary' }, h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v))))),
    w.recovered ? h('p', { class: 'muted' }, 'Recovered after the app closed during the workout; the last seconds may be missing.') : null,
    h('p', { class: 'muted' }, `${w.samples.length} samples recorded.`),
    h('div', { class: 'row' },
      h('button', { class: 'secondary', onclick: () => download(exportFileName(w, 'json'), workoutToJson(w), 'application/json') }, 'Export JSON'),
      h('button', { class: 'secondary', onclick: () => download(exportFileName(w, 'csv'), workoutToCsv(w), 'text/csv') }, 'Export CSV'),
      h('button', { class: 'danger', onclick: async () => {
        if (!confirm('Delete this workout? This cannot be undone.')) return;
        await app.store.delete(w.id);
        navigate('#/history');
      } }, 'Delete'),
    ),
    h('a', { class: 'button primary', href: '#/' }, 'Done'),
  ];
}
