const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestContext } = require('./harness');

test('calculate1RM', async (t) => {
  const ctx = createTestContext();

  await t.test('1 rep returns the weight itself (no formula applied)', () => {
    assert.equal(ctx.calculate1RM(100, 1), 100);
  });

  await t.test('applies the Epley formula for multiple reps', () => {
    // Epley: weight * (1 + reps/30) => 100 * (1 + 5/30) = 116.666...
    assert.ok(Math.abs(ctx.calculate1RM(100, 5) - 116.6667) < 0.001);
  });

  await t.test('more reps at the same weight yields a higher estimate', () => {
    const low = ctx.calculate1RM(100, 3);
    const high = ctx.calculate1RM(100, 10);
    assert.ok(high > low);
  });
});

test('isStagnant', async (t) => {
  const ctx = createTestContext();

  await t.test('fewer than 3 sessions is never stagnant', () => {
    const sets = [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }];
    assert.equal(ctx.isStagnant(sets), false);
  });

  await t.test('3+ sessions at the same weight with flat/declining reps is stagnant', () => {
    const sets = [
      { weight: 100, reps: 5 }, // most recent
      { weight: 100, reps: 6 },
      { weight: 100, reps: 6 }
    ];
    assert.equal(ctx.isStagnant(sets), true);
  });

  await t.test('a weight increase is not stagnant', () => {
    const sets = [
      { weight: 105, reps: 5 }, // most recent — went up
      { weight: 100, reps: 5 },
      { weight: 100, reps: 5 }
    ];
    assert.equal(ctx.isStagnant(sets), false);
  });

  await t.test('reps climbing each session at the same weight is not stagnant', () => {
    const sets = [
      { weight: 100, reps: 8 }, // most recent — reps improving
      { weight: 100, reps: 7 },
      { weight: 100, reps: 6 }
    ];
    assert.equal(ctx.isStagnant(sets), false);
  });

  await t.test('a different weight partway through breaks the stagnation streak', () => {
    const sets = [
      { weight: 100, reps: 5 },
      { weight: 95, reps: 5 },
      { weight: 100, reps: 5 }
    ];
    assert.equal(ctx.isStagnant(sets), false);
  });
});
