'use strict';

(() => {
  const WORKOUT_HISTORY_STORAGE_KEY = 'runphase-workout-history';
  const FALLBACK_WORKOUT_NAME = 'Тренировка';

  function getWorkoutHistory() {
    return readHistoryForDisplay()
      .sort((first, second) => Date.parse(second.endedAt) - Date.parse(first.endedAt));
  }

  function getWorkoutsForDate(date) {
    const requestedDate = getLocalDateKey(date);

    if (!requestedDate) {
      return [];
    }

    return getWorkoutHistory().filter((workout) => (
      getLocalDateKey(workout.endedAt) === requestedDate
    ));
  }

  function getWorkoutDates() {
    const dates = new Set();

    getWorkoutHistory().forEach((workout) => {
      const date = getLocalDateKey(workout.endedAt);

      if (date) {
        dates.add(date);
      }
    });

    return Array.from(dates).sort().reverse();
  }

  function saveWorkoutHistoryRecord(record) {
    const normalizedRecord = normalizeWorkoutRecord(record);

    if (!normalizedRecord) {
      return false;
    }

    try {
      const storedValue = localStorage.getItem(WORKOUT_HISTORY_STORAGE_KEY);
      let storedHistory = [];

      if (storedValue !== null) {
        const parsedHistory = JSON.parse(storedValue);

        // Do not overwrite an unknown or damaged history structure.
        if (!Array.isArray(parsedHistory)) {
          return false;
        }

        storedHistory = parsedHistory;
      }

      if (storedHistory.some((item) => item?.id === normalizedRecord.id)) {
        return true;
      }

      storedHistory.unshift(toStoredRecord(normalizedRecord));
      localStorage.setItem(WORKOUT_HISTORY_STORAGE_KEY, JSON.stringify(storedHistory));
      return true;
    } catch {
      return false;
    }
  }

  function readHistoryForDisplay() {
    try {
      const storedValue = localStorage.getItem(WORKOUT_HISTORY_STORAGE_KEY);

      if (storedValue === null) {
        return [];
      }

      const parsedHistory = JSON.parse(storedValue);

      if (!Array.isArray(parsedHistory)) {
        return [];
      }

      return parsedHistory
        .map(normalizeWorkoutRecord)
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function normalizeWorkoutRecord(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return null;
    }

    const endedAt = getWorkoutTimestamp(record);

    if (
      typeof record.id !== 'string'
      || record.id.length === 0
      || !endedAt
      || !isNonNegativeInteger(record.totalDuration)
      || !isNonNegativeInteger(record.runDuration)
      || !isNonNegativeInteger(record.walkDuration)
      || !isNonNegativeInteger(record.completedCycles)
      || !Number.isInteger(record.totalCycles)
      || record.totalCycles <= 0
      || record.completedCycles > record.totalCycles
    ) {
      return null;
    }

    return {
      id: record.id,
      date: endedAt,
      endedAt,
      name: getWorkoutName(record),
      totalDuration: record.totalDuration,
      runDuration: record.runDuration,
      walkDuration: record.walkDuration,
      completedCycles: record.completedCycles,
      totalCycles: record.totalCycles,
    };
  }

  function getWorkoutTimestamp(record) {
    const candidates = [record.endedAt, record.completedAt, record.date];
    const timestamp = candidates.find((value) => (
      typeof value === 'string' && Number.isFinite(Date.parse(value))
    ));

    return timestamp ?? null;
  }

  function getWorkoutName(record) {
    const candidates = [record.name, record.workoutName];
    const name = candidates.find((value) => (
      typeof value === 'string' && value.trim().length > 0
    ));

    return name ? name.trim() : FALLBACK_WORKOUT_NAME;
  }

  function toStoredRecord(record) {
    return {
      id: record.id,
      date: record.endedAt,
      endedAt: record.endedAt,
      name: record.name,
      totalDuration: record.totalDuration,
      runDuration: record.runDuration,
      walkDuration: record.walkDuration,
      completedCycles: record.completedCycles,
      totalCycles: record.totalCycles,
    };
  }

  function getLocalDateKey(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      const localDate = new Date(year, month - 1, day);

      return localDate.getFullYear() === year
        && localDate.getMonth() === month - 1
        && localDate.getDate() === day
        ? value
        : null;
    }

    const parsedDate = value instanceof Date ? new Date(value.getTime()) : new Date(value);

    if (!Number.isFinite(parsedDate.getTime())) {
      return null;
    }

    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
  }

  Object.assign(globalThis, {
    getWorkoutHistory,
    getWorkoutsForDate,
    getWorkoutDates,
    saveWorkoutHistoryRecord,
  });
})();
