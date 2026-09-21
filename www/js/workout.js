'use strict';

const WORKOUT_STAGE = Object.freeze({
  PREPARE: 'PREPARE',
  WARMUP: 'WARMUP',
  RUN: 'RUN',
  WALK: 'WALK',
  FINISHED: 'FINISHED',
});

const SESSION_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  FINISHED: 'finished',
});

class WorkoutSession {
  /**
   * Durations are expressed in seconds.
   * `now` is injectable so the timeline can be tested without real delays.
   */
  constructor(
    { prepare = 3, warmup, run, walk, cycles },
    { now = Date.now } = {},
  ) {
    this.settings = validateSettings({ prepare, warmup, run, walk, cycles });

    if (typeof now !== 'function') {
      throw new TypeError('now must be a function');
    }

    this._now = now;
    this._timeline = createTimeline(this.settings);
    this._totalDurationMs = this._timeline[this._timeline.length - 1].endMs;
    this._status = SESSION_STATUS.IDLE;
    this._elapsedBeforeRunMs = 0;
    this._runStartedAtMs = null;
    this._lastElapsedMs = 0;
  }

  start() {
    const now = this._getTimestamp();

    this._status = SESSION_STATUS.RUNNING;
    this._elapsedBeforeRunMs = 0;
    this._lastElapsedMs = 0;
    this._runStartedAtMs = now;

    return this._createState(now);
  }

  pause() {
    const now = this._getTimestamp();

    if (this._status === SESSION_STATUS.RUNNING) {
      this._freezeElapsed(now);
      this._status = this._elapsedBeforeRunMs >= this._totalDurationMs
        ? SESSION_STATUS.FINISHED
        : SESSION_STATUS.PAUSED;
    }

    return this._createState(now);
  }

  resume() {
    const now = this._getTimestamp();

    if (this._status === SESSION_STATUS.PAUSED) {
      this._status = SESSION_STATUS.RUNNING;
      this._runStartedAtMs = now;
    }

    return this._createState(now);
  }

  stop() {
    const now = this._getTimestamp();

    if (this._status === SESSION_STATUS.RUNNING) {
      this._freezeElapsed(now);
    }

    if (this._elapsedBeforeRunMs >= this._totalDurationMs) {
      this._status = SESSION_STATUS.FINISHED;
    } else {
      this._status = SESSION_STATUS.STOPPED;
      this._runStartedAtMs = null;
    }

    return this._createState(now);
  }

  getState() {
    return this._createState(this._getTimestamp());
  }

  getSummary() {
    const now = this._getTimestamp();

    this._createState(now);

    const elapsedMs = this._readElapsed(now);
    let runMs = 0;
    let walkMs = 0;
    let completedCycles = 0;

    this._timeline.forEach((segment) => {
      const segmentElapsedMs = clamp(
        elapsedMs - segment.startMs,
        0,
        segment.durationMs,
      );

      if (segment.stage === WORKOUT_STAGE.RUN) {
        runMs += segmentElapsedMs;
      }

      if (segment.stage === WORKOUT_STAGE.WALK) {
        walkMs += segmentElapsedMs;

        if (elapsedMs >= segment.endMs) {
          completedCycles += 1;
        }
      }
    });

    return Object.freeze({
      totalSeconds: Math.floor(elapsedMs / 1000),
      runSeconds: Math.floor(runMs / 1000),
      walkSeconds: Math.floor(walkMs / 1000),
      completedCycles,
      totalCycles: this.settings.cycles,
      completionPercentage: elapsedMs >= this._totalDurationMs
        ? 100
        : Math.floor((elapsedMs / this._totalDurationMs) * 100),
      status: this._status,
    });
  }

  _getTimestamp() {
    const timestamp = this._now();

    if (!Number.isFinite(timestamp)) {
      throw new TypeError('now must return a finite timestamp');
    }

    return timestamp;
  }

  _readElapsed(now) {
    if (this._status !== SESSION_STATUS.RUNNING) {
      return this._elapsedBeforeRunMs;
    }

    const timestampDelta = Math.max(0, now - this._runStartedAtMs);
    const timestampElapsed = this._elapsedBeforeRunMs + timestampDelta;

    // A manual system clock rollback must never make the workout run backwards.
    this._lastElapsedMs = Math.max(this._lastElapsedMs, timestampElapsed);

    return Math.min(this._lastElapsedMs, this._totalDurationMs);
  }

  _freezeElapsed(now) {
    this._elapsedBeforeRunMs = this._readElapsed(now);
    this._lastElapsedMs = this._elapsedBeforeRunMs;
    this._runStartedAtMs = null;
  }

  _createState(now) {
    const elapsedMs = this._readElapsed(now);

    if (this._status === SESSION_STATUS.RUNNING && elapsedMs >= this._totalDurationMs) {
      this._elapsedBeforeRunMs = this._totalDurationMs;
      this._lastElapsedMs = this._totalDurationMs;
      this._runStartedAtMs = null;
      this._status = SESSION_STATUS.FINISHED;
    }

    if (elapsedMs >= this._totalDurationMs) {
      return Object.freeze({
        status: SESSION_STATUS.FINISHED,
        stage: WORKOUT_STAGE.FINISHED,
        remainingSeconds: 0,
        remainingMs: 0,
        currentCycle: this.settings.cycles,
        totalCycles: this.settings.cycles,
        stageProgress: 1,
        totalProgress: 1,
        nextStage: null,
        nextStageDurationSeconds: 0,
      });
    }

    const segmentIndex = this._timeline.findIndex(({ endMs }) => elapsedMs < endMs);
    const segment = this._timeline[segmentIndex];
    const nextSegment = this._timeline[segmentIndex + 1];
    const stageElapsedMs = elapsedMs - segment.startMs;
    const remainingMs = segment.endMs - elapsedMs;

    return Object.freeze({
      status: this._status,
      stage: segment.stage,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      remainingMs,
      currentCycle: segment.cycle,
      totalCycles: this.settings.cycles,
      stageProgress: clamp(stageElapsedMs / segment.durationMs, 0, 1),
      totalProgress: clamp(elapsedMs / this._totalDurationMs, 0, 1),
      nextStage: nextSegment ? nextSegment.stage : WORKOUT_STAGE.FINISHED,
      nextStageDurationSeconds: nextSegment ? nextSegment.durationMs / 1000 : 0,
    });
  }
}

function createTimeline(settings) {
  const timeline = [];
  let cursorMs = 0;

  const addSegment = (stage, durationSeconds, cycle) => {
    if (durationSeconds === 0) {
      return;
    }

    const durationMs = durationSeconds * 1000;

    timeline.push({
      stage,
      cycle,
      startMs: cursorMs,
      endMs: cursorMs + durationMs,
      durationMs,
    });

    cursorMs += durationMs;
  };

  addSegment(WORKOUT_STAGE.PREPARE, settings.prepare, 0);
  addSegment(WORKOUT_STAGE.WARMUP, settings.warmup, 0);

  for (let cycle = 1; cycle <= settings.cycles; cycle += 1) {
    addSegment(WORKOUT_STAGE.RUN, settings.run, cycle);
    addSegment(WORKOUT_STAGE.WALK, settings.walk, cycle);
  }

  return timeline;
}

function validateSettings(settings) {
  validateIntegerInRange('prepare', settings.prepare, 0, Number.MAX_SAFE_INTEGER);
  validateIntegerInRange('warmup', settings.warmup, 0, 15 * 60);
  validateIntegerInRange('run', settings.run, 10, 30 * 60);
  validateIntegerInRange('walk', settings.walk, 10, 15 * 60);
  validateIntegerInRange('cycles', settings.cycles, 1, 100);
  return Object.freeze({ ...settings });
}

function validateIntegerInRange(name, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const WorkoutTimer = WorkoutSession;

globalThis.WorkoutSession = WorkoutSession;
globalThis.WorkoutTimer = WorkoutTimer;
globalThis.WORKOUT_STAGE = WORKOUT_STAGE;
