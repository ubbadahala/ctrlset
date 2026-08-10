function updateStats() {
  // 1. Total Workouts
  animateValue('statTotal', workouts.length);

  // 2. Workouts This Week
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekStartStr = getLocalDateString(weekStart); // Ensure getLocalDateString is defined in your utils!
  
  const weekCount = workouts.filter(w => w.date >= weekStartStr).length;
  animateValue('statWeek', weekCount);

  // 3. Total Volume
  const totalVol = workouts.reduce((acc, w) => {
    return acc + w.exercises.reduce((a, e) => a + (e.sets * e.reps * e.weight), 0);
  }, 0);
  animateValue('statVolume', Math.round(totalVol)); // Passing it as an integer, the helper formats it!

  // 4. Streak Tracking (Workouts + Rest Days)
  const activeDates = new Set([...workouts.map(w => w.date), ...restDays.map(r => r.date)]);
  let streak = 0;
  const today = new Date();
  
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = getLocalDateString(d); 
    if (activeDates.has(ds)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  
  // We don't usually animate small numbers like streaks, but you can if you want! 
  // Let's animate it for the cool factor.
  animateValue('statStreak', streak);

  // 5. Update the Progress Bar
  // (Assuming updateWeeklyTargetBar() handles its own logic, we just call it)
  if (typeof updateWeeklyTargetBar === 'function') {
      updateWeeklyTargetBar();
  }
}

function refreshWorkoutNameDB() {
  const dl = document.getElementById('workout-name-db');
  if (!dl) return;
  const names = [...new Set(workouts.map(w => w.name))];
  dl.innerHTML = names.map(n => `<option value="${n}">`).join('');
}

// Register the service worker after the page has fully loaded, so it
// doesn't compete with initial page-load bandwidth. Enables installing
// CtrlSet to a home screen and loading the app shell offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.error('Service worker registration failed:', err);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();

  document.getElementById('rDate').value = getLocalDateString();
  document.getElementById('wDate').value = getLocalDateString();
  
  // This uses local time automatically, so it's perfectly safe:
  document.getElementById('dateDisplay').textContent =
    now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Restore light mode preference
  if (localStorage.getItem('ctrlset_light_mode') === '1') {
    document.body.classList.add('light-mode');
    const toggle = document.getElementById('lightModeToggle');
    if (toggle) toggle.checked = true;
  }

  // Restore weekly target
  const storedTarget = parseInt(localStorage.getItem('ctrlset_weekly_target') || '0');
  weeklyTarget = storedTarget;
  const targetInput = document.getElementById('weeklyTargetInput');
  if (targetInput && storedTarget) targetInput.value = storedTarget;

  renderExerciseDB();
  refreshWorkoutNameDB();
  renderSettingsExerciseList();
  addExerciseBlock();
  updateStats();
  checkAndRestoreDraft();
  initDetailedChartsState();

  document.getElementById('confirmOverlay').addEventListener('click', e => {
    if (e.target.id === 'confirmOverlay') dismissConfirm();
  });

  document.getElementById('restTypeOverlay').addEventListener('click', e => {
    if (e.target.id === 'restTypeOverlay') dismissRestTypeModal();
  });

  document.getElementById('repeatWorkoutOverlay').addEventListener('click', e => {
    if (e.target.id === 'repeatWorkoutOverlay') dismissRepeatWorkoutModal();
  });

  document.getElementById('injuryNoteOverlay').addEventListener('click', e => {
    if (e.target.id === 'injuryNoteOverlay') dismissInjuryNoteModal();
  });

  // Handle PWA install shortcuts (manifest.json "shortcuts" -> ?action=...),
  // letting a long-press on the home screen icon jump straight to a task.
  const shortcutAction = new URLSearchParams(location.search).get('action');
  if (shortcutAction === 'start-workout') {
    setTimeout(() => document.getElementById('wName')?.focus(), 300);
  } else if (shortcutAction === 'log-recovery') {
    setTimeout(() => { if (typeof scrollToRecoveryForm === 'function') scrollToRecoveryForm(); }, 300);
  }
  if (shortcutAction) window.history.replaceState({}, '', location.pathname);
});
