const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestContext } = require('./harness');

test('computeBestStreakFromDates', async (t) => {
  const ctx = createTestContext();

  await t.test('an empty set has a streak of 0', () => {
    assert.equal(ctx.computeBestStreakFromDates(new Set()), 0);
  });

  await t.test('a single date has a streak of 1', () => {
    assert.equal(ctx.computeBestStreakFromDates(new Set(['2026-01-01'])), 1);
  });

  await t.test('consecutive days all count as one streak', () => {
    const dates = new Set(['2026-01-01', '2026-01-02', '2026-01-03']);
    assert.equal(ctx.computeBestStreakFromDates(dates), 3);
  });

  await t.test('a gap breaks the streak; the longest run wins', () => {
    const dates = new Set([
      '2026-01-01', '2026-01-02',                         // run of 2
      '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08' // run of 4
    ]);
    assert.equal(ctx.computeBestStreakFromDates(dates), 4);
  });

  await t.test('unsorted input dates are handled correctly', () => {
    const dates = new Set(['2026-01-03', '2026-01-01', '2026-01-02']);
    assert.equal(ctx.computeBestStreakFromDates(dates), 3);
  });
});

test('computeAchievements', async (t) => {
  await t.test('no workouts logged -> nothing is unlocked', () => {
    const ctx = createTestContext();
    ctx.workouts = [];
    ctx.restDays = [];
    const results = ctx.computeAchievements();
    assert.ok(results.every(a => !a.unlocked));
  });

  await t.test('logging one workout unlocks the "First Session" badge with its date', () => {
    const ctx = createTestContext();
    ctx.workouts = [
      { date: '2026-01-01', exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: 3, reps: 5, weight: 60 }] }
    ];
    ctx.restDays = [];
    const results = ctx.computeAchievements();
    const badge = results.find(a => a.id === 'workouts_1');
    assert.equal(badge.unlocked, true);
    assert.equal(badge.unlockedDate, '2026-01-01');
  });

  await t.test('volume badges unlock only once cumulative volume crosses their target', () => {
    const ctx = createTestContext();
    // 3 sets x 5 reps x 70kg = 1050kg total — crosses 1,000kg but not 10,000kg
    ctx.workouts = [
      { date: '2026-02-01', exercises: [{ name: 'Squat', muscle: 'Legs', sets: 3, reps: 5, weight: 70 }] }
    ];
    ctx.restDays = [];
    const results = ctx.computeAchievements();
    assert.equal(results.find(a => a.id === 'vol_1000').unlocked, true);
    assert.equal(results.find(a => a.id === 'vol_10000').unlocked, false);
  });

  await t.test('PR count only increments on a genuinely new max weight for an exercise', () => {
    const ctx = createTestContext();
    ctx.workouts = [
      { date: '2026-01-01', exercises: [{ name: 'Deadlift', muscle: 'Back', sets: 1, reps: 5, weight: 100 }] }, // PR #1 (first time seeing this exercise)
      { date: '2026-01-08', exercises: [{ name: 'Deadlift', muscle: 'Back', sets: 1, reps: 5, weight: 100 }] }, // same weight — not a PR
      { date: '2026-01-15', exercises: [{ name: 'Deadlift', muscle: 'Back', sets: 1, reps: 5, weight: 110 }] }  // PR #2
    ];
    ctx.restDays = [];
    const results = ctx.computeAchievements();
    const pr1 = results.find(a => a.id === 'pr_1');
    assert.equal(pr1.unlocked, true);
    assert.equal(pr1.unlockedDate, '2026-01-01'); // unlocked on the FIRST workout, not the third
    const pr10 = results.find(a => a.id === 'pr_10');
    assert.equal(pr10.unlocked, false);
    assert.equal(pr10.current, 2); // only 2 genuine PR events across 3 workouts
  });

  await t.test('rest days bridge gaps between workouts for streak purposes', () => {
    const ctx = createTestContext();
    ctx.workouts = [
      { date: '2026-03-01', exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: 1, reps: 5, weight: 60 }] },
      { date: '2026-03-03', exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: 1, reps: 5, weight: 60 }] }
    ];
    ctx.restDays = [{ date: '2026-03-02', restType: 'complete' }];
    const results = ctx.computeAchievements();
    // Mar 1 (workout), Mar 2 (rest), Mar 3 (workout) = 3 consecutive days
    assert.equal(results.find(a => a.id === 'streak_3').unlocked, true);
  });

  await t.test('a streak badge does not unlock if the gap is never bridged', () => {
    const ctx = createTestContext();
    ctx.workouts = [
      { date: '2026-03-01', exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: 1, reps: 5, weight: 60 }] },
      { date: '2026-03-05', exercises: [{ name: 'Bench Press', muscle: 'Chest', sets: 1, reps: 5, weight: 60 }] }
    ];
    ctx.restDays = []; // no bridging rest days — Mar 1 and Mar 5 are isolated
    const results = ctx.computeAchievements();
    assert.equal(results.find(a => a.id === 'streak_3').unlocked, false);
  });
});
