'use strict';

const STORAGE_KEY = 'runphase-settings';
const RESULT_STORAGE_KEY = 'runphase-last-workout';
const HISTORY_STORAGE_KEY = 'runphase-workout-history';
const COUNTDOWN_DURATION_MS = 3_000;
const START_MESSAGE_DURATION_MS = 700;

const presets = {
  easy: { run: 60, walk: 120, cycles: 6 },
  medium: { run: 120, walk: 60, cycles: 8 },
  hard: { run: 240, walk: 60, cycles: 8 },
};

const settingsConfig = {
  warmup: {
    defaultValue: 180,
    allowedValues: createDurationValues(0, 10 * 60),
    format: formatTime,
  },
  run: {
    defaultValue: 120,
    allowedValues: createDurationValues(10, 30 * 60),
    format: formatTime,
  },
  walk: {
    defaultValue: 60,
    allowedValues: createDurationValues(10, 15 * 60),
    format: formatTime,
  },
  cycles: {
    defaultValue: 6,
    allowedValues: createIntegerRange(1, 30),
    format: String,
  },
  cooldown: {
    defaultValue: 180,
    allowedValues: createDurationValues(0, 10 * 60),
    format: formatTime,
  },
};

const storedConfiguration = loadStoredConfiguration();
const settings = loadSettings(storedConfiguration);
let activeMode = loadMode(storedConfiguration);
let soundEnabled = loadSoundEnabled(storedConfiguration);
const screenElements = Array.from(document.querySelectorAll('[data-screen]'));
const screens = new Map(screenElements.map((screen) => [screen.dataset.screen, screen]));
const settingsElement = screens.get('settings');
const modePickerElement = document.querySelector('.mode-picker');
const startButtonElement = document.querySelector('.start-button');
const countdownElement = document.querySelector('[data-countdown]');
const workoutScreenElement = screens.get('workout');
const workoutCycleElement = document.querySelector('[data-workout-cycle]');
const workoutStageElement = document.querySelector('[data-workout-stage-label]');
const workoutTimeElement = document.querySelector('[data-workout-time]');
const workoutNextElement = document.querySelector('[data-workout-next]');
const workoutPauseElement = document.querySelector('[data-workout-pause]');
const workoutRouteElement = document.querySelector('[data-workout-route]');
const routeFutureElement = document.querySelector('[data-route-future]');
const routeCompletedElement = document.querySelector('[data-route-completed]');
const pauseOverlayElement = document.querySelector('[data-pause-overlay]');
const resumeWorkoutElement = document.querySelector('[data-workout-resume]');
const finishWorkoutElement = document.querySelector('[data-workout-finish]');
const soundToggleElement = document.querySelector('[data-sound-toggle]');
const soundValueElement = document.querySelector('[data-sound-value]');
const resultTotalTimeElement = document.querySelector('[data-result-total-time]');
const resultRunTimeElement = document.querySelector('[data-result-run-time]');
const resultWalkTimeElement = document.querySelector('[data-result-walk-time]');
const resultCyclesElement = document.querySelector('[data-result-cycles]');
const resultPercentageElement = document.querySelector('[data-result-percentage]');
const resultSaveElement = document.querySelector('[data-result-save]');
const resultRepeatElement = document.querySelector('[data-result-repeat]');
const resultHomeElement = document.querySelector('[data-result-home]');
const openHistoryElement = document.querySelector('[data-open-history]');
const historyBackElement = document.querySelector('[data-history-back]');
const historyListElement = document.querySelector('[data-history-list]');
const historyEmptyElement = document.querySelector('[data-history-empty]');
const historyCountElement = document.querySelector('[data-history-count]');
let workoutSession = null;
let workoutAnimationFrameId = null;
let lastWorkoutRenderKey = '';
let lastVibrationStage = null;
let lastCountdownVibrationKey = '';
let lastAudioStage = null;
let lastWarningSoundKey = '';
let audioContext = null;
let lastWorkoutSummary = null;
let lastWorkoutRecord = null;
let currentScreen = 'settings';

const stageContent = {
  PREPARE: { label: 'ПОДГОТОВКА', nextLabel: 'Подготовка' },
  WARMUP: { label: 'РАЗМИНКА', nextLabel: 'Разминка' },
  RUN: { label: 'БЕГ', nextLabel: 'Бег' },
  WALK: { label: 'ХОДЬБА', nextLabel: 'Ходьба' },
  COOLDOWN: { label: 'ЗАМИНКА', nextLabel: 'Заминка' },
  FINISHED: { label: 'ГОТОВО', nextLabel: 'Финиш' },
};

renderSettings();
renderActiveMode();
renderSoundSetting();
showScreen('settings');

startButtonElement.addEventListener('click', startPreparation);
workoutPauseElement.addEventListener('click', pauseWorkout);
resumeWorkoutElement.addEventListener('click', resumeWorkout);
finishWorkoutElement.addEventListener('click', finishWorkout);
soundToggleElement.addEventListener('click', toggleSound);
resultSaveElement.addEventListener('click', saveWorkoutResult);
resultRepeatElement.addEventListener('click', repeatWorkout);
resultHomeElement.addEventListener('click', returnHome);
openHistoryElement.addEventListener('click', openHistory);
historyBackElement.addEventListener('click', closeHistory);

modePickerElement.addEventListener('click', (event) => {
  const button = event.target.closest('[data-mode]');

  if (!button) {
    return;
  }

  const mode = button.dataset.mode;

  if (mode !== 'custom') {
    Object.assign(settings, presets[mode]);
    renderSettings();
  }

  setActiveMode(mode);
  saveSettings();
});

settingsElement.addEventListener('click', (event) => {
  const button = event.target.closest('.stepper__button');

  if (!button) {
    return;
  }

  const row = button.closest('[data-setting]');
  const key = row.dataset.setting;
  const config = settingsConfig[key];
  const direction = button.dataset.direction === 'increase' ? 1 : -1;
  const currentIndex = config.allowedValues.indexOf(settings[key]);
  const nextIndex = clamp(currentIndex + direction, 0, config.allowedValues.length - 1);

  settings[key] = config.allowedValues[nextIndex];
  setActiveMode('custom');
  saveSettings();
  renderSetting(row, key);
});

function setActiveMode(mode) {
  activeMode = mode;
  renderActiveMode();
}

function renderActiveMode() {
  modePickerElement.querySelectorAll('[data-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === activeMode));
  });
}

function startPreparation() {
  const countdownStartedAt = Date.now();
  let visibleValue = null;

  unlockAudio();
  showScreen('countdown');

  const updateCountdown = () => {
    const elapsedMs = Math.max(0, Date.now() - countdownStartedAt);
    const remaining = Math.max(1, 3 - Math.floor(elapsedMs / 1000));
    const nextValue = elapsedMs < COUNTDOWN_DURATION_MS ? String(remaining) : 'СТАРТ';

    if (nextValue !== visibleValue) {
      visibleValue = nextValue;
      showCountdownValue(nextValue);
    }

    if (elapsedMs < COUNTDOWN_DURATION_MS + START_MESSAGE_DURATION_MS) {
      requestAnimationFrame(updateCountdown);
      return;
    }

    beginWorkout();
  };

  requestAnimationFrame(updateCountdown);
}

function showCountdownValue(value) {
  countdownElement.textContent = value;
  countdownElement.classList.toggle('is-start', value === 'СТАРТ');
  countdownElement.classList.remove('is-changing');
  void countdownElement.offsetWidth;
  countdownElement.classList.add('is-changing');
}

function beginWorkout() {
  buildWorkoutRoute();
  lastWorkoutRenderKey = '';
  lastVibrationStage = null;
  lastCountdownVibrationKey = '';
  lastAudioStage = null;
  lastWarningSoundKey = '';

  workoutSession = new WorkoutSession({
    prepare: 0,
    warmup: settings.warmup,
    run: settings.run,
    walk: settings.walk,
    cycles: settings.cycles,
    cooldown: settings.cooldown,
  });

  const initialState = workoutSession.start();

  showScreen('workout');
  renderWorkout(initialState);
  startWorkoutRendering();
}

function startWorkoutRendering() {
  if (workoutAnimationFrameId !== null) {
    cancelAnimationFrame(workoutAnimationFrameId);
  }

  const updateWorkout = () => {
    const state = workoutSession.getState();

    renderWorkout(state);

    if (state.status === 'running') {
      workoutAnimationFrameId = requestAnimationFrame(updateWorkout);
    } else {
      workoutAnimationFrameId = null;

      if (state.status === 'finished') {
        showWorkoutResult();
      }
    }
  };

  workoutAnimationFrameId = requestAnimationFrame(updateWorkout);
}

function pauseWorkout() {
  if (!workoutSession || workoutSession.getState().status !== 'running') {
    return;
  }

  const pausedState = workoutSession.pause();

  renderWorkout(pausedState);

  if (pausedState.status !== 'paused') {
    if (workoutAnimationFrameId !== null) {
      cancelAnimationFrame(workoutAnimationFrameId);
      workoutAnimationFrameId = null;
    }

    return;
  }

  pauseOverlayElement.hidden = false;
  resumeWorkoutElement.focus();

  if (workoutAnimationFrameId !== null) {
    cancelAnimationFrame(workoutAnimationFrameId);
    workoutAnimationFrameId = null;
  }
}

function resumeWorkout() {
  if (!workoutSession || workoutSession.getState().status !== 'paused') {
    return;
  }

  const resumedState = workoutSession.resume();

  pauseOverlayElement.hidden = true;
  renderWorkout(resumedState);
  workoutPauseElement.focus();
  startWorkoutRendering();
}

function finishWorkout() {
  if (!workoutSession) {
    return;
  }

  workoutSession.stop();

  if (workoutAnimationFrameId !== null) {
    cancelAnimationFrame(workoutAnimationFrameId);
    workoutAnimationFrameId = null;
  }

  pauseOverlayElement.hidden = true;
  showWorkoutResult();
}

function showWorkoutResult() {
  if (!workoutSession) {
    return;
  }

  lastWorkoutSummary = workoutSession.getSummary();
  lastWorkoutRecord = createWorkoutRecord(lastWorkoutSummary);
  storeWorkoutRecord(lastWorkoutRecord);
  resultTotalTimeElement.textContent = formatResultDuration(lastWorkoutSummary.totalSeconds);
  resultRunTimeElement.textContent = formatResultDuration(lastWorkoutSummary.runSeconds);
  resultWalkTimeElement.textContent = formatResultDuration(lastWorkoutSummary.walkSeconds);
  resultCyclesElement.textContent = String(lastWorkoutSummary.completedCycles);
  resultPercentageElement.textContent = `${lastWorkoutSummary.completionPercentage}%`;
  resultSaveElement.textContent = 'СОХРАНИТЬ';
  resultSaveElement.disabled = false;
  pauseOverlayElement.hidden = true;
  showScreen('result');
  workoutSession = null;
  resultSaveElement.focus();
}

function saveWorkoutResult() {
  if (!lastWorkoutSummary || !lastWorkoutRecord) {
    return;
  }

  try {
    storeWorkoutRecord(lastWorkoutRecord);
    localStorage.setItem(
      RESULT_STORAGE_KEY,
      JSON.stringify({
        ...lastWorkoutRecord,
        settings: { ...settings },
      }),
    );

    resultSaveElement.textContent = 'СОХРАНЕНО';
    resultSaveElement.disabled = true;
  } catch {
    // The result screen remains usable when local storage is unavailable.
  }
}

function repeatWorkout() {
  lastWorkoutSummary = null;
  lastWorkoutRecord = null;
  startPreparation();
}

function returnHome() {
  lastWorkoutSummary = null;
  lastWorkoutRecord = null;
  showScreen('settings');
  startButtonElement.focus();
}

function createWorkoutRecord(summary) {
  return Object.freeze({
    id: createWorkoutId(),
    date: new Date().toISOString(),
    totalDuration: summary.totalSeconds,
    runDuration: summary.runSeconds,
    walkDuration: summary.walkSeconds,
    completedCycles: summary.completedCycles,
    totalCycles: summary.totalCycles,
  });
}

function createWorkoutId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `workout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function storeWorkoutRecord(record) {
  try {
    const history = loadWorkoutHistory();

    if (!history.some(({ id }) => id === record.id)) {
      history.unshift(record);
    }

    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    return true;
  } catch {
    return false;
  }
}

function loadWorkoutHistory() {
  try {
    const parsedHistory = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY));

    if (!Array.isArray(parsedHistory)) {
      return [];
    }

    return parsedHistory
      .filter(isValidWorkoutRecord)
      .sort((first, second) => Date.parse(second.date) - Date.parse(first.date));
  } catch {
    return [];
  }
}

function isValidWorkoutRecord(record) {
  return record
    && typeof record === 'object'
    && typeof record.id === 'string'
    && record.id.length > 0
    && typeof record.date === 'string'
    && Number.isFinite(Date.parse(record.date))
    && isNonNegativeInteger(record.totalDuration)
    && isNonNegativeInteger(record.runDuration)
    && isNonNegativeInteger(record.walkDuration)
    && isNonNegativeInteger(record.completedCycles)
    && Number.isInteger(record.totalCycles)
    && record.totalCycles > 0
    && record.completedCycles <= record.totalCycles;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function openHistory() {
  renderWorkoutHistory();
  showScreen('history');
  historyBackElement.focus();
}

function closeHistory() {
  showScreen('settings');
  openHistoryElement.focus();
}

function showScreen(screenName) {
  if (!screens.has(screenName)) {
    throw new Error(`Unknown screen: ${screenName}`);
  }

  screenElements.forEach((screen) => {
    const isActive = screen.dataset.screen === screenName;

    screen.hidden = !isActive;
    screen.setAttribute('aria-hidden', String(!isActive));
  });

  currentScreen = screenName;
  document.body.dataset.screen = screenName;
  window.scrollTo(0, 0);
}

function renderWorkoutHistory() {
  const history = loadWorkoutHistory();
  const fragment = document.createDocumentFragment();

  history.forEach((record) => {
    fragment.append(createHistoryCard(record));
  });

  historyListElement.replaceChildren(fragment);
  historyCountElement.textContent = String(history.length);
  historyEmptyElement.hidden = history.length > 0;
}

function createHistoryCard(record) {
  const card = document.createElement('article');
  const header = document.createElement('header');
  const date = document.createElement('time');
  const total = document.createElement('strong');
  const details = document.createElement('dl');

  card.className = 'history-card';
  header.className = 'history-card__header';
  date.className = 'history-card__date';
  date.dateTime = record.date;
  date.textContent = formatHistoryDate(record.date);
  total.className = 'history-card__total';
  total.textContent = formatResultDuration(record.totalDuration);
  details.className = 'history-card__details';
  details.append(
    createHistoryMetric('Бег', formatResultDuration(record.runDuration), 'run'),
    createHistoryMetric('Ходьба', formatResultDuration(record.walkDuration), 'walk'),
    createHistoryMetric('Циклы', `${record.completedCycles} / ${record.totalCycles}`),
  );
  header.append(date, total);
  card.append(header, details);

  return card;
}

function createHistoryMetric(label, value, variant = '') {
  const metric = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');

  metric.className = `history-card__metric${variant ? ` history-card__metric--${variant}` : ''}`;
  term.textContent = label;
  description.textContent = value;
  metric.append(term, description);

  return metric;
}

function formatHistoryDate(isoDate) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoDate));
}

function renderWorkout(state) {
  workoutScreenElement.style.setProperty('--route-progress', `${state.totalProgress * 100}%`);
  provideWorkoutVibration(state);
  provideWorkoutSound(state);

  const renderKey = [
    state.status,
    state.stage,
    state.remainingSeconds,
    state.currentCycle,
    state.nextStage,
  ].join(':');

  if (renderKey === lastWorkoutRenderKey) {
    return;
  }

  lastWorkoutRenderKey = renderKey;
  workoutScreenElement.dataset.workoutStage = state.stage;
  workoutScreenElement.classList.toggle('is-paused', state.status === 'paused');
  workoutCycleElement.textContent = `${state.currentCycle || '—'} / ${state.totalCycles}`;
  workoutStageElement.textContent = stageContent[state.stage].label;
  workoutTimeElement.textContent = formatTime(state.remainingSeconds);
  workoutNextElement.textContent = formatNextStage(state);
  workoutPauseElement.textContent = state.status === 'finished' ? 'ГОТОВО' : 'ПАУЗА';
  workoutPauseElement.disabled = state.status === 'finished' || state.status === 'stopped';
}

function provideWorkoutVibration(state) {
  if (state.status !== 'running') {
    return;
  }

  if (isRunWalkTransition(lastVibrationStage, state.stage)) {
    vibrate([90, 55, 170]);
  }

  if (state.remainingSeconds >= 1 && state.remainingSeconds <= 3) {
    const vibrationKey = `${state.stage}:${state.remainingSeconds}`;

    if (vibrationKey !== lastCountdownVibrationKey) {
      lastCountdownVibrationKey = vibrationKey;
      vibrate(45);
    }
  }

  lastVibrationStage = state.stage;
}

function isRunWalkTransition(previousStage, nextStage) {
  return (previousStage === 'RUN' && nextStage === 'WALK')
    || (previousStage === 'WALK' && nextStage === 'RUN');
}

function vibrate(pattern) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }

  try {
    navigator.vibrate(pattern);
  } catch {
    // Vibration is optional and must not affect the workout when unavailable.
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  renderSoundSetting();
  saveSettings();

  if (soundEnabled) {
    unlockAudio();
  }
}

function renderSoundSetting() {
  soundToggleElement.setAttribute('aria-pressed', String(soundEnabled));
  soundValueElement.textContent = soundEnabled ? 'Вкл' : 'Выкл';
  soundToggleElement.setAttribute(
    'aria-label',
    `Звук: ${soundEnabled ? 'включен' : 'выключен'}`,
  );
}

function provideWorkoutSound(state) {
  if (!soundEnabled || state.status === 'paused' || state.status === 'stopped') {
    return;
  }

  if (state.stage !== lastAudioStage) {
    playStageSound();
    lastAudioStage = state.stage;
  }

  if (state.status === 'running' && state.remainingSeconds === 3) {
    const warningKey = `${state.stage}:${state.currentCycle}`;

    if (warningKey !== lastWarningSoundKey) {
      lastWarningSoundKey = warningKey;
      playTone(720, 0.08, 0, 0.045);
    }
  }
}

function playStageSound() {
  playTone(520, 0.1, 0, 0.055);
  playTone(760, 0.16, 0.12, 0.065);
}

function playTone(frequency, durationSeconds, delaySeconds, volume) {
  const context = unlockAudio();

  if (!context) {
    return;
  }

  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startsAt = context.currentTime + delaySeconds;
    const endsAt = startsAt + durationSeconds;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.linearRampToValueAtTime(volume, startsAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startsAt);
    oscillator.stop(endsAt);
  } catch {
    // Audio feedback is optional and must not interrupt the workout.
  }
}

function unlockAudio() {
  if (!soundEnabled) {
    return null;
  }

  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;

  if (typeof AudioContextClass !== 'function') {
    return null;
  }

  try {
    audioContext ??= new AudioContextClass();

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    return audioContext;
  } catch {
    return null;
  }
}

function buildWorkoutRoute() {
  const segments = [];

  if (settings.warmup > 0) {
    segments.push({ stage: 'warmup', duration: settings.warmup, label: 'Разминка' });
  }

  for (let cycle = 1; cycle <= settings.cycles; cycle += 1) {
    segments.push({ stage: 'run', duration: settings.run, label: `Бег, цикл ${cycle}` });
    segments.push({ stage: 'walk', duration: settings.walk, label: `Ходьба, цикл ${cycle}` });
  }

  if (settings.cooldown > 0) {
    segments.push({ stage: 'cooldown', duration: settings.cooldown, label: 'Заминка' });
  }

  const routeFragment = document.createDocumentFragment();

  segments.forEach(({ stage, duration, label }) => {
    const segment = document.createElement('span');

    segment.className = `workout-route__segment workout-route__segment--${stage}`;
    segment.style.setProperty('--segment-duration', duration);
    segment.title = `${label} · ${formatTime(duration)}`;
    routeFragment.append(segment);
  });

  routeFutureElement.replaceChildren(routeFragment);
  routeCompletedElement.replaceChildren(...Array.from(routeFutureElement.children, (segment) => segment.cloneNode()));
  workoutRouteElement.classList.toggle('is-compact', segments.length > 20);
  workoutRouteElement.setAttribute(
    'aria-label',
    `Маршрут тренировки: ${settings.cycles} ${formatCyclesLabel(settings.cycles)}, бег ${formatTime(settings.run)}, ходьба ${formatTime(settings.walk)}`,
  );
}

function formatCyclesLabel(cycles) {
  const lastTwoDigits = cycles % 100;
  const lastDigit = cycles % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'циклов';
  }

  if (lastDigit === 1) {
    return 'цикл';
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'цикла';
  }

  return 'циклов';
}

function formatNextStage(state) {
  if (!state.nextStage) {
    return 'Тренировка завершена';
  }

  if (state.nextStage === 'FINISHED') {
    return 'Финиш';
  }

  return `${stageContent[state.nextStage].nextLabel} · ${formatTime(state.nextStageDurationSeconds)}`;
}

function renderSettings() {
  document.querySelectorAll('[data-setting]').forEach((row) => {
    renderSetting(row, row.dataset.setting);
  });
}

function renderSetting(row, key) {
  const config = settingsConfig[key];
  const value = settings[key];
  const firstValue = config.allowedValues[0];
  const lastValue = config.allowedValues.at(-1);

  row.querySelector('[data-value]').textContent = config.format(value);
  row.querySelector('[data-direction="decrease"]').disabled = value <= firstValue;
  row.querySelector('[data-direction="increase"]').disabled = value >= lastValue;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatResultDuration(totalSeconds) {
  if (totalSeconds < 60 * 60) {
    return formatTime(totalSeconds);
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createDurationValues(minSeconds, maxSeconds) {
  const values = [];
  let seconds = minSeconds;

  while (seconds <= maxSeconds) {
    values.push(seconds);

    if (seconds < 60) {
      seconds += 10;
    } else if (seconds < 5 * 60) {
      seconds += 30;
    } else {
      seconds += 60;
    }
  }

  if (values.at(-1) !== maxSeconds) {
    values.push(maxSeconds);
  }

  return values;
}

function createIntegerRange(min, max) {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

function getClosestValue(value, allowedValues) {
  return allowedValues.reduce((closest, allowedValue) => {
    const currentDistance = Math.abs(value - allowedValue);
    const closestDistance = Math.abs(value - closest);

    return currentDistance < closestDistance ? allowedValue : closest;
  });
}

function loadStoredConfiguration() {
  try {
    const storedValue = localStorage.getItem(STORAGE_KEY);

    if (storedValue === null) {
      return null;
    }

    const parsedValue = JSON.parse(storedValue);

    return parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
      ? parsedValue
      : null;
  } catch {
    return null;
  }
}

function loadSettings(savedSettings) {
  const defaults = Object.fromEntries(
    Object.entries(settingsConfig).map(([key, config]) => [key, config.defaultValue]),
  );

  if (!savedSettings) {
    return defaults;
  }

  Object.entries(settingsConfig).forEach(([key, config]) => {
    if (Number.isFinite(savedSettings[key])) {
      defaults[key] = getClosestValue(savedSettings[key], config.allowedValues);
    }
  });

  return defaults;
}

function loadMode(savedSettings) {
  const savedMode = savedSettings?.mode;

  if (savedMode === 'custom' || Object.hasOwn(presets, savedMode)) {
    return savedMode;
  }

  return 'custom';
}

function loadSoundEnabled(savedSettings) {
  const savedValue = savedSettings?.sound;

  if (typeof savedValue === 'boolean') {
    return savedValue;
  }

  // Preserve the value saved by earlier versions of the application.
  return typeof savedSettings?.soundEnabled === 'boolean'
    ? savedSettings.soundEnabled
    : true;
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        warmup: settings.warmup,
        run: settings.run,
        walk: settings.walk,
        cycles: settings.cycles,
        cooldown: settings.cooldown,
        sound: soundEnabled,
        mode: activeMode,
      }),
    );
  } catch {
    // Controls remain functional when storage is unavailable.
  }
}
