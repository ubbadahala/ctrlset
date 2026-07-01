function exportJSON() {
  if (!workouts.length && !recoveryLogs.length && !restDays.length) {
    return toast('No data to export!');
  }

  // Create a bundle of all user data including the latest features
  const backupData = {
    version: "4.0", // v4: added restDays, weeklyTarget, and lightMode
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

          for (const ex of imported.exercises) {
            // Only prepare to insert if it's new
            if (ex.name && !exerciseIdMap[ex.name.toLowerCase()]) {
              exercisesToInsert.push({
                user_id: currentUser.id,
                name: ex.name,
                muscle_group: ex.muscle || ''
              });
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
            rest_date: rd
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
    csvContent += "\nREST DAYS\nDate\n";
    [...restDays].sort().forEach(d => { csvContent += `${d}\n`; });
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
    <div style="display:grid;grid-template-columns:1fr 130px 36px;gap:8px;align-items:center;padding:8px 6px;border-bottom:1px solid rgba(255,255,255,0.05);">
      <input type="text" value="${ex.name}"
        style="margin-bottom:0;font-size:0.9rem;padding:9px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;width:100%;"
        onchange="renameExercise(${index}, this.value)"
        onfocus="this.style.borderColor='rgba(232,255,71,0.5)'"
        onblur="this.style.borderColor='rgba(255,255,255,0.08)'">
      <select style="margin-bottom:0;font-size:0.82rem;padding:9px 10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:${ex.muscle?'var(--text)':'var(--muted)'};font-family:'DM Sans',sans-serif;outline:none;width:100%;"
        onchange="setExerciseMuscle(${index}, this.value)"
        onfocus="this.style.borderColor='rgba(232,255,71,0.5)'"
        onblur="this.style.borderColor='rgba(255,255,255,0.08)'">
        ${MUSCLE_OPTIONS.map(m => `<option value="${m}" ${ex.muscle === m ? 'selected' : ''}>${m || '— muscle —'}</option>`).join('')}
      </select>
      <button class="btn-icon" style="width:36px;height:36px;font-size:0.9rem;" onclick="removeCustomExercise(${index})">✕</button>
    </div>
  `).join('');
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

    exercisesDB.push({ id: data.id, name: data.name, muscle: data.muscle_group });
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

function renameExercise(index, newName) {
  newName = newName.trim();
  if (!newName) return renderSettingsExerciseList();
  const dup = exercisesDB.some((ex, i) => i !== index && ex.name.toLowerCase() === newName.toLowerCase());
  if (dup) { toast('Name already exists!'); return renderSettingsExerciseList(); }
  exercisesDB[index].name = newName;
  saveExercises();
  toast('Renamed ✓');
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
  } catch (err) {
    console.error(err);
    toast('Error saving recovery log.');
  }
}
