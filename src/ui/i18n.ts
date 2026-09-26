import type { ConnectionState } from '../app/app';
import { createFormatters, type Formatters } from './format';

/**
 * UI texts. German is the default (decision D2); English is used when the browser prefers
 * English. Technical diagnostics (log lines, conformance details) stay in English.
 */

const de = {
  appTitle: 'OPENAIRBIKE',
  state: {
    disconnected: 'Nicht verbunden',
    connecting: 'Verbinde …',
    connected: 'Verbunden',
    reconnecting: 'Verbindung wird wiederhergestellt …',
  } satisfies Record<ConnectionState, string>,
  liveState: {
    disconnected: 'GETRENNT',
    connecting: 'VERBINDE',
    connected: 'LIVE',
    reconnecting: 'VERBINDUNG UNTERBROCHEN',
  } satisfies Record<ConnectionState, string>,
  waitingForData: 'WARTE AUF DATEN',
  noBluetooth: 'Dieser Browser unterstützt kein Web Bluetooth. Nutze Chrome oder Edge auf dem Computer oder unter Android, über HTTPS oder localhost.',
  tryDemo: 'Mit dem Demo-Bike kannst du OpenAirBike trotzdem ausprobieren.',
  unfinishedFound: (when: string) => `Ein nicht beendetes Training vom ${when} wurde gefunden.`,
  save: 'Speichern',
  discard: 'Verwerfen',
  connectBike: 'Bike verbinden',
  reconnectBike: (name: string) => `${name} wieder verbinden`,
  bikeNotFound: (name: string) => `${name} wurde nicht gefunden. Nutze „Bike verbinden“.`,
  useDemoBike: 'Demo-Bike verwenden',
  disconnect: 'Trennen',
  startWorkout: 'Training starten',
  backToWorkout: 'Zurück zum Training',
  history: 'Trainingsverlauf',
  diagnostics: 'Diagnose',
  diagnosticsIntro: 'Was das Bike über FTMS meldet. Ein Paketmitschnitt hilft, neue Bikes und Firmware zu unterstützen.',
  conformance: 'FTMS-Konformität',
  conformanceIntro: 'Beobachtetes Verhalten, geprüft gegen die Bluetooth-SIG-Testsuite und das ICS für FTMS. Nur passive Prüfungen, kein Qualifizierungsergebnis.',
  log: 'Protokoll',
  latestPackets: 'Letzte Pakete',
  downloadCapture: 'Paketmitschnitt herunterladen',
  noBike: 'kein Bike verbunden',
  unit: { power: 'W', cadence: 'U/MIN', heartRate: 'BPM', speed: 'KM/H', energy: 'KCAL', time: 'ZEIT', m: 'M', km: 'KM' },
  paused: 'PAUSIERT',
  pause: 'Pause',
  resume: 'Weiter',
  finish: 'Beenden',
  tapAgainToFinish: 'Nochmal tippen zum Beenden',
  savingFailed: (message: string) => `Speichern fehlgeschlagen: ${message}`,
  home: '‹ Start',
  historyTitle: 'Verlauf',
  loading: 'Lädt …',
  noWorkouts: 'Noch keine Trainings. Bike verbinden und losfahren.',
  unfinished: 'nicht beendet',
  avgPower: (watts: string) => `Ø ${watts} W`,
  exportDatabase: 'Datenbank exportieren (.sqlite)',
  backToHistory: '‹ Verlauf',
  workoutTitle: 'Training',
  workoutNotFound: 'Training nicht gefunden.',
  row: {
    date: 'Datum',
    started: 'Start',
    duration: 'Dauer',
    distance: 'Distanz',
    energy: 'Kalorien',
    avgPower: 'Ø Leistung',
    maxPower: 'Max. Leistung',
    avgCadence: 'Ø Trittfrequenz',
    maxCadence: 'Max. Trittfrequenz',
    avgSpeed: 'Ø Geschwindigkeit',
    maxSpeed: 'Max. Geschwindigkeit',
    avgHeartRate: 'Ø Puls',
    maxHeartRate: 'Max. Puls',
    bike: 'Bike',
  },
  cadenceUnit: 'U/min',
  heartRateUnit: 'bpm',
  recoveredNote: 'Nach einem unerwarteten Schließen der App wiederhergestellt; die letzten Sekunden können fehlen.',
  interruptedNote: 'Dieses Training wurde unterbrochen und ist noch nicht beendet. Es kann auf der Startseite gespeichert werden.',
  samplesRecorded: (n: number) => `${n} Messwerte aufgezeichnet.`,
  exportJson: 'JSON exportieren',
  exportCsv: 'CSV exportieren',
  delete: 'Löschen',
  confirmDelete: 'Dieses Training löschen? Das kann nicht rückgängig gemacht werden.',
  done: 'Fertig',
  databaseLocked: 'OpenAirBike ist bereits in einem anderen Tab oder Fenster geöffnet. Schließe es dort, um es hier zu nutzen.',
  storageUnavailable: (message: string) => `Der lokale Speicher ist nicht verfügbar: ${message}`,
};

export type Messages = typeof de;

const en: Messages = {
  appTitle: 'OPENAIRBIKE',
  state: { disconnected: 'Not connected', connecting: 'Connecting …', connected: 'Connected', reconnecting: 'Reconnecting …' },
  liveState: { disconnected: 'DISCONNECTED', connecting: 'CONNECTING', connected: 'LIVE', reconnecting: 'CONNECTION LOST' },
  waitingForData: 'WAITING FOR DATA',
  noBluetooth: 'This browser does not support Web Bluetooth. Use Chrome or Edge on desktop or Android, served over HTTPS or localhost.',
  tryDemo: 'You can still try OpenAirBike with the demo bike.',
  unfinishedFound: (when) => `An unfinished workout from ${when} was found.`,
  save: 'Save it',
  discard: 'Discard',
  connectBike: 'Connect bike',
  reconnectBike: (name) => `Reconnect ${name}`,
  bikeNotFound: (name) => `Could not find ${name}. Use “Connect bike”.`,
  useDemoBike: 'Use demo bike',
  disconnect: 'Disconnect',
  startWorkout: 'Start workout',
  backToWorkout: 'Back to workout',
  history: 'Workout history',
  diagnostics: 'Diagnostics',
  diagnosticsIntro: 'What the bike reports over FTMS. A packet capture helps to support new bikes and firmware.',
  conformance: 'FTMS conformance',
  conformanceIntro: 'Observed behaviour checked against the Bluetooth SIG FTMS test suite and ICS. Passive checks only, not a qualification result.',
  log: 'Log',
  latestPackets: 'Latest packets',
  downloadCapture: 'Download packet capture',
  noBike: 'no bike connected',
  unit: { power: 'W', cadence: 'RPM', heartRate: 'BPM', speed: 'KM/H', energy: 'KCAL', time: 'TIME', m: 'M', km: 'KM' },
  paused: 'PAUSED',
  pause: 'Pause',
  resume: 'Resume',
  finish: 'Finish',
  tapAgainToFinish: 'Tap again to finish',
  savingFailed: (message) => `Saving failed: ${message}`,
  home: '‹ Home',
  historyTitle: 'History',
  loading: 'Loading …',
  noWorkouts: 'No workouts yet. Connect the bike and ride.',
  unfinished: 'unfinished',
  avgPower: (watts) => `${watts} W avg`,
  exportDatabase: 'Export database (.sqlite)',
  backToHistory: '‹ History',
  workoutTitle: 'Workout',
  workoutNotFound: 'Workout not found.',
  row: {
    date: 'Date',
    started: 'Started',
    duration: 'Duration',
    distance: 'Distance',
    energy: 'Calories',
    avgPower: 'Avg power',
    maxPower: 'Max power',
    avgCadence: 'Avg cadence',
    maxCadence: 'Max cadence',
    avgSpeed: 'Avg speed',
    maxSpeed: 'Max speed',
    avgHeartRate: 'Avg heart rate',
    maxHeartRate: 'Max heart rate',
    bike: 'Bike',
  },
  cadenceUnit: 'rpm',
  heartRateUnit: 'bpm',
  recoveredNote: 'Recovered after the app closed during the workout; the last seconds may be missing.',
  interruptedNote: 'This workout was interrupted and is not finished yet. It can be saved from the home screen.',
  samplesRecorded: (n) => `${n} samples recorded.`,
  exportJson: 'Export JSON',
  exportCsv: 'Export CSV',
  delete: 'Delete',
  confirmDelete: 'Delete this workout? This cannot be undone.',
  done: 'Done',
  databaseLocked: 'OpenAirBike is already open in another tab or window. Close it there to use it here.',
  storageUnavailable: (message) => `Local storage is unavailable: ${message}`,
};

export type Language = 'de' | 'en';

/** German unless the browser's preferred language is English (decision D2: default de-DE). */
export function detectLanguage(preferred: readonly string[]): Language {
  const first = preferred.find((tag) => /^(de|en)\b/i.test(tag));
  return first?.toLowerCase().startsWith('en') ? 'en' : 'de';
}

export interface I18n {
  language: Language;
  locale: string;
  t: Messages;
  fmt: Formatters;
}

export function createI18n(language: Language, locale = language === 'de' ? 'de-DE' : 'en-GB', timeZone?: string): I18n {
  return { language, locale, t: language === 'de' ? de : en, fmt: createFormatters(locale, timeZone) };
}

function browserI18n(): I18n {
  const preferred = typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  const language = detectLanguage(preferred);
  // Numbers and dates follow the browser's own locale for the chosen language (e.g. de-AT, en-IE).
  const locale = preferred.find((tag) => tag.toLowerCase().startsWith(language)) ?? (language === 'de' ? 'de-DE' : 'en-GB');
  return createI18n(language, locale);
}

/** The UI's texts and formatters, chosen once from the browser settings. */
export const i18n: I18n = browserI18n();
export const { t, fmt } = i18n;
