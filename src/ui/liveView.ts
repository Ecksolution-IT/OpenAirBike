import type { App } from '../app/app';
import { h, navigate, setText, type View } from './dom';
import { fmt, t } from './i18n';

const FINISH_CONFIRM_MS = 3000;

/**
 * The training screen: large numbers, few controls, readable from several meters away.
 */
export function liveView(app: App): View {
  return (root) => {
    const recorder = app.recorder;
    if (!recorder) {
      navigate('#/');
      return;
    }

    const metric = (label: string, cls = '') => {
      const value = h('span', { class: 'value' }, '--');
      return { value, el: h('div', { class: `metric ${cls}` }, value, h('span', { class: 'label' }, label)) };
    };

    const power = metric(t.unit.power, 'hero');
    const cadence = metric(t.unit.cadence);
    const second = metric(t.unit.heartRate);
    const time = metric(t.unit.time);
    const distance = metric(t.unit.km);
    const energy = metric(t.unit.energy);
    const speed = metric(t.unit.speed);

    const connection = h('span', { class: 'connection' });
    const badge = h('span', { class: 'badge' });
    const error = h('p', { class: 'error', role: 'alert', hidden: true });

    const pauseButton = h('button', { class: 'huge secondary', onclick: () => {
      if (recorder.state === 'recording') app.pauseWorkout();
      else app.resumeWorkout();
      update();
    } });

    let confirmUntil = 0;
    const finishButton = h('button', { class: 'huge danger', onclick: async () => {
      if (Date.now() > confirmUntil) {
        confirmUntil = Date.now() + FINISH_CONFIRM_MS;
        update();
        return;
      }
      finishButton.disabled = true;
      try {
        const id = await app.finishWorkout();
        navigate(`#/workout/${id}`);
      } catch (err) {
        error.textContent = t.savingFailed(err instanceof Error ? err.message : String(err));
        error.hidden = false;
      }
    } });

    root.append(
      h('div', { class: 'live' },
        h('div', { class: 'live-top' }, h('span', { class: 'brand' }, t.appTitle), badge, connection),
        h('div', { class: 'metrics' },
          power.el,
          h('div', { class: 'metric-row' }, cadence.el, second.el),
          h('div', { class: 'metric-row' }, time.el, distance.el),
          h('div', { class: 'metric-row small' }, speed.el, energy.el),
        ),
        error,
        h('div', { class: 'controls' }, pauseButton, finishButton),
      ),
    );

    // Heart rate only when the bike supports or sends it; otherwise that slot shows speed.
    let heartRateSeen = false;

    const update = () => {
      const now = Date.now();
      const s = app.telemetry.current(now);
      if (s?.heartRateBpm !== undefined) heartRateSeen = true;
      if (app.bikeInfo?.capabilities?.includes('heartRate')) heartRateSeen = true;

      setText(power.value, fmt.number(s?.powerW));
      setText(cadence.value, fmt.number(s?.cadenceRpm));
      speed.el.hidden = !heartRateSeen;
      if (heartRateSeen) {
        setText(second.value, fmt.number(s?.heartRateBpm));
        setText(second.el.lastElementChild!, t.unit.heartRate);
        setText(speed.value, fmt.number(s?.speedKmh, 1));
      } else {
        setText(second.value, fmt.number(s?.speedKmh, 1));
        setText(second.el.lastElementChild!, t.unit.speed);
      }
      setText(time.value, fmt.duration(recorder.elapsedS(now)));
      const d = fmt.distance(recorder.distanceM);
      setText(distance.value, d.value);
      setText(distance.el.lastElementChild!, d.unit === 'm' ? t.unit.m : t.unit.km);
      setText(energy.value, fmt.number(recorder.energyKcal));

      const state = app.connectionState;
      setText(connection, `● ${state === 'connected' && !s ? t.waitingForData : t.liveState[state]}`);
      connection.className = `connection ${state === 'connected' && s ? 'ok' : 'warn'}`;

      const paused = recorder.state === 'paused';
      setText(badge, paused ? t.paused : '');
      badge.hidden = !paused;
      root.classList.toggle('paused', paused);
      setText(pauseButton, paused ? t.resume : t.pause);
      setText(finishButton, now < confirmUntil ? t.tapAgainToFinish : t.finish);
    };

    update();
    const off = app.on('change', update);
    const timer = setInterval(update, 250);
    return () => {
      off();
      clearInterval(timer);
      root.classList.remove('paused');
    };
  };
}
