const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestContext } = require('./harness');

test('computePeriodStats', async (t) => {
  await t.test('volume and workout count only include dates within the given range', () => {
    const ctx = createTestContext();
    ctx.workouts = [
      { date: '2026-01-05', exercises: [{ name: 'Squat', muscle: 'Legs', sets: 2, reps: 5, weight: 100 }] }, // 1000kg, in range
      { date: '2026-02-05', exercises: [{ name: 'Squat', muscle: 'Legs', sets: 2, reps: 5, weight: 100 }] }  // out of range
    ];
    ctx.restDays = [];
    const stats = ctx.computePeriodStats('2026-01-01', '2026-01-31');
    assert.equal(stats.workoutCount, 1);
    assert.equal(stats.volume, 1000);
  });

  await t.test('PR count uses history before the range as the starting baseline', () => {
    const ctx = createTestContext();
    ctx.workouts = [
      { date: '2025-12-01', exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: 1, reps: 5, weight: 80 }] }, // baseline, before range
      { date: '2026-01-10', exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: 1, reps: 5, weight: 80 }] }, // same as baseline — not a new PR
      { date: '2026-01-20', exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: 1, reps: 5, weight: 85 }] }  // new PR, within range
    ];
    ctx.restDays = [];
    const stats = ctx.computePeriodStats('2026-01-01', '2026-01-31');
    assert.equal(stats.prCount, 1);
  });

  await t.test('an empty period returns all-zero stats, not an error', () => {
    const ctx = createTestContext();
    ctx.workouts = [];
    ctx.restDays = [];
    const stats = ctx.computePeriodStats('2026-01-01', '2026-01-31');
    // Compared field-by-field rather than via assert.deepEqual: `stats` is
    // an object created inside the vm sandbox (a different realm), so a
    // deep-equality check against a plain object literal here fails on
    // prototype identity even when every value matches.
    assert.equal(stats.volume, 0);
    assert.equal(stats.workoutCount, 0);
    assert.equal(stats.prCount, 0);
    assert.equal(stats.bestStreak, 0);
  });

  await t.test('best streak within the period counts rest days bridging gaps', () => {
    const ctx = createTestContext();
    ctx.workouts = [
      { date: '2026-01-01', exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: 1, reps: 5, weight: 60 }] },
      { date: '2026-01-03', exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: 1, reps: 5, weight: 60 }] }
    ];
    ctx.restDays = [{ date: '2026-01-02', restType: 'complete' }];
    const stats = ctx.computePeriodStats('2026-01-01', '2026-01-31');
    assert.equal(stats.bestStreak, 3);
  });
});

test('getMonthBounds', async (t) => {
  await t.test('offset 0 starts on the 1st of the current month', () => {
    const ctx = createTestContext();
    const bounds = ctx.getMonthBounds(0);
    const now = new Date();
    const expectedStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    assert.equal(bounds.start, expectedStart);
  });

  await t.test('offset -1 covers the previous calendar month', () => {
    const ctx = createTestContext();
    // Anchor on a known date rather than "now" so this test is stable
    // regardless of when it's run: pretend "now" is March 2026.
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) return new RealDate(2026, 2, 15); // March 15, 2026
        return new RealDate(...args);
      }
      static now() { return new RealDate(2026, 2, 15).getTime(); }
    }
    ctx.Date = FixedDate;

    const bounds = ctx.getMonthBounds(-1);
    assert.equal(bounds.start, '2026-02-01');
    assert.equal(bounds.end, '2026-02-28');
  });
});
