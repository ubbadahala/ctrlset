// js/state.js

// Start empty; these will be populated by Supabase
let recoveryLogs = [];
let workouts = [];
let restDays = []; 
let weeklyTarget = parseInt(localStorage.getItem('ctrlset_weekly_target') || '0');
let trainingDays = []; // array of day-of-week numbers (0=Sun..6=Sat)
let remindersEnabled = false;

let chartInstance = null;
let strengthChartInstance = null;
let bwChartInstance = null;
let radarInstance = null;

const defaultExercises = [
  { name: "Barbell Row",                  muscle: "Back" },
  { name: "Bench Press (Barbell)",         muscle: "Chest" },
  { name: "Bicep Curl (Dumbbell)",         muscle: "Arms" },
  { name: "Calf Raise",                    muscle: "Legs" },
  { name: "Chest Fly (Cable)",             muscle: "Chest" },
  { name: "Deadlift (Barbell)",            muscle: "Back" },
  { name: "Incline Bench Press (Dumbbell)",muscle: "Chest" },
  { name: "Lat Pulldown (Cable)",          muscle: "Back" },
  { name: "Lateral Raise (Dumbbell)",      muscle: "Shoulders" },
  { name: "Leg Press",                     muscle: "Legs" },
  { name: "Overhead Press (Dumbbell)",     muscle: "Shoulders" },
  { name: "Pull-up",                       muscle: "Back" },
  { name: "Romanian Deadlift (Barbell)",   muscle: "Legs" },
  { name: "Squat (Barbell)",               muscle: "Legs" },
  { name: "Tricep Pushdown (Cable)",       muscle: "Arms" },
];

const MUSCLE_OPTIONS = ['', 'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full Body', 'Cardio'];
const HEAVY_COMPOUNDS = ['bench', 'squat', 'deadlift', 'press', 'row', 'pull up', 'leg press'];

let exercisesDB = [...defaultExercises];

// Master Sync Function
async function syncDataFromSupabase() {
  if (!currentUser) return;
  showHistorySkeletons();
  toast("Syncing data... ⏳");

  try {
    // 1. Fetch Workouts & Sets (Notice it is supabaseClient here)
    const { data: wData, error: wErr } = await supabaseClient
      .from('workouts')
      .select('*, workout_sets(*)')
      .eq('user_id', currentUser.id)
      .order('workout_date', { ascending: false });
    
    if (wErr) throw wErr;

    workouts = wData.map(dbW => ({
      id: dbW.id,
      name: dbW.name,
      date: dbW.workout_date,
      duration: dbW.duration_minutes,
      muscle: dbW.primary_muscle,
      notes: dbW.notes,
      exercises: dbW.workout_sets
        .sort((a, b) => a.set_order - b.set_order)
        .map(set => ({
          name: set.exercise_name,
          muscle: set.muscle_group,
          sets: set.sets,
          reps: set.reps,
          weight: parseFloat(set.weight_kg)
        }))
    }));

    // 2. Fetch Recovery Logs (And here)
    const { data: rData, error: rErr } = await supabaseClient
      .from('recovery_logs')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('log_date', { ascending: false });
    
    if (rErr) throw rErr;

    recoveryLogs = rData.map(r => ({
      id: r.id, 
      date: r.log_date,
      sleep: parseFloat(r.sleep_hours) || 0,
      protein: r.protein_g || 0,
      bodyweight: parseFloat(r.bodyweight_kg) || 0,
      zinc: r.zinc,
      creatine: r.creatine,
      soreness: r.soreness
    }));

    // 3. Fetch Rest Days (And here)
    const { data: restData, error: restErr } = await supabaseClient
      .from('rest_days')
      .select('rest_date, rest_type')
      .eq('user_id', currentUser.id);
      
    if (restErr) throw restErr;
    restDays = restData.map(r => ({ date: r.rest_date, restType: r.rest_type || 'complete' }));

    // 4. Custom Exercises (And here)
    const { data: exData } = await supabaseClient
      .from('exercises')
      .select('*')
      .eq('user_id', currentUser.id);
      
    if (exData && exData.length > 0) {
      exercisesDB = exData.map(ex => ({ id: ex.id, name: ex.name, muscle: ex.muscle_group, injuryNote: ex.injury_note || '' }));
    }

    // 5. Fetch User Settings
    const { data: settingsData } = await supabaseClient
      .from('user_settings')
      .select('*')
      .eq('user_id', currentUser.id)
      .single(); // .single() gets the one row for this user

    if (settingsData) {
      // Apply Weekly Target
      weeklyTarget = settingsData.weekly_target || 0;
      const targetInput = document.getElementById('weeklyTargetInput');
      if (targetInput && weeklyTarget > 0) targetInput.value = weeklyTarget;

      // Apply Light Mode (Pass 'false' so we don't accidentally re-trigger a database save while loading)
      const isLight = settingsData.light_mode === '1';
      toggleLightMode(isLight, false); 

      // Apply Workout Reminder settings
      trainingDays = (settingsData.training_days || '').split(',').filter(Boolean).map(Number);
      remindersEnabled = settingsData.reminders_enabled === '1';
      const remindersToggle = document.getElementById('remindersToggle');
      if (remindersToggle) remindersToggle.checked = remindersEnabled;
      document.querySelectorAll('#trainingDayPicker .day-pill').forEach(pill => {
        pill.classList.toggle('active', trainingDays.includes(parseInt(pill.dataset.day, 10)));
      });
    }

    updateStats();
    renderHistory();
    renderProgress();
    renderNutritionInsights();
    refreshWorkoutNameDB();
    renderSettingsExerciseList();
    renderExerciseDB();
    toast("Sync complete! ✅");

    // Let anything that rendered before `workouts` was populated
    // (e.g. a restored draft's last-session bar / live deltas) recompute now.
    document.dispatchEvent(new CustomEvent('ctrlset:workoutsLoaded'));
    checkRecoveryReminder();
    checkWorkoutReminder();
    renderReadinessCard();
    renderProgress();
    maybeShowTutorialForNewUser();
    renderHeatmap();
    renderRadarChart();

  } catch (error) {
    console.error("Sync failed:", error);
    toast("Failed to sync data. Check connection.");
  }
}