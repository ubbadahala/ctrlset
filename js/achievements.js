// ── ACHIEVEMENT DEFINITIONS ──
// type: 'workouts' | 'streak' | 'volume' | 'pr' — matches the running totals
// tracked while computeAchievements() walks through history chronologically.
const ACHIEVEMENT_DEFS = [
  { id: 'workouts_1',   icon: '🎬', title: 'First Session',  desc: 'Log your first workout',        type: 'workouts', target: 1 },
  { id: 'workouts_10',  icon: '🔟', title: '10 Workouts',    desc: 'Log 10 workouts',                type: 'workouts', target: 10 },
  { id: 'workouts_50',  icon: '💪', title: '50 Workouts',    desc: 'Log 50 workouts',                type: 'workouts', target: 50 },
  { id: 'workouts_100', icon: '💯', title: '100 Workouts',   desc: 'Log 100 workouts',               type: 'workouts', target: 100 },

  { id: 'streak_3',     icon: '🔥', title: '3-Day Streak',   desc: 'Train 3 days in a row',          type: 'streak', target: 3 },
  { id: 'streak_7',     icon: '🔥', title: '7-Day Streak',   desc: 'Train 7 days in a row',          type: 'streak', target: 7 },
  { id: 'streak_14',    icon: '🔥', title: '14-Day Streak',  desc: 'Train 14 days in a row',         type: 'streak', target: 14 },
  { id: 'streak_30',    icon: '🔥', title: '30-Day Streak',  desc: 'Train 30 days in a row',         type: 'streak', target: 30 },

  { id: 'vol_1000',     icon: '🏋️', title: '1,000kg Club',   desc: 'Lift 1,000kg total volume',      type: 'volume', target: 1000 },
  { id: 'vol_10000',    icon: '🏋️', title: '10,000kg Club',  desc: 'Lift 10,000kg total volume',     type: 'volume', target: 10000 },
  { id: 'vol_50000',    icon: '🏋️', title: '50,000kg Club',  desc: 'Lift 50,000kg total volume',     type: 'volume', target: 50000 },
  { id: 'vol_100000',   icon: '🏋️', title: '100,000kg Club', desc: 'Lift 100,000kg total volume',    type: 'volume', target: 100000 },
  { id: 'vol_500000',   icon: '🏋️', title: '500,000kg Club', desc: 'Lift 500,000kg total volume',    type: 'volume', target: 500000 },

  { id: 'pr_1',         icon: '🏆', title: 'First PR',       desc: 'Set your first personal record', type: 'pr', target: 1 },
  { id: 'pr_10',        icon: '🏆', title: '10 PRs',         desc: 'Set 10 personal records',        type: 'pr', target: 10 },
  { id: 'pr_50',        icon: '🏆', title: '50 PRs',         desc: 'Set 50 personal records',        type: 'pr', target: 50 },
];

// Longest run of consecutive calendar days within a Set of 'YYYY-MM-DD' strings.
function computeBestStreakFromDates(dateSet) {
  if (!dateSet.size) return 0;
  const dates = [...dateSet].sort();
  let best = 1, current = 1;
  for (let i = 1; i < dates.length; i++) {
    const diffDays = Math.round((new Date(dates[i] + 'T00:00:00') - new Date(dates[i - 1] + 'T00:00:00')) / 86400000);
    if (diffDays === 1) current++;
    else if (diffDays > 1) current = 1;
    best = Math.max(best, current);
  }
  return best;
}

// Walks workouts chronologically, tracking cumulative workout count, best
// streak, total volume, and total PR events, unlocking each badge definition
// the moment its target is first crossed (and recording that workout's date).
function computeAchievements() {
  const results = ACHIEVEMENT_DEFS.map(def => ({ ...def, unlocked: false, unlockedDate: null, current: 0 }));
  if (!workouts.length) return results;

  const sortedWorkouts = [...workouts].sort((a, b) => new Date(a.date) - new Date(b.date));
  const sortedRestDays = [...restDays].sort((a, b) => new Date(a.date) - new Date(b.date));
  let restIdx = 0;

  const datesSoFar = new Set();
  let cumVolume = 0;
  let cumPRs = 0;
  const maxByExercise = {};

  sortedWorkouts.forEach((w, idx) => {
    // Fold in any rest days that occurred on or before this workout's date,
    // so streak calc stays properly chronological.
    while (restIdx < sortedRestDays.length && sortedRestDays[restIdx].date <= w.date) {
      datesSoFar.add(sortedRestDays[restIdx].date);
      restIdx++;
    }
    datesSoFar.add(w.date);

    cumVolume += w.exercises.reduce((a, e) => a + e.sets * e.reps * e.weight, 0);

    // Best set per exercise within this workout, compared against the
    // all-time max seen so far — same "PR" definition used in showRecap().
    const bestPerExercise = {};
    w.exercises.forEach(e => {
      const key = e.name.toLowerCase();
      if (!bestPerExercise[key] || e.weight > bestPerExercise[key].weight) bestPerExercise[key] = e;
    });
    Object.entries(bestPerExercise).forEach(([key, e]) => {
      if (!maxByExercise[key] || e.weight > maxByExercise[key]) {
        maxByExercise[key] = e.weight;
        cumPRs++;
      }
    });

    const bestStreakSoFar = computeBestStreakFromDates(datesSoFar);
    const totalWorkoutsSoFar = idx + 1;
    const valuesByType = { workouts: totalWorkoutsSoFar, streak: bestStreakSoFar, volume: cumVolume, pr: cumPRs };

    results.forEach(r => {
      if (r.unlocked) return;
      r.current = valuesByType[r.type];
      if (r.current >= r.target) {
        r.unlocked = true;
        r.unlockedDate = w.date;
      }
    });
  });

  // Any remaining rest days after the last workout still count toward the
  // final "best streak ever" total shown for still-locked streak badges.
  sortedRestDays.slice(restIdx).forEach(r => datesSoFar.add(r.date));
  const finalTotals = {
    workouts: sortedWorkouts.length,
    streak: computeBestStreakFromDates(datesSoFar),
    volume: cumVolume,
    pr: cumPRs
  };
  results.forEach(r => { if (!r.unlocked) r.current = finalTotals[r.type]; });

  return results;
}

function renderAchievements() {
  const grid = document.getElementById('achievementsGrid');
  const skeleton = document.getElementById('achievementsSkeleton');
  const countEl = document.getElementById('achievementsCount');
  if (!grid) return;
  if (skeleton) skeleton.style.display = 'none';
  grid.style.display = '';

  const achievements = computeAchievements();
  const unlockedCount = achievements.filter(a => a.unlocked).length;
  if (countEl) countEl.textContent = `${unlockedCount}/${achievements.length}`;

  grid.innerHTML = achievements.map(a => {
    const progressLabel = a.unlocked
      ? formatDate(a.unlockedDate)
      : (a.type === 'volume' ? `${Math.round(a.current).toLocaleString()}/${a.target.toLocaleString()}kg` : `${a.current}/${a.target}`);
    return `
      <div class="achievement-badge ${a.unlocked ? 'unlocked' : 'locked'}" title="${a.desc}">
        <div class="achievement-icon">${a.icon}</div>
        <div class="achievement-title">${a.title}</div>
        <div class="achievement-progress">${progressLabel}</div>
      </div>`;
  }).join('');

  if (typeof gsap !== 'undefined') {
    gsap.from(grid.querySelectorAll('.achievement-badge'), {
      opacity: 0, y: 10, duration: 0.3, ease: 'power1.out', stagger: 0.025
    });
  }
}

// Called right after a new workout is saved. Diffs achievements computed
// before vs. after the new workout, and celebrates anything newly unlocked.
function checkForNewAchievements(previousUnlockedIds) {
  const achievements = computeAchievements();
  const newlyUnlocked = achievements.filter(a => a.unlocked && !previousUnlockedIds.has(a.id));

  newlyUnlocked.forEach((a, i) => {
    setTimeout(() => {
      toast(`Achievement Unlocked: ${a.title}`, a.icon);
    }, i * 400);
  });

  if (newlyUnlocked.length && typeof triggerConfetti === 'function') triggerConfetti();

  renderAchievements();
}

function getUnlockedAchievementIds() {
  return new Set(computeAchievements().filter(a => a.unlocked).map(a => a.id));
}
