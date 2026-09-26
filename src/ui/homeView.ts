import type { App } from '../app';
import type { ConnectionState } from '../device/types';
import { isWebBluetoothAvailable } from '../device/webBluetooth';
import { download } from '../storage/export';
import { h, navigate, setText, type View } from './dom';
import { formatDateTime, formatDuration, formatNumber } from './format';

const STATE_LABEL: Record<ConnectionState, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
};

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

    const draftBanner = h('div', { class: 'card banner', hidden: true });
    void app.pendingDraft().then((draft) => {
      if (!draft) return;
      draftBanner.replaceChildren(
        h('p', {}, `An unfinished workout from ${formatDateTime(draft.startedAt)} (${formatDuration(draft.summary.durationS)}) was found.`),
        h('div', { class: 'row' },
          h('button', { onclick: run(async () => {
            const workout = await app.recoverDraft();
            if (workout) navigate(`#/workout/${workout.id}`);
          }) }, 'Save it'),
          h('button', { class: 'secondary', onclick: run(async () => {
            await app.store.clearDraft();
            draftBanner.hidden = true;
          }) }, 'Discard'),
        ),
      );
      draftBanner.hidden = false;
    });

    const statusDot = h('span', { class: 'dot' });
    const statusText = h('span');
    const bikeName = h('p', { class: 'muted' });
    const actions = h('div', { class: 'row' });
    const preview = h('p', { class: 'preview' });

    const startButton = h('button', { class: 'primary huge', onclick: () => {
      app.startWorkout();
      navigate('#/live');
    } }, 'Start workout');
    const resumeButton = h('button', { class: 'primary huge', onclick: () => navigate('#/live') }, 'Back to workout');

    const diagInfo = h('pre');
    const diagLog = h('pre', { class: 'log' });
    const diagPackets = h('pre', { class: 'log' });
    const diagnostics = h('details', { class: 'card' },
      h('summary', {}, 'Diagnostics'),
      h('p', { class: 'muted' }, 'What the bike reports over FTMS. A packet capture helps to support new bikes and firmware.'),
      diagInfo,
      h('h3', {}, 'Log'), diagLog,
      h('h3', {}, 'Latest packets'), diagPackets,
      h('button', { class: 'secondary', onclick: () =>
        download(`openairbike-capture-${Date.now()}.json`, app.captureReport(), 'application/json') }, 'Download packet capture'),
    );

    const view = h('div', { class: 'stack' },
      h('header', { class: 'title' }, h('h1', {}, 'OPENAIRBIKE')),
      !isWebBluetoothAvailable() &&
        h('div', { class: 'card warning' },
          h('p', {}, 'This browser does not support Web Bluetooth. Use Chrome or Edge on desktop or Android, served over HTTPS or localhost.'),
          h('p', {}, 'You can still try OpenAirBike with the demo bike.'),
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
      h('nav', { class: 'row' }, h('a', { class: 'button secondary', href: '#/history' }, 'Workout history')),
      diagnostics,
    );
    root.append(view);

    let actionsKey = '';
    const renderActions = () => {
      const state = app.connectionState;
      const remembered = app.rememberedBike;
      const key = `${state}|${remembered?.id}`;
      if (key === actionsKey) return;
      actionsKey = key;

      const buttons: HTMLElement[] = [];
      if (state === 'disconnected') {
        if (isWebBluetoothAvailable()) {
          buttons.push(h('button', { onclick: run(() => app.connectBluetooth()) }, 'Connect bike'));
          if (remembered) {
            buttons.push(h('button', { class: 'secondary', onclick: run(async () => {
              if (!(await app.reconnectRemembered())) throw new Error(`Could not find ${remembered.name}. Use “Connect bike”.`);
            }) }, `Reconnect ${remembered.name}`));
          }
        }
        buttons.push(h('button', { class: 'secondary', onclick: run(() => app.connectSimulator()) }, 'Use demo bike'));
      } else {
        buttons.push(h('button', { class: 'secondary', onclick: run(() => app.disconnect()) }, 'Disconnect'));
      }
      actions.replaceChildren(...buttons);
    };

    const update = () => {
      const state = app.connectionState;
      const recording = app.recorder !== undefined;
      statusDot.className = `dot ${state}`;
      setText(statusText, STATE_LABEL[state]);
      const info = app.bikeInfo;
      setText(bikeName, info ? [info.name, info.manufacturer, info.model].filter(Boolean).join(' · ') : '');
      renderActions();

      const s = app.engine.current();
      preview.hidden = !s;
      if (s) setText(preview, `${formatNumber(s.powerW)} W · ${formatNumber(s.cadenceRpm)} RPM · ${formatNumber(s.speedKmh, 1)} km/h`);

      startButton.hidden = recording;
      startButton.disabled = state !== 'connected';
      resumeButton.hidden = !recording;

      if (diagnostics.open) {
        setText(diagInfo, JSON.stringify(info ?? { status: 'no bike connected' }, null, 2));
        setText(diagLog, app.log.slice(-40).join('\n'));
        setText(
          diagPackets,
          app.capture.slice(-12).map((p) => `${new Date(p.receivedAt).toLocaleTimeString()}  ${p.characteristic}  ${p.hex}`).join('\n'),
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
