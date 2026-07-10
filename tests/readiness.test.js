const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestContext } = require('./harness');

// computeReadiness() reads "today" via getLocalDateString() with no
// argument, which resolves to the real current date. To keep these tests
// stable regardless of when they run, dates are expressed relative to
// today rather than hardcoded.
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

test('computeReadiness', async (t) => {
  await t.test('no recovery logs and no workouts -> no signal, stays quiet', () => {
    const ctx = createTestContext();
    ctx.recoveryLogs = [];
    ctx.workouts = [];
    const result = ctx.computeReadiness();
    assert.equal(result.hasSignal, false);
  });

  await t.test('good sleep and low soreness logged today -> fresh', () => {
    const ctx = createTestContext();
    ctx.recoveryLogs = [{ date: ctx.getLocalDateString(), sleep: 8, soreness: 2 }];
    ctx.workouts = [];
    const result = ctx.computeReadiness();
    assert.equal(result.hasSignal, true);
    assert.equal(result.level, 'fresh');
    assert.equal(result.reasons.length, 0);
  });

  await t.test('low sleep + high soreness logged today -> fatigued with reasons', () => {
    const ctx = createTestContext();
    ctx.recoveryLogs = [{ date: ctx.getLocalDateString(), sleep: 4.5, soreness: 8 }];
    ctx.workouts = [];
    const result = ctx.computeReadiness();
    assert.equal(result.level, 'fatigued');
    assert.ok(result.reasons.some(r => r.includes('sleep')));
    assert.ok(result.reasons.some(r => r.includes('soreness')));
  });

  await t.test('a recovery log older than yesterday is ignored as stale', () => {
    const ctx = createTestContext();
    ctx.recoveryLogs = [{ date: ctx.getLocalDateString(daysAgo(5)), sleep: 3, soreness: 9 }];
    ctx.workouts = [];
    const result = ctx.computeReadiness();
    // No workouts either, so with the stale log ignored there's no signal at all
    assert.equal(result.hasSignal, false);
  });

  await t.test('5+ consecutive training days without rest is flagged as at least moderate', () => {
    const ctx = createTestContext();
    ctx.recoveryLogs = [];
    ctx.workouts = [0, 1, 2, 3, 4].map(n => ({
      date: ctx.getLocalDateString(daysAgo(n)),
      exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: 1, reps: 5, weight: 60 }]
    }));
    const result = ctx.computeReadiness();
    assert.equal(result.hasSignal, true);
    // A single strong signal alone scores as 'moderate' under the current
    // weighting (fatigued requires combined signals) — still surfaced,
    // just not the most severe level on its own.
    assert.equal(result.level, 'moderate');
    assert.ok(result.reasons.some(r => r.includes('training days in a row')));
  });

  await t.test('5+ consecutive days PLUS poor recovery combine into fatigued', () => {
    const ctx = createTestContext();
    ctx.recoveryLogs = [{ date: ctx.getLocalDateString(), sleep: 5, soreness: 8 }];
    ctx.workouts = [0, 1, 2, 3, 4].map(n => ({
      date: ctx.getLocalDateString(daysAgo(n)),
      exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: 1, reps: 5, weight: 60 }]
    }));
    const result = ctx.computeReadiness();
    assert.equal(result.level, 'fatigued');
  });

  await t.test('a single moderate flag (short sleep) lands as moderate, not fatigued', () => {
    const ctx = createTestContext();
    ctx.recoveryLogs = [{ date: ctx.getLocalDateString(), sleep: 6.5, soreness: 3 }];
    ctx.workouts = [];
    const result = ctx.computeReadiness();
    assert.equal(result.level, 'moderate');
  });
});
