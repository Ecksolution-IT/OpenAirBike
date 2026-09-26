import './ui/style.css';
import { App } from './app/app';
import { WorkoutStore } from './persistence/indexeddb/workoutStore';
import { h, type View } from './ui/dom';
import { historyView, workoutView } from './ui/historyView';
import { homeView } from './ui/homeView';
import { liveView } from './ui/liveView';

function route(app: App): View {
  const hash = location.hash.replace(/^#/, '') || '/';
  if (hash === '/live') return liveView(app);
  if (hash === '/history') return historyView(app);
  const workout = hash.match(/^\/workout\/(.+)$/);
  if (workout) return workoutView(app, decodeURIComponent(workout[1]));
  return homeView(app);
}

async function main() {
  const root = document.getElementById('app')!;
  let store: WorkoutStore;
  try {
    store = await WorkoutStore.open();
  } catch (err) {
    root.append(h('p', { class: 'error' }, `Local storage is unavailable: ${String(err)}`));
    return;
  }

  const app = new App(store);
  await app.init();

  // Leaving the page mid-workout would lose the last seconds; the browser asks first.
  window.addEventListener('beforeunload', (event) => {
    if (app.recorder) event.preventDefault();
  });

  let cleanup: (() => void) | void;
  const render = () => {
    cleanup?.();
    root.replaceChildren();
    cleanup = route(app)(root);
    window.scrollTo(0, 0);
  };
  window.addEventListener('hashchange', render);
  render();
}

void main();
