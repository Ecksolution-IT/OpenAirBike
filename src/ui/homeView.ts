import type { App } from '../app/app';
import { download } from '../persistence/export';
import { h, navigate, setText, type View } from './dom';
import { fmt, i18n, t } from './i18n';

export function homeView(app: App): View {
  return (root) => {
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    const showError = (err: unknown) => {
      // The user closing the chooser is not an error worth shouting about.
      if (err instanceof DOMException && err.name === 'NotFoundError') return;
      error.textContent = err instanceof Error ? err.message : String(err);
      error.hidden = false;
    };
    const run = (action: () => Promise<unknown>) => () => {
      error.hidden = true;
      action().catch(showError);
    };

    // Sessions interrupted by closing the app while recording; their samples are saved.
    const draftBanner = h('div', { class: 'card banner', hidden: true });
    const showUnfinished = () =>
      void app.unfinishedSessions().then(([session]) => {
        draftBanner.hidden = !session;
        if (!session) return;
        draftBanner.replaceChildren(
          h('p', {}, t.unfinishedFound(fmt.dateTime(session.startedAt))),
          h('div', { class: 'row' },
            h('button', { onclick: run(async () => {
              await app.recoverSession(session.id);
              navigate(`#/workout/${session.id}`);
            }) }, t.save),
            h('button', { class: 'secondary', onclick: run(async () => {
              await app.deleteSession(session.id);
              showUnfinished();
            }) }, t.discard),
          ),
        );
      });
    showUnfinished();

    const statusDot = h('span', { class: 'dot' });
    const statusText = h('span');
    const bikeName = h('p', { class: 'muted' });
    const actions = h('div', { class: 'row' });
    const preview = h('p', { class: 'preview' });

    const startButton = h('button', { class: 'primary huge', onclick: () => {
      app.startWorkout();
      navigate('#/live');
    } }, t.startWorkout);
    const resumeButton = h('button', { class: 'primary huge', onclick: () => navigate('#/live') }, t.backToWorkout);

    const diagInfo = h('pre');
    const diagConformance = h('table', { class: 'conformance' });
    const diagLog = h('pre', { class: 'log' });
    const diagPackets = h('pre', { class: 'log' });
    const diagnostics = h('details', { class: 'card' },
      h('summary', {}, t.diagnostics),
      h('p', { class: 'muted' }, t.diagnosticsIntro),
      diagInfo,
      h('h3', {}, t.conformance),
      h('p', { class: 'muted' }, t.conformanceIntro),
      diagConformance,
      h('h3', {}, t.log), diagLog,
      h('h3', {}, t.latestPackets), diagPackets,
      h('button', { class: 'secondary', onclick: () =>
        download(`openairbike-capture-${Date.now()}.json`, app.captureReport(), 'application/json') }, t.downloadCapture),
    );

    const view = h('div', { class: 'stack' },
      h('header', { class: 'title' }, h('h1', {}, t.appTitle)),
      !app.bluetoothAvailable &&
        h('div', { class: 'card warning' },
          h('p', {}, t.noBluetooth),
          h('p', {}, t.tryDemo),
        ),
      draftBanner,
      h('section', { class: 'card' },
        h('h2', {}, statusDot, statusText),
        bikeName,
        preview,
        actions,
        error,
      ),
      startButton,
      resumeButton,
      h('nav', { class: 'row' }, h('a', { class: 'button secondary', href: '#/history' }, t.history)),
      diagnostics,
    );
    root.append(view);

    let conformanceKey = '';
    const renderConformance = () => {
      const checks = app.diagnostics();
      const key = JSON.stringify(checks);
      if (key === conformanceKey) return;
      conformanceKey = key;
      diagConformance.replaceChildren(
        h('tbody', {}, checks.map((c) =>
          h('tr', {},
            h('td', {}, h('span', { class: `status ${c.status}` }, c.status)),
            h('td', {}, h('strong', {}, c.title), h('br'), h('span', { class: 'muted' }, c.detail), h('br'), h('code', {}, c.id)),
          ),
        )),
      );
    };

    let actionsKey = '';
    const renderActions = () => {
      const state = app.connectionState;
      const remembered = app.rememberedBike;
      const key = `${state}|${remembered?.id}`;
      if (key === actionsKey) return;
      actionsKey = key;

      const buttons: HTMLElement[] = [];
      if (state === 'disconnected') {
        if (app.bluetoothAvailable) {
          buttons.push(h('button', { onclick: run(() => app.connectBluetooth()) }, t.connectBike));
          if (remembered) {
            buttons.push(h('button', { class: 'secondary', onclick: run(async () => {
              if (!(await app.reconnectRemembered())) throw new Error(t.bikeNotFound(remembered.name));
            }) }, t.reconnectBike(remembered.name)));
          }
        }
        buttons.push(h('button', { class: 'secondary', onclick: run(() => app.connectSimulator()) }, t.useDemoBike));
      } else {
        buttons.push(h('button', { class: 'secondary', onclick: run(() => app.disconnect()) }, t.disconnect));
      }
      actions.replaceChildren(...buttons);
    };

    const update = () => {
      const state = app.connectionState;
      const recording = app.recorder !== undefined;
      statusDot.className = `dot ${state}`;
      setText(statusText, t.state[state]);
      const info = app.bikeInfo;
      setText(bikeName, info ? [info.name, info.manufacturer, info.model].filter(Boolean).join(' · ') : '');
      renderActions();

      const s = app.telemetry.current();
      preview.hidden = !s;
      if (s) setText(preview, `${fmt.number(s.powerW)} W · ${fmt.number(s.cadenceRpm)} ${t.cadenceUnit} · ${fmt.number(s.speedKmh, 1)} km/h`);

      startButton.hidden = recording;
      startButton.disabled = state !== 'connected';
      resumeButton.hidden = !recording;

      if (diagnostics.open) {
        setText(diagInfo, JSON.stringify(info ?? { status: t.noBike }, null, 2));
        renderConformance();
        setText(diagLog, app.log.slice(-40).join('\n'));
        setText(
          diagPackets,
          app.capture.slice(-12).map((p) => `${new Date(p.receivedAt).toLocaleTimeString(i18n.locale)}  ${p.characteristic}  ${p.hex}`).join('\n'),
        );
      }
    };

    update();
    diagnostics.addEventListener('toggle', update);
    const off = app.on('change', update);
    const timer = setInterval(update, 1000);
    return () => {
      off();
      clearInterval(timer);
    };
  };
}
