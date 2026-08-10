function exportJSON() {
  if (!workouts.length && !recoveryLogs.length && !restDays.length) {
    return toast('No data to export!');
  }

  // Create a bundle of all user data including the latest features
  const backupData = {
    version: "4.1", // v4.1: restDays entries now include restType (active/complete)
    workouts: workouts,
    recovery: recoveryLogs,
    exercises: exercisesDB,
    restDays: restDays,
    weeklyTarget: weeklyTarget,
    lightMode: localStorage.getItem('ctrlset_light_mode') || '0'
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `ctrlset_full_backup_${getLocalDateString()}.json`);
  dlAnchorElem.click();
  toast('Full backup exported! 💾');
}

async function importJSON() {
  const fileInput = document.getElementById('importFile');
  const file = fileInput.files[0];
  if (!file) return toast('Please select a JSON file first');
  if (!currentUser) return toast('You must be logged in to import data.');

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      
      const doImport = async () => {
        toast('Uploading to cloud... Please wait ⏳');
        
        // 1. IMPORT CUSTOM EXERCISES FIRST (So we get their IDs)
        // We will build a dictionary to map names to IDs: { "bench press": "uuid-1234", ... }
        const exerciseIdMap = {}; 
        
        // Populate the dictionary with existing exercises from the cloud
        exercisesDB.forEach(ex => {
            if (ex.id) exerciseIdMap[ex.name.toLowerCase()] = ex.id;
        });

        if (imported.exercises && imported.exercises.length > 0) {
          const exercisesToInsert = [];
          const queuedNames = new Set(); // tracks names already queued from THIS import, so duplicates within the file itself are also caught

          for (const ex of imported.exercises) {
            const key = (ex.name || '').toLowerCase();
            // Only queue if it's new — not already in the cloud, and not already queued earlier in this same file
            if (ex.name && key && !exerciseIdMap[key] && !queuedNames.has(key)) {
              exercisesToInsert.push({
                user_id: currentUser.id,
                name: ex.name,
                muscle_group: ex.muscle || ''
              });
              queuedNames.add(key);
            }
          }

          if (exercisesToInsert.length > 0) {
             // Insert the new exercises AND return the data so we get the new IDs
             const { data: newExData, error } = await supabaseClient
                .from('exercises')
                .insert(exercisesToInsert)
                .select();
                
             if (!error && newExData) {
                 // Add the brand new exercises to our dictionary
                 newExData.forEach(ex => {
                     exerciseIdMap[ex.name.toLowerCase()] = ex.id;
                 });
             }
          }
        }

        // 2. IMPORT WORKOUTS (Now we can link the exercise_id)
        if (imported.workouts && imported.workouts.length > 0) {
          for (const w of imported.workouts) {
            const { data: dbW, error: wErr } = await supabaseClient
              .from('workouts')
              .insert({
                user_id: currentUser.id,
                name: w.name,
                workout_date: w.date,
                duration_minutes: w.duration || 0,
                primary_muscle: w.muscle || '',
                notes: w.notes || ''
              })
              .select().single();

            if (!wErr && w.exercises && w.exercises.length > 0) {
              const setsToInsert = w.exercises.map((ex, idx) => ({
                workout_id: dbW.id,
                // Look up the ID from our dictionary! If it doesn't exist, it stays null.
                exercise_id: exerciseIdMap[(ex.name || '').toLowerCase()] || null, 
                exercise_name: ex.name,
                muscle_group: ex.muscle || '',
                sets: ex.sets,
                reps: ex.reps,
                weight_kg: ex.weight,
                set_order: idx
              }));
              await supabaseClient.from('workout_sets').insert(setsToInsert);
            }
          }
        }

        // 3. Import Recovery Logs
        if (imported.recovery && imported.recovery.length > 0) {
          const recoveryToInsert = imported.recovery.map(r => ({
            user_id: currentUser.id,
            log_date: r.date,
            sleep_hours: r.sleep || 0,
            protein_g: r.protein || 0,
            bodyweight_kg: r.bodyweight || 0,
            zinc: r.zinc || false,
            creatine: r.creatine || false,
            soreness: r.soreness || 5
          }));
          await supabaseClient.from('recovery_logs').upsert(recoveryToInsert, { onConflict: 'user_id, log_date' });
        }

        // 4. Import Rest Days
        if (imported.restDays && imported.restDays.length > 0) {
          const restsToInsert = imported.restDays.map(rd => ({
            user_id: currentUser.id,
            rest_date: typeof rd === 'string' ? rd : rd.date,
            rest_type: typeof rd === 'string' ? 'complete' : (rd.restType || 'complete')
          }));
          await supabaseClient.from('rest_days').upsert(restsToInsert, { onConflict: 'user_id, rest_date' });
        }

        // 5. Import Settings 
        if (imported.weeklyTarget !== undefined || imported.lightMode !== undefined) {
           await supabaseClient.from('user_settings').upsert({
              user_id: currentUser.id,
              weekly_target: imported.weeklyTarget || weeklyTarget,
              light_mode: imported.lightMode || (document.body.classList.contains('light-mode') ? '1' : '0')
           }, { onConflict: 'user_id' });
        }

        // Finalize
        await syncDataFromSupabase();
        toast('Data restored to cloud successfully! ✅');
        fileInput.value = '';
      };

      showConfirm({
        icon: '⬆️',
        title: 'Import Backup to Cloud',
        body: 'This will upload and merge your backup file into your cloud database. Continue?',
        confirmLabel: 'Import to Cloud',
        onConfirm: doImport
      });
    } catch (err) {
      console.error(err);
      toast('Error: Invalid backup file.');
    }
  };
  reader.readAsText(file);
}

function exportCSV() {
  if (!workouts.length && !recoveryLogs.length && !restDays.length) return toast('No data to export!');

  let csvContent = "data:text/csv;charset=utf-8,";

  // ── WORKOUTS SECTION ──
  if (workouts.length) {
    csvContent += "WORKOUTS\n";
    csvContent += "Date,Workout Name,Duration (min),Exercise,Muscle,Sets,Reps,Weight (kg),Est. 1RM (kg),Volume (kg),Notes\n";

    workouts.forEach(w => {
      const date = w.date;
      const wName = `"${w.name || ''}"`;
      const dur = w.duration || '';
      const notes = `"${(w.notes || '').replace(/"/g, '""')}"`;

      w.exercises.forEach(e => {
        const eName = `"${e.name || ''}"`;
        const eMuscle = e.muscle || '';
        const oneRM = Math.round(calculate1RM(e.weight, e.reps));
        const volume = Math.round(e.sets * e.reps * e.weight);
        const row = [date, wName, dur, eName, eMuscle, e.sets, e.reps, e.weight, oneRM, volume, notes].join(",");
        csvContent += row + "\n";
      });
    });
  }

  // ── RECOVERY LOG SECTION ──
  if (recoveryLogs.length) {
    csvContent += "\nRECOVERY LOG\n";
    csvContent += "Date,Sleep (hrs),Protein (g),Bodyweight (kg),Zinc,Creatine,Soreness (1-10)\n";

    [...recoveryLogs]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach(r => {
        const row = [
          r.date,
          r.sleep || 0,
          r.protein || 0,
          r.bodyweight || '',
          r.zinc ? 'Yes' : 'No',
          r.creatine ? 'Yes' : 'No',
          r.soreness || ''
        ].join(",");
        csvContent += row + "\n";
      });
  }

  // ── REST DAYS SECTION ──
  if (restDays.length) {
    csvContent += "\nREST DAYS\nDate,Type\n";
    [...restDays].sort((a, b) => a.date.localeCompare(b.date)).forEach(r => {
      csvContent += `${r.date},${r.restType === 'active' ? 'Active Rest' : 'Complete Rest'}\n`;
    });
  }

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `ctrlset_export_${getLocalDateString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast('Full CSV exported! 📊');
}

function clearAllData() {
  if (!currentUser) return toast("You must be logged in.");

  showConfirm({
    icon: '⚠️',
    title: 'Wipe Cloud Data',
    body: 'This permanently deletes ALL your workouts, recovery logs, and custom exercises from the cloud. Make sure you exported a backup first!',
    confirmLabel: 'Delete Everything',
    danger: true,
    onConfirm: async () => {
      toast('Wiping cloud data... ⏳');
      try {
        // Because of Foreign Keys, delete sets first, then workouts
        await supabaseClient.from('workout_sets').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Trick to delete all for this user via RLS
        await supabaseClient.from('workouts').delete().eq('user_id', currentUser.id);
        await supabaseClient.from('recovery_logs').delete().eq('user_id', currentUser.id);
        await supabaseClient.from('rest_days').delete().eq('user_id', currentUser.id);
        await supabaseClient.from('exercises').delete().eq('user_id', currentUser.id);
        
        // Resync to clear the screen
        await syncDataFromSupabase();
        toast('All cloud data wiped. 🗑️');
      } catch (err) {
        console.error(err);
        toast('Error wiping data.');
      }
    }
  });
}

function renderExerciseDB() {
  const datalist = document.getElementById('exercise-db');
  datalist.innerHTML = exercisesDB.map(ex => `<option value="${ex.name}">`).join('');
}

function renderSettingsExerciseList() {
  const list = document.getElementById('settingsExerciseList');
  if (exercisesDB.length === 0) {
    list.innerHTML = `<div style="padding:16px;color:var(--text);opacity:0.6;font-size:0.85rem;text-align:center;">No exercises found.</div>`;
    return;
  }

  list.innerHTML = exercisesDB.map((ex, index) => `
    <div class="settings-exercise-row">
      <input type="text" value="${ex.name}" class="settings-exercise-name"
        onchange="renameExercise(${index}, this.value)"
        onfocus="this.style.borderColor='rgba(224,138,62,0.5)'"
        onblur="this.style.borderColor='var(--glass-border)'">
      <select class="settings-exercise-muscle" style="color:${ex.muscle?'var(--text)':'var(--muted)'};"
        onchange="setExerciseMuscle(${index}, this.value)"
        onfocus="this.style.borderColor='rgba(224,138,62,0.5)'"
        onblur="this.style.borderColor='var(--glass-border)'">
        ${MUSCLE_OPTIONS.map(m => `<option value="${m}" ${ex.muscle === m ? 'selected' : ''}>${m || 'Select muscle'}</option>`).join('')}
      </select>
      <div class="settings-exercise-actions">
        <button class="btn-icon" style="${ex.injuryNote ? 'background:rgba(201,105,79,0.15);border-color:rgba(201,105,79,0.4);' : ''}" onclick="setExerciseInjuryNote(${index})" title="${ex.injuryNote ? escapeHtml(ex.injuryNote) : 'Flag an injury concern'}">⚠️</button>
        <button class="btn-icon" onclick="removeCustomExercise(${index})">✕</button>
      </div>
    </div>
  `).join('');
}

let injuryNoteEditIndex = null;

function setExerciseInjuryNote(index) {
  injuryNoteEditIndex = index;
  document.getElementById('injuryNoteInput').value = exercisesDB[index].injuryNote || '';
  const overlay = document.getElementById('injuryNoteOverlay');
  overlay.classList.add('active');
  lockBodyScroll();
  _gsapOpenOverlay(overlay);
}

function dismissInjuryNoteModal() {
  const overlay = document.getElementById('injuryNoteOverlay');
  unlockBodyScroll();
  _gsapCloseOverlay(overlay, () => overlay.classList.remove('active'));
  injuryNoteEditIndex = null;
}

function saveInjuryNote() {
  if (injuryNoteEditIndex === null) return;
  const note = document.getElementById('injuryNoteInput').value.trim();
  const wasSet = !!exercisesDB[injuryNoteEditIndex].injuryNote;
  exercisesDB[injuryNoteEditIndex].injuryNote = note;
  saveExercises();
  dismissInjuryNoteModal();
  if (note) toast('Injury flag saved ⚠️');
  else if (wasSet) toast('Injury flag cleared');
}

async function addCustomExercise() {
  const nameInput = document.getElementById('newExerciseInput');
  const muscleInput = document.getElementById('newExerciseMuscle');
  const val = nameInput.value.trim();
  if (!val || !currentUser) return;

  const exists = exercisesDB.some(ex => ex.name.toLowerCase() === val.toLowerCase());
  if (exists) return toast('Exercise already exists!');

  try {
    const { data, error } = await supabaseClient
      .from('exercises')
      .insert({ user_id: currentUser.id, name: val, muscle_group: muscleInput.value })
      .select().single();

    if (error) throw error;

    exercisesDB.push({ id: data.id, name: data.name, muscle: data.muscle_group, injuryNote: data.injury_note || '' });
    exercisesDB.sort((a, b) => a.name.localeCompare(b.name));
    
    renderExerciseDB();
    renderSettingsExerciseList();
    
    nameInput.value = '';
    muscleInput.value = '';
    toast('Exercise added to cloud! 💪');
  } catch (err) {
    console.error(err);
    toast('Error saving exercise.');
  }
}

async function saveExercises() {
  if (!currentUser) return;
  try {
    // Full-array sync: clear this user's custom exercises, then re-insert
    // exercisesDB as the new source of truth. Simpler and more reliable
    // than diffing individual adds/renames/deletes row by row.
    await supabaseClient.from('exercises').delete().eq('user_id', currentUser.id);

    if (exercisesDB.length > 0) {
      const toInsert = exercisesDB.map(ex => ({
        user_id: currentUser.id,
        name: ex.name,
        muscle_group: ex.muscle || '',
        injury_note: ex.injuryNote || null
      }));
      const { data, error } = await supabaseClient.from('exercises').insert(toInsert).select();
      if (error) throw error;

      // Re-attach fresh IDs so future renames/merges/deletes reference real rows
      exercisesDB = data.map(ex => ({ id: ex.id, name: ex.name, muscle: ex.muscle_group, injuryNote: ex.injury_note || '' }));
      exercisesDB.sort((a, b) => a.name.localeCompare(b.name));
    }

    renderExerciseDB();
    renderSettingsExerciseList();
  } catch (err) {
    console.error(err);
    toast('Failed to save exercise changes.');
  }
}

function renameExercise(index, newName) {
  newName = newName.trim();
  if (!newName) return renderSettingsExerciseList();

  const oldName = exercisesDB[index].name;
  if (oldName === newName) return;

  const dupIndex = exercisesDB.findIndex((ex, i) => i !== index && ex.name.toLowerCase() === newName.toLowerCase());

  if (dupIndex !== -1) {
    // Renaming onto an existing exercise name = merge the two entries
    const targetName = exercisesDB[dupIndex].name;
    showConfirm({
      icon: '🔀',
      title: 'Merge Exercises?',
      body: `"${targetName}" already exists. Merge "${oldName}" into it? "${oldName}" will be removed from your exercise list.`,
      confirmLabel: 'Merge',
      onConfirm: () => mergeExercise(index, oldName, targetName)
    });
    renderSettingsExerciseList(); // revert the input's displayed text unless/until confirmed
    return;
  }

  exercisesDB[index].name = newName;
  saveExercises();
  toast('Renamed ✓');

  if (oldName.toLowerCase() === newName.toLowerCase()) return; // casing-only change, nothing in history to fix
  offerHistoryRename(oldName, newName);
}

function mergeExercise(index, oldName, targetName) {
  exercisesDB.splice(index, 1);
  saveExercises();
  toast(`Merged into "${targetName}" ✓`);
  offerHistoryRename(oldName, targetName);
}

function offerHistoryRename(oldName, newName) {
  // If this exercise appears in past workout history, offer to rename it there
  // too, so search/PRs/strength charts stay consistent instead of the old name
  // living on forever in old entries.
  const affectedCount = workouts.reduce((count, w) =>
    count + w.exercises.filter(e => e.name.toLowerCase() === oldName.toLowerCase()).length, 0);

  if (affectedCount > 0) {
    showConfirm({
      icon: '🔁',
      title: 'Update Past Workouts?',
      body: `"${oldName}" appears in ${affectedCount} past set${affectedCount === 1 ? '' : 's'}. Rename it there too, so your history and PRs stay consistent?`,
      confirmLabel: 'Yes, Update History',
      onConfirm: () => renameExerciseInHistory(oldName, newName)
    });
  }
}

async function renameExerciseInHistory(oldName, newName) {
  try {
    // Escape LIKE wildcards so odd characters in a name don't act as patterns
    const escaped = oldName.replace(/[%_]/g, ch => '\\' + ch);

    const { error } = await supabaseClient
      .from('workout_sets')
      .update({ exercise_name: newName })
      .ilike('exercise_name', escaped);
      // Relies on RLS to scope workout_sets to the current user's own
      // workouts (same trust pattern clearAllData() already uses).

    if (error) throw error;

    // Reflect the rename locally right away so History/PRs/Strength charts
    // update immediately without needing a re-sync.
    workouts.forEach(w => {
      w.exercises.forEach(e => {
        if (e.name.toLowerCase() === oldName.toLowerCase()) e.name = newName;
      });
    });

    renderHistory();
    renderProgress();
    toast(`Past workouts updated to "${newName}" ✅`);
  } catch (err) {
    console.error(err);
    toast('Failed to update past workouts.');
  }
}

function setExerciseMuscle(index, muscle) {
  exercisesDB[index].muscle = muscle;
  saveExercises();
}

function removeCustomExercise(index) {
  showConfirm({
    icon: '🗑️',
    title: 'Delete Exercise',
    body: `Remove "${exercisesDB[index].name}" from the database?`,
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => { exercisesDB.splice(index, 1); saveExercises(); }
  });
}

function restoreDefaultExercises() {
  showConfirm({
    icon: '↺',
    title: 'Restore Defaults',
    body: 'This will replace your custom exercise list with the defaults. This cannot be undone.',
    confirmLabel: 'Restore',
    danger: true,
    onConfirm: () => { exercisesDB = [...defaultExercises]; saveExercises(); toast('Default exercises restored!'); }
  });
}

async function saveWeeklyTarget() {
  const val = parseInt(document.getElementById('weeklyTargetInput').value) || 0;
  weeklyTarget = val;
  
  if (currentUser) {
    toast('Saving target... 🎯');
    try {
      await supabaseClient.from('user_settings').upsert({
        user_id: currentUser.id,
        weekly_target: val
      }, { onConflict: 'user_id' });
    } catch (err) {
      console.error("Failed to save target:", err);
    }
  } else {
    localStorage.setItem('ctrlset_weekly_target', val);
  }

  updateWeeklyTargetBar();
  toast(val > 0 ? `Target set: ${val.toLocaleString()} kg/week 🎯` : 'Target cleared');
}

function toggleTrainingDay(pillEl) {
  pillEl.classList.toggle('active');
}

async function onRemindersToggle(checked) {
  if (!checked) return; // turning off doesn't need permission, just gets saved on next Save click

  if (!('Notification' in window)) {
    toast('Notifications aren\'t supported in this browser.');
    document.getElementById('remindersToggle').checked = false;
    return;
  }

  if (Notification.permission === 'granted') return;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    toast('Notification permission denied. Reminders won\'t show.');
    document.getElementById('remindersToggle').checked = false;
  }
}

async function saveReminderSettings() {
  const enabled = document.getElementById('remindersToggle').checked;
  const selectedDays = [...document.querySelectorAll('#trainingDayPicker .day-pill.active')]
    .map(pill => pill.dataset.day);

  if (enabled && (!('Notification' in window) || Notification.permission !== 'granted')) {
    toast('Enable notifications above first, then save.');
    return;
  }

  if (enabled) {
    const subscribed = await subscribeToPush();
    if (!subscribed) return; // subscribeToPush() already toasts the failure reason
  } else {
    await unsubscribeFromPush();
  }

  remindersEnabled = enabled;
  trainingDays = selectedDays.map(Number);

  const hint = document.getElementById('remindersHint');
  if (!currentUser) {
    if (hint) hint.textContent = 'Log in to sync reminder settings.';
    return;
  }

  try {
    await supabaseClient.from('user_settings').upsert({
      user_id: currentUser.id,
      reminders_enabled: enabled ? '1' : '0',
      training_days: selectedDays.join(',')
    }, { onConflict: 'user_id' });
    toast('Reminder settings saved ✓');
    if (hint) hint.textContent = enabled
      ? `Reminders on for ${selectedDays.length} day${selectedDays.length === 1 ? '' : 's'} a week.`
      : 'Reminders off.';
  } catch (err) {
    console.error('Failed to save reminder settings:', err);
    toast('Failed to save reminder settings.');
  }
}

// Checks whether today is a usual training day, a workout hasn't been
// logged yet today, and a reminder hasn't already fired today — then shows
// a browser notification. This only works while the app is open/recently
// visited in a tab; without a push server, browsers can't reliably wake a
// closed app or background it on a schedule.
function checkWorkoutReminder() {
  if (!remindersEnabled || !trainingDays.length) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const todayStr = getLocalDateString();
  const todayDow = new Date().getDay();
  if (!trainingDays.includes(todayDow)) return;

  const alreadyLoggedToday = workouts.some(w => w.date === todayStr);
  if (alreadyLoggedToday) return;

  const dismissedFor = localStorage.getItem('ctrlset_workout_reminder_shown');
  if (dismissedFor === todayStr) return;

  const body = "It's one of your usual training days. Log today's workout on CtrlSet.";
  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification('Time to train 💪', { body, icon: '/appicon/icon-192.png', tag: 'ctrlset-workout-reminder' });
    }).catch(() => new Notification('Time to train 💪', { body, icon: '/appicon/icon-192.png' }));
  } else {
    new Notification('Time to train 💪', { body, icon: '/appicon/icon-192.png' });
  }

  localStorage.setItem('ctrlset_workout_reminder_shown', todayStr);
}

function updateWeeklyTargetBar() {
  const wrap = document.getElementById('weeklyTargetWrap');
  const hint = document.getElementById('weeklyTargetHint');
  if (!wrap) return;
  if (!weeklyTarget) { wrap.style.display = 'none'; if (hint) hint.textContent = 'No target set.'; return; }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  
  // Convert the local weekStart date into a clean YYYY-MM-DD string
  const weekStartStr = getLocalDateString(weekStart);

  const weekVol = workouts
    // FIX: Compare the strings directly! No timezones, no math, just alphabetical order.
    .filter(w => w.date >= weekStartStr)
    .reduce((sum, w) => sum + w.exercises.reduce((a, e) => a + e.sets * e.reps * e.weight, 0), 0);

  const pct = Math.min(100, (weekVol / weeklyTarget) * 100);
  wrap.style.display = '';
  document.getElementById('weeklyVolDisplay').textContent =
    `${Math.round(weekVol).toLocaleString()} / ${weeklyTarget.toLocaleString()} kg`;
  document.getElementById('weeklyBarFill').style.width = pct + '%';
  if (hint) hint.textContent = weeklyTarget > 0
    ? `Current: ${Math.round(weekVol).toLocaleString()} kg this week (${Math.round(pct)}%)`
    : 'No target set.';
}

async function saveRecovery() {
  const date = document.getElementById('rDate').value;
  if (!date) return toast('Please select a date!');
  if (!currentUser) return toast('Not logged in!');

  const entry = {
    user_id: currentUser.id,
    log_date: date,
    sleep_hours: parseFloat(document.getElementById('rSleep').value) || null,
    protein_g: parseFloat(document.getElementById('rProtein').value) || null,
    bodyweight_kg: parseFloat(document.getElementById('rBodyweight').value) || null,
    zinc: document.getElementById('rZinc').checked,
    creatine: document.getElementById('rCreatine').checked,
    soreness: parseInt(document.getElementById('rSoreness').value) || 5
  };

  try {
    // Check if date exists to get the ID for updating
    const existing = recoveryLogs.find(r => r.date === date);
    
    if (existing && existing.id) {
      entry.id = existing.id; // Include ID to force an update on upsert
    }

    const { data, error } = await supabaseClient
      .from('recovery_logs')
      .upsert(entry, { onConflict: 'user_id, log_date' }) // Assumes a unique constraint on user_id + log_date
      .select()
      .single();

    if (error) throw error;

    // Update local UI
    if (existing) {
      Object.assign(existing, {
        sleep: entry.sleep_hours || 0,
        protein: entry.protein_g || 0,
        bodyweight: entry.bodyweight_kg || 0,
        zinc: entry.zinc,
        creatine: entry.creatine,
        soreness: entry.soreness
      });
    } else {
      recoveryLogs.unshift({
        id: data.id,
        date: data.log_date,
        sleep: entry.sleep_hours || 0,
        protein: entry.protein_g || 0,
        bodyweight: entry.bodyweight_kg || 0,
        zinc: entry.zinc,
        creatine: entry.creatine,
        soreness: entry.soreness
      });
    }

    toast('Recovery metrics saved! 🔋');
    if (navigator.vibrate) navigator.vibrate(100);
    checkRecoveryReminder();
    renderReadinessCard();
  } catch (err) {
    console.error(err);
    toast('Error saving recovery log.');
  }
}
