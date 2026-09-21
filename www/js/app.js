'use strict';

const STORAGE_KEY = 'runphase-settings';
const RESULT_STORAGE_KEY = 'runphase-last-workout';
const USER_DATA_RESET_KEY = 'runira-user-data-reset-v1';
const USER_DATA_STORAGE_KEYS = Object.freeze([
  STORAGE_KEY,
  RESULT_STORAGE_KEY,
  'runphase-saved-workouts',
  'runphase-workout-history',
]);
const COUNTDOWN_DURATION_MS = 3000;
const START_MESSAGE_DURATION_MS = 700;
const workoutAudioSources = Object.freeze({
  countdown3: './assets/sounds/countdown-3.mp3',
  countdown2: './assets/sounds/countdown-2.mp3',
  countdown1: './assets/sounds/countdown-1.mp3',
  workoutStarted: './assets/sounds/workout-started.mp3',
  warmup: './assets/sounds/warmup.mp3',
  run: './assets/sounds/run.mp3',
  walk: './assets/sounds/walk.mp3',
  workoutFinished: './assets/sounds/workout-finished.mp3',
});

const settingsConfig = {
  warmup: {
    defaultValue: 180,
    allowedValues: createDurationValues(0, 15 * 60),
    format: formatTime,
  },
  run: {
    defaultValue: 120,
    allowedValues: createRunDurationValues(),
    format: formatTime,
  },
  walk: {
    defaultValue: 60,
    allowedValues: createDurationValues(10, 15 * 60),
    format: formatTime,
  },
  cycles: {
    defaultValue: 6,
    allowedValues: createIntegerRange(1, 100),
    format: String,
  },
};

clearStoredUserDataOnce();

const storedConfiguration = loadStoredConfiguration();
const settings = loadSettings(storedConfiguration);
let soundEnabled = loadSoundEnabled(storedConfiguration);
let themePreference = loadThemePreference(storedConfiguration);
const screenElements = Array.from(document.querySelectorAll('[data-screen]'));
const screens = new Map(screenElements.map((screen) => [screen.dataset.screen, screen]));
const homeElement = screens.get('home');
const workoutsScreenElement = screens.get('workouts');
const historyScreenElement = screens.get('history');
const bottomNavigationElement = document.querySelector('[data-bottom-navigation]');
const bottomNavigationItems = Array.from(
  bottomNavigationElement.querySelectorAll('[data-nav-target]'),
);
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
const themeOptionsElement = document.querySelector('[data-theme-options]');
const themeColorElement = document.querySelector('meta[name="theme-color"]');
const resultTotalTimeElement = document.querySelector('[data-result-total-time]');
const resultRunTimeElement = document.querySelector('[data-result-run-time]');
const resultWalkTimeElement = document.querySelector('[data-result-walk-time]');
const resultCyclesElement = document.querySelector('[data-result-cycles]');
const resultPercentageElement = document.querySelector('[data-result-percentage]');
const resultRepeatElement = document.querySelector('[data-result-repeat]');
const resultHomeElement = document.querySelector('[data-result-home]');
const workoutsListElement = document.querySelector('[data-workouts-list]');
const workoutsEmptyElement = document.querySelector('[data-workouts-empty]');
const workoutsCreateMoreElement = document.querySelector('[data-workouts-create-more]');
const calendarMonthElement = document.querySelector('[data-calendar-month]');
const calendarGridElement = document.querySelector('[data-calendar-grid]');
const calendarPreviousElement = document.querySelector('[data-calendar-previous]');
const calendarNextElement = document.querySelector('[data-calendar-next]');
const historyDayListElement = document.querySelector('[data-history-day-list]');
const historyDayEmptyElement = document.querySelector('[data-history-day-empty]');
const workoutEditorElement = document.querySelector('[data-workout-editor]');
const workoutEditorFormElement = document.querySelector('[data-workout-editor-form]');
const workoutEditorSettingsElement = document.querySelector('[data-workout-editor-settings]');
const workoutNameElement = document.querySelector('[data-workout-name]');
const workoutNameErrorElement = document.querySelector('[data-workout-name-error]');
const closeWorkoutEditorElement = document.querySelector('[data-close-workout-editor]');
const workoutEditorTitleElement = document.querySelector('[data-workout-editor-title]');
const workoutEditorSaveElement = document.querySelector('[data-workout-editor-save]');
const deleteConfirmationElement = document.querySelector('[data-delete-confirmation]');
const deleteWorkoutNameElement = document.querySelector('[data-delete-workout-name]');
const cancelDeleteWorkoutElement = document.querySelector('[data-cancel-delete-workout]');
const confirmDeleteWorkoutElement = document.querySelector('[data-confirm-delete-workout]');
let workoutSession = null;
let activeWorkoutConfiguration = null;
let activeWorkoutName = 'Своя тренировка';
let workoutDraftConfiguration = null;
let editingWorkoutId = null;
let pendingDeleteWorkoutId = null;
let workoutAnimationFrameId = null;
let lastWorkoutRenderKey = '';
let lastVibrationStage = null;
let lastCountdownVibrationKey = '';
let lastAudioStage = null;
let lastAudioCountdownKey = '';
let activeWorkoutAudio = null;
let audioSequenceId = 0;
let hasAnnouncedWorkoutCompletion = false;
let currentScreen = 'home';
const initialCalendarDate = new Date();
let historyCalendarMonth = new Date(
  initialCalendarDate.getFullYear(),
  initialCalendarDate.getMonth(),
  1,
);
let selectedHistoryDate = formatLocalDateKey(initialCalendarDate);

const russianMonthNames = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const stageContent = {
  PREPARE: { label: 'ПОДГОТОВКА', nextLabel: 'Подготовка' },
  WARMUP: { label: 'РАЗМИНКА', nextLabel: 'Разминка' },
  RUN: { label: 'БЕГ', nextLabel: 'Бег' },
  WALK: { label: 'ХОДЬБА', nextLabel: 'Ходьба' },
  FINISHED: { label: 'ГОТОВО', nextLabel: 'Финиш' },
};

const stageAudioKeys = Object.freeze({
  WARMUP: 'warmup',
  RUN: 'run',
  WALK: 'walk',
});

renderSettings();
renderSoundSetting();
applyThemePreference();
renderThemePreference();
renderSavedWorkouts();
showScreen('home');

startButtonElement.addEventListener('click', () => {
  startWorkout(settings, 'Своя тренировка');
});
workoutPauseElement.addEventListener('click', pauseWorkout);
resumeWorkoutElement.addEventListener('click', resumeWorkout);
finishWorkoutElement.addEventListener('click', finishWorkout);
soundToggleElement.addEventListener('click', toggleSound);
themeOptionsElement.addEventListener('click', (event) => {
  const option = event.target.closest('[data-theme-option]');

  if (!option) {
    return;
  }

  themePreference = option.dataset.themeOption;
  applyThemePreference();
  renderThemePreference();
  saveSettings();
});

resultRepeatElement.addEventListener('click', repeatWorkout);
resultHomeElement.addEventListener('click', returnHome);
bottomNavigationElement.addEventListener('click', (event) => {
  const item = event.target.closest('[data-nav-target]');

  if (!item) {
    return;
  }

  const screenName = item.dataset.navTarget;

  if (screenName === 'workouts') {
    renderSavedWorkouts();
  }

  if (screenName === 'history') {
    renderHistoryCalendar();
  }

  showScreen(screenName);
});

calendarPreviousElement.addEventListener('click', () => {
  historyCalendarMonth = new Date(
    historyCalendarMonth.getFullYear(),
    historyCalendarMonth.getMonth() - 1,
    1,
  );
  renderHistoryCalendar();
});

calendarNextElement.addEventListener('click', () => {
  historyCalendarMonth = new Date(
    historyCalendarMonth.getFullYear(),
    historyCalendarMonth.getMonth() + 1,
    1,
  );
  renderHistoryCalendar();
});

historyScreenElement.addEventListener('click', (event) => {
  const dayButton = event.target.closest('[data-calendar-date]');

  if (!dayButton) {
    return;
  }

  selectedHistoryDate = dayButton.dataset.calendarDate;
  renderHistoryCalendar();
});

workoutsScreenElement.addEventListener('click', (event) => {
  const createButton = event.target.closest('[data-create-workout]');

  if (createButton) {
    openWorkoutEditor();
    return;
  }

  const startButton = event.target.closest('[data-start-saved-workout]');

  if (startButton) {
    const workout = globalThis.getSavedWorkoutById(startButton.dataset.startSavedWorkout);

    if (workout) {
      startWorkout(workout, workout.name);
    }

    return;
  }

  const menuButton = event.target.closest('[data-workout-menu-button]');

  if (menuButton) {
    toggleWorkoutMenu(menuButton);
    return;
  }

  const menuAction = event.target.closest('[data-workout-menu-action]');

  if (!menuAction) {
    return;
  }

  const workoutId = menuAction.dataset.workoutId;
  const workout = globalThis.getSavedWorkoutById(workoutId);

  if (!workout) {
    renderSavedWorkouts();
    return;
  }

  if (menuAction.dataset.workoutMenuAction === 'edit') {
    openWorkoutEditor(workout);
    return;
  }

  if (menuAction.dataset.workoutMenuAction !== 'delete') {
    return;
  }

  openDeleteConfirmation(workout);
});

homeElement.addEventListener('click', (event) => {
  if (changeWorkoutSetting(event, settings, homeElement)) {
    saveSettings();
  }
});

workoutEditorSettingsElement.addEventListener('click', (event) => {
  changeWorkoutSetting(event, workoutDraftConfiguration, workoutEditorSettingsElement);
});

closeWorkoutEditorElement.addEventListener('click', closeWorkoutEditor);
cancelDeleteWorkoutElement.addEventListener('click', closeDeleteConfirmation);
confirmDeleteWorkoutElement.addEventListener('click', confirmDeleteWorkout);
deleteConfirmationElement.addEventListener('click', (event) => {
  if (event.target === deleteConfirmationElement) {
    closeDeleteConfirmation();
  }
});
workoutNameElement.addEventListener('input', clearWorkoutNameError);
workoutEditorFormElement.addEventListener('submit', (event) => {
  event.preventDefault();

  const name = workoutNameElement.value.trim();

  if (!name) {
    showWorkoutNameError('Введите название тренировки');
    workoutNameElement.focus();
    return;
  }

  const workoutChanges = {
    name,
    ...workoutDraftConfiguration,
  };
  const savedWorkout = editingWorkoutId
    ? globalThis.updateWorkout(editingWorkoutId, workoutChanges)
    : globalThis.saveWorkout(workoutChanges);

  if (!savedWorkout) {
    showWorkoutNameError(
      editingWorkoutId ? 'Не удалось обновить тренировку' : 'Не удалось сохранить тренировку',
    );
    return;
  }

  closeWorkoutEditor();
  renderSavedWorkouts();
});

function startWorkout(workoutConfiguration, workoutName = 'Своя тренировка') {
  activeWorkoutConfiguration = getWorkoutConfiguration(workoutConfiguration);
  activeWorkoutName = typeof workoutName === 'string' && workoutName.trim()
    ? workoutName.trim()
    : 'Своя тренировка';
  workoutSession = new WorkoutSession({
    prepare: 0,
    warmup: activeWorkoutConfiguration.warmup,
    run: activeWorkoutConfiguration.run,
    walk: activeWorkoutConfiguration.walk,
    cycles: activeWorkoutConfiguration.cycles,
  });

  startPreparation();
}

function startPreparation() {
  const countdownStartedAt = Date.now();
  let visibleValue = null;

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
  const workoutConfiguration = activeWorkoutConfiguration || getWorkoutConfiguration(settings);

  buildWorkoutRoute(workoutConfiguration);
  lastWorkoutRenderKey = '';
  lastVibrationStage = null;
  lastCountdownVibrationKey = '';
  lastAudioStage = null;
  lastAudioCountdownKey = '';
  hasAnnouncedWorkoutCompletion = false;
  cancelWorkoutAudio();

  if (!workoutSession) {
    return;
  }

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

  cancelWorkoutAudio();
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
  cancelWorkoutAudio();

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

  const summary = workoutSession.getSummary();

  if (summary.status !== 'finished') {
    cancelWorkoutAudio();
  }

  const workoutRecord = createWorkoutRecord(summary);

  globalThis.saveWorkoutHistoryRecord(workoutRecord);
  storeLastWorkoutResult(workoutRecord);
  resultTotalTimeElement.textContent = formatResultDuration(summary.totalSeconds);
  resultRunTimeElement.textContent = formatResultDuration(summary.runSeconds);
  resultWalkTimeElement.textContent = formatResultDuration(summary.walkSeconds);
  resultCyclesElement.textContent = String(summary.completedCycles);
  resultPercentageElement.textContent = `${summary.completionPercentage}%`;
  pauseOverlayElement.hidden = true;
  showScreen('result');

  if (summary.status === 'finished' && !hasAnnouncedWorkoutCompletion) {
    hasAnnouncedWorkoutCompletion = true;
    playWorkoutAudio('workoutFinished');
  }

  workoutSession = null;
  resultHomeElement.focus();
}

function storeLastWorkoutResult(workoutRecord) {
  try {
    localStorage.setItem(
      RESULT_STORAGE_KEY,
      JSON.stringify({
        ...workoutRecord,
        settings: { ...settings },
      }),
    );
  } catch (error) {
    // The result screen remains usable when local storage is unavailable.
  }
}

function repeatWorkout() {
  startWorkout(activeWorkoutConfiguration || settings, activeWorkoutName);
}

function returnHome() {
  showScreen('home');
  startButtonElement.focus();
}

function createWorkoutRecord(summary) {
  const endedAt = new Date().toISOString();

  return Object.freeze({
    id: createWorkoutId(),
    date: endedAt,
    endedAt,
    name: activeWorkoutName,
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

function showScreen(screenName) {
  if (!screens.has(screenName)) {
    throw new Error(`Unknown screen: ${screenName}`);
  }

  const activeElement = document.activeElement;
  const activeScreen = activeElement instanceof HTMLElement
    ? activeElement.closest('[data-screen]')
    : null;

  if (activeScreen && activeScreen.dataset.screen !== screenName) {
    activeElement.blur();
  }

  screenElements.forEach((screen) => {
    const isActive = screen.dataset.screen === screenName;

    screen.hidden = !isActive;
    screen.setAttribute('aria-hidden', String(!isActive));
  });

  currentScreen = screenName;
  document.body.dataset.screen = screenName;
  updateBottomNavigation(screenName);
  window.scrollTo(0, 0);
  requestAnimationFrame(() => window.scrollTo(0, 0));
}

function updateBottomNavigation(screenName) {
  const hasOpenDialog = !workoutEditorElement.hidden || !deleteConfirmationElement.hidden;
  const isHidden = hasOpenDialog || ['countdown', 'workout', 'result'].includes(screenName);

  document.body.classList.toggle('is-modal-open', hasOpenDialog);
  bottomNavigationElement.hidden = isHidden;
  bottomNavigationItems.forEach((item) => {
    const isCurrent = item.dataset.navTarget === screenName;

    if (isCurrent) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });
}

function renderHistoryCalendar() {
  const year = historyCalendarMonth.getFullYear();
  const month = historyCalendarMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const workoutDates = new Set(globalThis.getWorkoutDates());
  const today = formatLocalDateKey(new Date());
  const fragment = document.createDocumentFragment();

  calendarMonthElement.textContent = `${russianMonthNames[month]} ${year}`;
  calendarGridElement.setAttribute(
    'aria-label',
    `Календарь: ${russianMonthNames[month]} ${year}`,
  );

  for (let cellIndex = 0; cellIndex < totalCells; cellIndex += 1) {
    const day = cellIndex - firstWeekday + 1;

    if (day < 1 || day > daysInMonth) {
      const emptyCell = document.createElement('span');

      emptyCell.className = 'history-calendar__empty-day';
      emptyCell.setAttribute('aria-hidden', 'true');
      fragment.append(emptyCell);
      continue;
    }

    const date = new Date(year, month, day);
    const dateKey = formatLocalDateKey(date);
    const hasWorkout = workoutDates.has(dateKey);
    const dayButton = document.createElement('button');
    const dayNumber = document.createElement('span');

    dayButton.className = 'history-calendar__day';
    dayButton.type = 'button';
    dayButton.dataset.calendarDate = dateKey;
    dayButton.setAttribute('role', 'gridcell');
    dayButton.setAttribute('aria-selected', String(dateKey === selectedHistoryDate));
    dayButton.setAttribute(
      'aria-label',
      `${formatCalendarDateLabel(date)}${hasWorkout ? ', есть тренировка' : ''}`,
    );
    dayButton.classList.toggle('is-today', dateKey === today);
    dayButton.classList.toggle('is-selected', dateKey === selectedHistoryDate);
    dayNumber.className = 'history-calendar__day-number';
    dayNumber.textContent = String(day);
    dayButton.append(dayNumber);

    if (hasWorkout) {
      dayButton.append(createCalendarFlame());
    }

    fragment.append(dayButton);
  }

  calendarGridElement.textContent = '';
  calendarGridElement.append(fragment);
  renderSelectedHistoryDay();
}

function renderSelectedHistoryDay() {
  const workouts = globalThis.getWorkoutsForDate(selectedHistoryDate)
    .sort((first, second) => (
      second.totalDuration - first.totalDuration
      || Date.parse(second.endedAt) - Date.parse(first.endedAt)
    ));
  const fragment = document.createDocumentFragment();

  workouts.forEach((workout) => {
    fragment.append(createHistoryDayCard(workout));
  });

  historyDayListElement.textContent = '';
  historyDayListElement.append(fragment);
  historyDayListElement.hidden = workouts.length === 0;
  historyDayEmptyElement.hidden = workouts.length > 0;
}

function createHistoryDayCard(workout) {
  const card = document.createElement('article');
  const header = document.createElement('header');
  const title = document.createElement('h4');
  const time = document.createElement('time');
  const duration = document.createElement('p');
  const details = document.createElement('dl');

  card.className = 'history-day-card';
  header.className = 'history-day-card__header';
  title.className = 'history-day-card__title';
  title.textContent = workout.name;
  time.className = 'history-day-card__time';
  time.dateTime = workout.endedAt;
  time.textContent = formatHistoryWorkoutTime(workout.endedAt);
  duration.className = 'history-day-card__duration';
  duration.textContent = formatTotalDuration(workout.totalDuration);
  details.className = 'history-day-card__details';
  details.append(
    createHistoryDayMetric('Бег', formatHistoryWorkoutDuration(workout.runDuration), 'run'),
    createHistoryDayMetric('Ходьба', formatHistoryWorkoutDuration(workout.walkDuration), 'walk'),
    createHistoryDayMetric('Циклы', `${workout.completedCycles} / ${workout.totalCycles}`),
  );
  if (workout.name !== 'Своя тренировка') {
    header.append(title);
  }

  header.append(time);
  card.append(header, duration, details);

  return card;
}

function createHistoryDayMetric(label, value, variant = '') {
  const metric = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');

  metric.className = `history-day-card__metric${variant ? ` history-day-card__metric--${variant}` : ''}`;
  term.textContent = `${label}:`;
  description.textContent = value;
  metric.append(term, description);

  return metric;
}

function formatHistoryWorkoutTime(timestamp) {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(timestamp));
}

function formatHistoryWorkoutDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return seconds === 0 ? `${minutes} мин` : `${minutes} мин ${seconds} сек`;
}

function formatTotalDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours === 0) {
    return formatHistoryWorkoutDuration(totalSeconds);
  }

  const parts = [`${hours} ч`];

  if (minutes > 0) {
    parts.push(`${minutes} мин`);
  }

  if (seconds > 0) {
    parts.push(`${seconds} сек`);
  }

  return parts.join(' ');
}

function createCalendarFlame() {
  const flame = document.createElement('span');

  flame.className = 'history-calendar__flame';
  flame.setAttribute('aria-hidden', 'true');
  flame.innerHTML = '<svg viewBox="-33 0 255 255" focusable="false"><path fill="#ff6a0d" d="M187.899 164.809C185.803 214.868 144.574 254.812 94 254.812 42.085 254.812 0 211.312 0 160.812c0-6.75-.121-20.24 10-43 6.057-13.621 9.856-22.178 12-30 1.178-4.299 3.469-11.129 10 0 3.851 6.562 4 16 4 16s14.328-10.995 24-32c14.179-30.793 2.866-49.2-1-62-1.338-4.428-2.178-12.386 7-.999 9.352 3.451 34.076 20.758 47 39 18.445 26.035 25 61 25 61s5.906-7.33 8-15c2.365-8.661 2.4-17.239 9.999-7.999 7.227 8.787 17.96 25.3 24.001 41 10.969 28.509 7.899 55.997 7.899 55.997Z" fill-rule="evenodd"/><path fill="#fc9502" d="M94 254.812c-35.899 0-65-29.101-65-65 0-21.661 8.729-34.812 26.896-52.646 11.632-11.419 22.519-25.444 27.146-34.994.911-1.88 2.984-11.677 10.977-.206 4.193 6.016 10.766 16.715 14.981 25.846 7.266 15.743 9 31 9 31s7.121-4.196 12-15c1.573-3.482 4.753-16.664 13.643-3.484 6.523 9.672 15.484 27.062 15.357 49.484 0 35.899-29.102 65-65 65Z" fill-rule="evenodd"/><path fill="#fce202" d="M95 183.812c9.25 0 9.25 17.129 21 40 7.824 15.229-3.879 41-21 41s-26-13.879-26-41c0-17.12 16.75-40 26-40Z" fill-rule="evenodd"/></svg>';

  return flame;
}

function formatLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatCalendarDateLabel(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function openWorkoutEditor(workout = null) {
  const isEditing = Boolean(workout && workout.id);

  editingWorkoutId = isEditing ? workout.id : null;
  workoutDraftConfiguration = getWorkoutConfiguration(isEditing ? workout : settings);
  workoutNameElement.value = isEditing ? workout.name : '';
  workoutEditorTitleElement.textContent = isEditing ? 'ИЗМЕНИТЬ ТРЕНИРОВКУ' : 'НОВАЯ ТРЕНИРОВКА';
  workoutEditorSaveElement.textContent = isEditing ? 'СОХРАНИТЬ ИЗМЕНЕНИЯ' : 'СОХРАНИТЬ';
  closeWorkoutEditorElement.setAttribute(
    'aria-label',
    isEditing ? 'Закрыть окно изменения тренировки' : 'Закрыть окно создания тренировки',
  );
  clearWorkoutNameError();
  renderWorkoutSettings(workoutEditorSettingsElement, workoutDraftConfiguration);
  workoutEditorElement.hidden = false;
  updateBottomNavigation(currentScreen);
  requestAnimationFrame(() => workoutNameElement.focus());
}

function closeWorkoutEditor() {
  workoutEditorElement.hidden = true;
  workoutDraftConfiguration = null;
  editingWorkoutId = null;
  updateBottomNavigation(currentScreen);
}

function openDeleteConfirmation(workout) {
  pendingDeleteWorkoutId = workout.id;
  deleteWorkoutNameElement.textContent = workout.name;
  deleteConfirmationElement.hidden = false;
  updateBottomNavigation(currentScreen);
  requestAnimationFrame(() => confirmDeleteWorkoutElement.focus());
}

function closeDeleteConfirmation() {
  deleteConfirmationElement.hidden = true;
  pendingDeleteWorkoutId = null;
  deleteWorkoutNameElement.textContent = '';
  updateBottomNavigation(currentScreen);
}

function confirmDeleteWorkout() {
  const workoutId = pendingDeleteWorkoutId;

  if (!workoutId) {
    closeDeleteConfirmation();
    return;
  }

  const wasDeleted = globalThis.deleteWorkout(workoutId);

  closeDeleteConfirmation();

  if (wasDeleted) {
    renderSavedWorkouts();
  }
}

function showWorkoutNameError(message) {
  workoutNameErrorElement.textContent = message;
  workoutNameErrorElement.hidden = false;
  workoutNameElement.setAttribute('aria-invalid', 'true');
}

function clearWorkoutNameError() {
  workoutNameErrorElement.textContent = '';
  workoutNameErrorElement.hidden = true;
  workoutNameElement.removeAttribute('aria-invalid');
}

function changeWorkoutSetting(event, workoutConfiguration, container) {
  const button = event.target.closest('.stepper__button');

  if (!button || !container.contains(button) || !workoutConfiguration) {
    return false;
  }

  const row = button.closest('[data-setting]');

  if (!row || !container.contains(row)) {
    return false;
  }

  const key = row.dataset.setting;
  const config = settingsConfig[key];
  const direction = button.dataset.direction === 'increase' ? 1 : -1;
  const currentIndex = config.allowedValues.indexOf(workoutConfiguration[key]);
  const nextIndex = clamp(currentIndex + direction, 0, config.allowedValues.length - 1);

  workoutConfiguration[key] = config.allowedValues[nextIndex];
  renderSetting(row, key, workoutConfiguration);

  return true;
}

function renderSavedWorkouts() {
  const savedWorkouts = globalThis.getSavedWorkouts();
  const fragment = document.createDocumentFragment();

  savedWorkouts.forEach((workout) => {
    fragment.append(createSavedWorkoutCard(workout));
  });

  workoutsListElement.textContent = '';
  workoutsListElement.append(fragment);
  workoutsListElement.hidden = savedWorkouts.length === 0;
  workoutsEmptyElement.hidden = savedWorkouts.length > 0;
  workoutsCreateMoreElement.hidden = savedWorkouts.length === 0;
}

function createSavedWorkoutCard(workout) {
  const card = document.createElement('article');
  const header = document.createElement('header');
  const title = document.createElement('h3');
  const menuButton = document.createElement('button');
  const menu = document.createElement('div');
  const editButton = document.createElement('button');
  const deleteButton = document.createElement('button');
  const details = document.createElement('dl');
  const total = document.createElement('p');
  const startButton = document.createElement('button');

  card.className = 'saved-workout-card';
  header.className = 'saved-workout-card__header';
  title.className = 'saved-workout-card__title';
  title.textContent = workout.name;
  menuButton.className = 'saved-workout-card__menu-button';
  menuButton.type = 'button';
  menuButton.dataset.workoutMenuButton = workout.id;
  menuButton.setAttribute('aria-label', `Меню тренировки «${workout.name}»`);
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle></svg>';
  menu.className = 'saved-workout-card__menu';
  menu.dataset.workoutMenu = workout.id;
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  editButton.className = 'saved-workout-card__menu-action';
  editButton.type = 'button';
  editButton.dataset.workoutMenuAction = 'edit';
  editButton.dataset.workoutId = workout.id;
  editButton.textContent = 'Изменить';
  deleteButton.className = 'saved-workout-card__menu-action saved-workout-card__menu-action--danger';
  deleteButton.type = 'button';
  deleteButton.dataset.workoutMenuAction = 'delete';
  deleteButton.dataset.workoutId = workout.id;
  deleteButton.textContent = 'Удалить';
  menu.append(editButton, deleteButton);
  details.className = 'saved-workout-card__details';
  details.append(
    createSavedWorkoutMetric('Бег', formatTime(workout.run), 'run'),
    createSavedWorkoutMetric('Ходьба', formatTime(workout.walk), 'walk'),
    createSavedWorkoutMetric('Циклы', String(workout.cycles)),
  );
  total.className = 'saved-workout-card__total';
  total.textContent = `Общее время: ${formatSavedWorkoutTotal(workout)}`;
  startButton.className = 'saved-workout-card__start';
  startButton.type = 'button';
  startButton.dataset.startSavedWorkout = workout.id;
  startButton.textContent = 'НАЧАТЬ';
  header.append(title, menuButton, menu);
  card.append(header, details, total, startButton);

  return card;
}

function createSavedWorkoutMetric(label, value, variant) {
  const metric = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');

  metric.className = `saved-workout-card__metric saved-workout-card__metric--${variant}`;
  term.textContent = label;
  description.textContent = value;
  metric.append(term, description);

  return metric;
}

function formatSavedWorkoutTotal(workout) {
  const totalSeconds = workout.warmup
    + (workout.run + workout.walk) * workout.cycles;

  return formatTotalDuration(totalSeconds);
}

function toggleWorkoutMenu(menuButton) {
  const workoutId = menuButton.dataset.workoutMenuButton;
  const menu = workoutsListElement.querySelector(`[data-workout-menu="${workoutId}"]`);
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';

  workoutsListElement.querySelectorAll('[data-workout-menu-button]').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
  });
  workoutsListElement.querySelectorAll('[data-workout-menu]').forEach((item) => {
    item.hidden = true;
  });

  if (!isOpen) {
    menuButton.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
  }
}

function getWorkoutConfiguration(source) {
  return {
    warmup: source.warmup,
    run: source.run,
    walk: source.walk,
    cycles: source.cycles,
  };
}

function renderWorkout(state) {
  workoutScreenElement.style.setProperty('--route-progress', `${state.totalProgress * 100}%`);
  provideWorkoutVibration(state);
  provideWorkoutAudio(state);

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
  } catch (error) {
    // Vibration is optional and must not affect the workout when unavailable.
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  renderSoundSetting();
  saveSettings();

  if (!soundEnabled) {
    cancelWorkoutAudio();
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

function applyThemePreference() {
  const root = document.documentElement;

  root.dataset.theme = themePreference;

  if (themeColorElement) {
    themeColorElement.content = getComputedStyle(root)
      .getPropertyValue('--color-background')
      .trim();
  }
}

function renderThemePreference() {
  themeOptionsElement.querySelectorAll('[data-theme-option]').forEach((option) => {
    option.setAttribute(
      'aria-checked',
      String(option.dataset.themeOption === themePreference),
    );
  });
}

function provideWorkoutAudio(state) {
  if (!soundEnabled) {
    return;
  }

  if (state.status !== 'running') {
    if (state.status !== 'finished') {
      cancelWorkoutAudio();
    }

    return;
  }

  if (state.stage !== lastAudioStage) {
    const isFirstStage = lastAudioStage === null;

    lastAudioStage = state.stage;
    lastAudioCountdownKey = '';

    if (isFirstStage) {
      playWorkoutAudio(['workoutStarted', stageAudioKeys[state.stage]]);
    } else if (stageAudioKeys[state.stage]) {
      playWorkoutAudio(stageAudioKeys[state.stage]);
    }
  }

  const countdownAudioKey = {
    3: 'countdown3',
    2: 'countdown2',
    1: 'countdown1',
  }[state.remainingSeconds];

  if (!countdownAudioKey) {
    return;
  }

  const audioKey = `${state.stage}:${state.currentCycle}:${state.remainingSeconds}`;

  if (audioKey === lastAudioCountdownKey) {
    return;
  }

  lastAudioCountdownKey = audioKey;
  playWorkoutAudio(countdownAudioKey);
}

function playWorkoutAudio(audioKeys) {
  if (!soundEnabled) {
    return;
  }

  if (typeof globalThis.Audio !== 'function') {
    return;
  }

  const sequence = Array.isArray(audioKeys) ? audioKeys : [audioKeys];
  const currentSequenceId = ++audioSequenceId;

  stopActiveWorkoutAudio();

  const playNext = (index) => {
    if (
      !soundEnabled
      || currentSequenceId !== audioSequenceId
      || index >= sequence.length
    ) {
      return;
    }

    const source = workoutAudioSources[sequence[index]];

    if (!source) {
      playNext(index + 1);
      return;
    }

    let settled = false;
    const audio = new globalThis.Audio(source);
    activeWorkoutAudio = audio;
    audio.preload = 'auto';

    const finishAudio = () => {
      if (settled) {
        return;
      }

      settled = true;

      if (activeWorkoutAudio === audio) {
        activeWorkoutAudio = null;
      }

      playNext(index + 1);
    };

    audio.addEventListener('ended', finishAudio, { once: true });
    audio.addEventListener('error', finishAudio, { once: true });

    try {
      const playResult = audio.play();

      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(finishAudio);
      }
    } catch (error) {
      finishAudio();
    }
  };

  playNext(0);
}

function stopActiveWorkoutAudio() {
  if (!activeWorkoutAudio) {
    return;
  }

  try {
    activeWorkoutAudio.pause();
    activeWorkoutAudio.currentTime = 0;
  } catch (error) {
    // Audio cues are optional and must not interrupt the workout.
  }

  activeWorkoutAudio = null;
}

function cancelWorkoutAudio() {
  audioSequenceId += 1;
  stopActiveWorkoutAudio();
}

function buildWorkoutRoute(workoutConfiguration) {
  const segments = [];

  if (workoutConfiguration.warmup > 0) {
    segments.push({ stage: 'warmup', duration: workoutConfiguration.warmup, label: 'Разминка' });
  }

  for (let cycle = 1; cycle <= workoutConfiguration.cycles; cycle += 1) {
    segments.push({ stage: 'run', duration: workoutConfiguration.run, label: `Бег, цикл ${cycle}` });
    segments.push({ stage: 'walk', duration: workoutConfiguration.walk, label: `Ходьба, цикл ${cycle}` });
  }

  const routeFragment = document.createDocumentFragment();

  segments.forEach(({ stage, duration, label }) => {
    const segment = document.createElement('span');

    segment.className = `workout-route__segment workout-route__segment--${stage}`;
    segment.style.setProperty('--segment-duration', duration);
    segment.title = `${label} · ${formatTime(duration)}`;
    routeFragment.append(segment);
  });

  routeFutureElement.textContent = '';
  routeFutureElement.append(routeFragment);
  routeCompletedElement.textContent = '';
  routeCompletedElement.append(...Array.from(routeFutureElement.children, (segment) => segment.cloneNode()));
  workoutRouteElement.classList.toggle('is-compact', segments.length > 20);
  workoutRouteElement.setAttribute(
    'aria-label',
    `Маршрут тренировки: ${workoutConfiguration.cycles} ${formatCyclesLabel(workoutConfiguration.cycles)}, бег ${formatTime(workoutConfiguration.run)}, ходьба ${formatTime(workoutConfiguration.walk)}`,
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
  renderWorkoutSettings(homeElement, settings);
}

function renderWorkoutSettings(container, workoutConfiguration) {
  container.querySelectorAll('[data-setting]').forEach((row) => {
    renderSetting(row, row.dataset.setting, workoutConfiguration);
  });
}

function renderSetting(row, key, workoutConfiguration = settings) {
  const config = settingsConfig[key];
  const value = workoutConfiguration[key];
  const firstValue = config.allowedValues[0];
  const lastValue = config.allowedValues[config.allowedValues.length - 1];

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

  if (values[values.length - 1] !== maxSeconds) {
    values.push(maxSeconds);
  }

  return values;
}

function createRunDurationValues() {
  const values = [];

  for (let seconds = 10; seconds <= 60; seconds += 5) {
    values.push(seconds);
  }

  for (let seconds = 70; seconds <= 30 * 60; seconds += 10) {
    values.push(seconds);
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
  } catch (error) {
    return null;
  }
}

function clearStoredUserDataOnce() {
  try {
    if (localStorage.getItem(USER_DATA_RESET_KEY) === 'complete') {
      return;
    }

    USER_DATA_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(USER_DATA_RESET_KEY, 'complete');
  } catch (error) {
    // The application remains usable when local storage is unavailable.
  }
}

function loadSettings(savedSettings) {
  const defaults = {};

  Object.entries(settingsConfig).forEach(([key, config]) => {
    defaults[key] = config.defaultValue;
  });

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

function loadSoundEnabled(savedSettings) {
  const savedValue = savedSettings ? savedSettings.sound : undefined;

  if (typeof savedValue === 'boolean') {
    return savedValue;
  }

  // Preserve the value saved by earlier versions of the application.
  return typeof (savedSettings && savedSettings.soundEnabled) === 'boolean'
    ? savedSettings.soundEnabled
    : true;
}

function loadThemePreference(savedSettings) {
  const savedTheme = savedSettings ? savedSettings.theme : undefined;

  return ['light', 'dark'].includes(savedTheme) ? savedTheme : 'dark';
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
        sound: soundEnabled,
        theme: themePreference,
      }),
    );
  } catch (error) {
    // Controls remain functional when storage is unavailable.
  }
}
