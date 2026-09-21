'use strict';

(() => {
  const SAVED_WORKOUTS_STORAGE_KEY = 'runphase-saved-workouts';

  const workoutFields = Object.freeze({
    warmup: { min: 0, max: 15 * 60 },
    run: { min: 10, max: 30 * 60 },
    walk: { min: 10, max: 15 * 60 },
    cycles: { min: 1, max: 100 },
  });

  function getSavedWorkouts() {
    return readSavedWorkouts().map(cloneWorkout);
  }

  function saveWorkout(workout) {
    const values = validateWorkoutValues(workout);
    const timestamp = new Date().toISOString();
    const savedWorkout = {
      id: createWorkoutId(),
      ...values,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const workouts = readSavedWorkouts();

    workouts.unshift(savedWorkout);

    return writeSavedWorkouts(workouts) ? cloneWorkout(savedWorkout) : null;
  }

  function updateWorkout(id, changes) {
    if (typeof id !== 'string' || id.length === 0) {
      return null;
    }

    const workouts = readSavedWorkouts();
    const workoutIndex = workouts.findIndex((workout) => workout.id === id);

    if (workoutIndex === -1) {
      return null;
    }

    const currentWorkout = workouts[workoutIndex];
    const values = validateWorkoutValues({ ...currentWorkout, ...changes });
    const updatedWorkout = {
      id: currentWorkout.id,
      ...values,
      createdAt: currentWorkout.createdAt,
      updatedAt: createUpdatedTimestamp(currentWorkout.updatedAt),
    };

    workouts[workoutIndex] = updatedWorkout;

    return writeSavedWorkouts(workouts) ? cloneWorkout(updatedWorkout) : null;
  }

  function deleteWorkout(id) {
    if (typeof id !== 'string' || id.length === 0) {
      return false;
    }

    const workouts = readSavedWorkouts();
    const remainingWorkouts = workouts.filter((workout) => workout.id !== id);

    if (remainingWorkouts.length === workouts.length) {
      return false;
    }

    return writeSavedWorkouts(remainingWorkouts);
  }

  function getSavedWorkoutById(id) {
    if (typeof id !== 'string' || id.length === 0) {
      return null;
    }

    const workout = readSavedWorkouts().find((item) => item.id === id);

    return workout ? cloneWorkout(workout) : null;
  }

  function readSavedWorkouts() {
    try {
      const storedValue = localStorage.getItem(SAVED_WORKOUTS_STORAGE_KEY);

      if (storedValue === null) {
        return [];
      }

      const parsedValue = JSON.parse(storedValue);

      if (!Array.isArray(parsedValue)) {
        return [];
      }

      const ids = new Set();

      return parsedValue.filter((workout) => {
        if (!isValidSavedWorkout(workout) || ids.has(workout.id)) {
          return false;
        }

        ids.add(workout.id);
        return true;
      });
    } catch (error) {
      return [];
    }
  }

  function writeSavedWorkouts(workouts) {
    try {
      localStorage.setItem(SAVED_WORKOUTS_STORAGE_KEY, JSON.stringify(workouts));
      return true;
    } catch (error) {
      return false;
    }
  }

  function validateWorkoutValues(workout) {
    if (!workout || typeof workout !== 'object' || Array.isArray(workout)) {
      throw new TypeError('Workout must be an object');
    }

    if (typeof workout.name !== 'string' || workout.name.trim().length === 0) {
      throw new TypeError('Workout name must be a non-empty string');
    }

    const values = { name: workout.name.trim() };

    Object.entries(workoutFields).forEach(([field, limits]) => {
      const value = workout[field];

      if (!Number.isInteger(value) || value < limits.min || value > limits.max) {
        throw new RangeError(
          `${field} must be an integer between ${limits.min} and ${limits.max}`,
        );
      }

      values[field] = value;
    });

    return values;
  }

  function isValidSavedWorkout(workout) {
    if (!workout || typeof workout !== 'object' || Array.isArray(workout)) {
      return false;
    }

    if (typeof workout.id !== 'string' || workout.id.length === 0) {
      return false;
    }

    if (!isValidTimestamp(workout.createdAt) || !isValidTimestamp(workout.updatedAt)) {
      return false;
    }

    try {
      validateWorkoutValues(workout);
      return true;
    } catch (error) {
      return false;
    }
  }

  function isValidTimestamp(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
  }

  function createWorkoutId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `saved-workout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function createUpdatedTimestamp(previousTimestamp) {
    const previousTime = Date.parse(previousTimestamp);
    const nextTime = Math.max(Date.now(), previousTime + 1);

    return new Date(nextTime).toISOString();
  }

  function cloneWorkout(workout) {
    return {
      id: workout.id,
      name: workout.name,
      warmup: workout.warmup,
      run: workout.run,
      walk: workout.walk,
      cycles: workout.cycles,
      createdAt: workout.createdAt,
      updatedAt: workout.updatedAt,
    };
  }

  Object.assign(globalThis, {
    getSavedWorkouts,
    saveWorkout,
    updateWorkout,
    deleteWorkout,
    getSavedWorkoutById,
  });
})();
