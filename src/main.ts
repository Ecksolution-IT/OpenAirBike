import './ui/style.css';
import { App } from './app/app';
import { DatabaseLockedError, openSqliteStore, type SqliteStore } from './persistence/sqlite/client';
import { h, type View } from './ui/dom';
import { i18n, t } from './ui/i18n';
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
  document.documentElement.lang = i18n.language;
  let store: SqliteStore;
  try {
    store = await openSqliteStore();
  } catch (err) {
    const message = err instanceof DatabaseLockedError ? t.databaseLocked : t.storageUnavailable(err instanceof Error ? err.message : String(err));
    root.append(h('header', { class: 'title' }, h('h1', {}, t.appTitle)), h('p', { class: 'card error' }, message));
    return;
  }

  const app = new App(store.repositories, store);
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
