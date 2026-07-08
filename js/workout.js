let blockCount = 0;
let loadCount = 0;

function addExerciseBlock(ex = {}) {
  blockCount++;
  const bid = blockCount;
  const muscleOptions = ['','Chest','Back','Shoulders','Arms','Legs','Core','Full Body','Cardio']
    .map(m => `<option value="${m}" ${(ex.muscle||'')=== m?'selected':''}>${m||'Muscle…'}</option>`).join('');

  const block = document.createElement('div');
  block.className = 'exercise-block';
  block.id = 'exb-' + bid;
  block.innerHTML = `
    <div class="exercise-block-header">
      <div class="name-wrapper" style="position:relative;">
        <input type="text" placeholder="Exercise name" value="${ex.name || ''}"
          data-block="${bid}" data-field="name" list="exercise-db" autocomplete="off"
          oninput="onBlockNameInput(${bid}, this.value)">
        <button class="history-peek-btn" onclick="peekHistoryBlock(${bid})">LOGS</button>
      </div>
      <div class="muscle-select-wrap">
        <select data-block="${bid}" data-field="muscle" style="font-size:0.78rem;padding:10px 8px;"
          onchange="onBlockMuscleChange(${bid})">
          ${muscleOptions}
        </select>
      </div>
      <button class="btn-remove-block" onclick="removeExerciseBlock(${bid})" title="Remove exercise">✕</button>
    </div>
    <div class="load-row-labels">
      <span>Sets</span><span>Reps</span><span>Kg</span><span></span><span></span>
    </div>
    <div class="load-rows" id="loads-${bid}"></div>
    <button class="btn-add-load" onclick="addLoadRow(${bid})">+ Add load</button>
  `;
  document.getElementById('exercisesList').appendChild(block);

  // Add first load row (pre-filled if editing)
  addLoadRow(bid, ex);

  // Auto-fill muscle if known
  if (ex.name) {
    setTimeout(() => {
      onBlockNameInput(bid, ex.name);
      onBlockMuscleChange(bid);
    }, 50);
  }
}

function addLoadRow(bid, ex = {}) {
  loadCount++;
  const lid = loadCount;
  const container = document.getElementById('loads-' + bid);
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'load-row';
  row.id = `load-${bid}-${lid}`;
  row.innerHTML = `
    <div style="position:relative">
      <input type="number" inputmode="decimal" placeholder="S" data-field="sets" value="${ex.sets || ''}" style="padding:10px;">
    </div>
    <div style="position:relative">
      <input type="number" inputmode="decimal" placeholder="R" data-field="reps" value="${ex.reps || ''}"
        oninput="updateDeltaLoad(${bid},${lid})" style="padding:10px;">
    </div>
    <div class="weight-wrapper" style="position:relative">
      <button class="predict-btn" onclick="predictLoadBlock(${bid},${lid})" style="font-size:0.7rem;">🪄</button>
      <input type="number" inputmode="decimal" placeholder="Kg" data-field="weight" value="${ex.weight || ''}" step="0.5"
        oninput="updateDeltaLoad(${bid},${lid})" style="padding:10px;padding-left:26px;">
    </div>
    <button class="btn-icon btn-confirm" style="margin-bottom:0;" onclick="logSetLoad(${bid},${lid})" title="Log set">✓</button>
    <button class="btn-icon" style="margin-bottom:0;" onclick="removeLoadRow(${bid},${lid})" title="Remove load">✕</button>
  `;
  container.appendChild(row);
}

function removeLoadRow(bid, lid) {
  const row = document.getElementById(`load-${bid}-${lid}`);
  const container = document.getElementById('loads-' + bid);
  // Don't remove if it's the only load row
  if (container && container.querySelectorAll('.load-row').length <= 1) {
    toast('Each exercise needs at least one load row.');
    return;
  }
  if (row) row.remove();
}

function removeExerciseBlock(bid) {
  const block = document.getElementById('exb-' + bid);
  if (block) block.remove();
}

function onBlockNameInput(bid, value) {
  // Auto-fill muscle if exercise is in DB and muscle not set
  const val = value.trim().toLowerCase();
  if (!val) return;
  const match = exercisesDB.find(ex => ex.name.toLowerCase() === val);
  if (!match || !match.muscle) return;
  const sel = document.querySelector(`#exb-${bid} [data-field="muscle"]`);
  if (sel && !sel.value) sel.value = match.muscle;
  // Update deltas on all load rows
  document.querySelectorAll(`#loads-${bid} .load-row`).forEach(row => {
    const lid = row.id.split('-')[2];
    updateDeltaLoad(bid, lid);
  });
}

function onBlockMuscleChange(bid) {
  // Just re-run delta so colour can update
}

function logSetLoad(bid, lid) {
  const block = document.getElementById('exb-' + bid);
  if (!block) return;
  const name = block.querySelector('[data-field="name"]').value.trim();
  const muscle = block.querySelector('[data-field="muscle"]')?.value || '';
  if (name) triggerSmartTimer(name, muscle);
  incrementSetCounterLoad(bid, lid);
  if (navigator.vibrate) navigator.vibrate(50);
  updateSessionVolume();
}

function incrementSetCounterLoad(bid, lid) {
  const btn = document.querySelector(`#load-${bid}-${lid} .btn-confirm`);
  if (!btn) return;
  let badge = btn.querySelector('.set-counter');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'set-counter';
    btn.style.position = 'relative';
    btn.appendChild(badge);
  }
  const current = parseInt(badge.dataset.sets || '0') + 1;
  badge.dataset.sets = current;
  badge.textContent = `S${current}`;
}

function updateDeltaLoad(bid, lid) {
  const block = document.getElementById('exb-' + bid);
  const row = document.getElementById(`load-${bid}-${lid}`);
  if (!block || !row) return;

  const name = block.querySelector('[data-field="name"]').value.trim();
  const reps = parseInt(row.querySelector('[data-field="reps"]').value) || 0;
  const weight = parseFloat(row.querySelector('[data-field="weight"]').value) || 0;
  
  // Helper to cleanly remove deltas and reset margin
  const clearDeltas = () => {
    row.classList.remove('has-deltas');
    row.querySelectorAll('.delta-box').forEach(el => el.remove());
  };

  if (!name || !workouts.length) return clearDeltas();

  const recentWorkout = workouts.find(w => w.exercises.some(e => e.name.toLowerCase() === name.toLowerCase()));
  if (!recentWorkout) return clearDeltas();

  // THE FIX:
  const best = recentWorkout.exercises
    .filter(e => e.name.toLowerCase() === name.toLowerCase())
    .reduce((a, b) => calculate1RM(a.weight, a.reps) >= calculate1RM(b.weight, b.reps) ? a : b);

  renderDeltaLabel(row.querySelector('[data-field="reps"]').parentElement, reps - best.reps, 'r');
  renderDeltaLabel(row.querySelector('[data-field="weight"]').parentElement, weight - best.weight, 'kg');
  
  // Triggers the CSS to expand the margin
  row.classList.add('has-deltas');
}

function renderDeltaLabel(parent, val, unit) {
  let el = parent.querySelector('.delta-box');
  if (!el) {
    el = document.createElement('span');
    el.className = 'delta-box';
    parent.appendChild(el);
  }
  
  if (val === 0) {
    el.innerHTML = `<span class="delta-neutral">= last</span>`;
  } else {
    const cls = val > 0 ? 'delta-pos' : 'delta-neg';
    const sign = val > 0 ? '+' : '';
    el.innerHTML = `<span class="${cls}">${sign}${val}${unit}</span>`;
  }
}

function predictLoadBlock(bid, lid) {
  const block = document.getElementById('exb-' + bid);
  const row = document.getElementById(`load-${bid}-${lid}`);
  if (!block || !row) return;

  const name = block.querySelector('[data-field="name"]').value.trim();
  if (!name) return toast('Enter exercise name first!');

  const weightInput = row.querySelector('[data-field="weight"]');
  
  // THE FIX: Find workouts containing the exercise, then map them to only their best set
  const historyWorkouts = workouts.filter(w => w.exercises.some(e => e.name.toLowerCase() === name.toLowerCase()));
    
  if (!historyWorkouts.length) return toast('No history found. Set your own baseline!');

  const historyBestSets = historyWorkouts.map(w => {
    return w.exercises
      .filter(e => e.name.toLowerCase() === name.toLowerCase())
      .reduce((a, b) => calculate1RM(a.weight, a.reps) >= calculate1RM(b.weight, b.reps) ? a : b);
  });

  const last = historyBestSets[0]; // Now this correctly points to the PR set of your last session!
  let suggestion = last.weight;
  let statusMsg = '', statusColor = 'var(--accent)';

  const stagnant = isStagnant(historyBestSets);
    
  if (stagnant) {
    suggestion = Math.floor((last.weight * 0.9) * 2) / 2;
    statusMsg = `⚠️ Stagnation detected. Deloading to ${suggestion}kg.`;
    statusColor = '#ffb347';
  } else if (last.reps >= 8) {
    const isLeg = last.muscle === 'Legs' ||
      ['legs','quads','glutes','hamstrings','squat','leg press','calf'].some(m => name.toLowerCase().includes(m));
    suggestion += isLeg ? 5 : 2.5;
    statusMsg = `🔥 Target hit! Increasing to ${suggestion}kg.`;
    statusColor = 'var(--green)';
  } else {
    statusMsg = `Stay at ${suggestion}kg, aim for 8+ reps.`;
    statusColor = 'var(--muted)';
  }

  weightInput.value = suggestion;
  updateDeltaLoad(bid, lid);
  weightInput.animate([
    { boxShadow: `0 0 20px ${statusColor}`, transform: 'scale(1.05)' },
    { boxShadow: 'none', transform: 'scale(1)' }
  ], { duration: 500, easing: 'ease-out' });
  toast(statusMsg);
}

function collectExercises() {
  // Read all exercise blocks; each block can have multiple load rows
  const blocks = document.querySelectorAll('.exercise-block');
  const result = [];
  blocks.forEach(block => {
    const name = block.querySelector('[data-field="name"]').value.trim();
    const muscle = block.querySelector('[data-field="muscle"]')?.value || '';
    if (!name) return;
    block.querySelectorAll('.load-row').forEach(row => {
      result.push({
        name,
        muscle,
        sets: parseFloat(row.querySelector('[data-field="sets"]').value) || 0,
        reps: parseFloat(row.querySelector('[data-field="reps"]').value) || 0,
        weight: parseFloat(row.querySelector('[data-field="weight"]').value) || 0,
      });
    });
  });
  return result;
}

function openRepeatWorkoutModal() {
  if (!workouts.length) return toast('No past workouts to repeat yet!');

  // Unique workout names, ordered by most recent use (workouts is already newest-first)
  const seen = new Set();
  const names = [];
  workouts.forEach(w => {
    if (!seen.has(w.name)) { seen.add(w.name); names.push(w.name); }
  });

  document.getElementById('repeatWorkoutPicker').innerHTML =
    names.map(n => `<option value="${n}">${n}</option>`).join('');
  document.getElementById('repeatWorkoutOverlay').classList.add('active');
}

function dismissRepeatWorkoutModal() {
  document.getElementById('repeatWorkoutOverlay').classList.remove('active');
}

function loadRepeatWorkout() {
  const name = document.getElementById('repeatWorkoutPicker').value;
  if (!name) return;

  // workouts is sorted newest-first, so the first match is the most recent
  // workout with this name.
  const source = workouts.find(w => w.name === name);
  if (!source) return;

  const applyRepeat = () => {
    document.getElementById('wName').value = source.name;
    // Date is intentionally left as-is — today by default, or the running
    // session's start date — rather than copying the source workout's date.

    document.getElementById('exercisesList').innerHTML = '';
    blockCount = 0; loadCount = 0;

    // Regroup the source workout's flat exercises into UI blocks, same
    // pattern checkAndRestoreDraft() uses. Sets/reps carry over; weight
    // starts blank so today's numbers aren't silently copied from last time.
    const grouped = {};
    source.exercises.forEach(e => {
      const key = e.name.toLowerCase();
      if (!grouped[key]) grouped[key] = { name: e.name, muscle: e.muscle, loads: [] };
      grouped[key].loads.push({ sets: e.sets, reps: e.reps, weight: '' });
    });

    Object.values(grouped).forEach(group => {
      addExerciseBlock({ name: group.name, muscle: group.muscle });
      const bid = blockCount;
      const loadContainer = document.getElementById('loads-' + bid);
      if (loadContainer) loadContainer.innerHTML = '';
      group.loads.forEach(load => addLoadRow(bid, load));
    });

    dismissRepeatWorkoutModal();
    toast(`Loaded "${source.name}" — set today's weights 💪`);
  };

  dismissRepeatWorkoutModal();

  // Warn before clobbering exercises already entered in an active session
  if (sessionStartTime && document.querySelectorAll('.exercise-block').length > 0) {
    showConfirm({
      icon: '⚠️',
      title: 'Replace Current Exercises?',
      body: 'You have exercises already entered this session. Loading a repeat workout will replace them.',
      confirmLabel: 'Replace',
      danger: true,
      onConfirm: applyRepeat
    });
  } else {
    applyRepeat();
  }
}

async function saveWorkout(durationMins) {
  const name = document.getElementById('wName').value.trim();
  const date = document.getElementById('wDate').value;
  if (!name || !date) return toast('Add a name and date!');
  const exercises = collectExercises();
  if (exercises.some(e => !e.name)) return toast('Please name all your exercises before saving!');
  if (!exercises.length) return toast('Add at least one exercise!');

  if (!currentUser) return toast('Not logged in!');
  toast('Saving to cloud... ☁️');

  const previousUnlockedIds = getUnlockedAchievementIds();

  const currentVolume = exercises.reduce((a, e) => a + (e.sets * e.reps * e.weight), 0);
  const maxVolume = workouts.reduce((max, w) => {
    const v = w.exercises.reduce((a, e) => a + (e.sets * e.reps * e.weight), 0);
    return v > max ? v : max;
  }, 0);
  const isVolumePR = currentVolume > maxVolume && workouts.length > 0;

  const muscleCounts = {};
  exercises.forEach(e => { if (e.muscle) muscleCounts[e.muscle] = (muscleCounts[e.muscle] || 0) + 1; });
  const primaryMuscle = Object.keys(muscleCounts).sort((a,b) => muscleCounts[b]-muscleCounts[a])[0] || '';
  const notesStr = document.getElementById('wNotes').value.trim();

  try {
    // 1. Build dictionary from existing cloud exercises (NEW CODE HERE)
    const exerciseIdMap = {};
    exercisesDB.forEach(ex => {
        if (ex.id) exerciseIdMap[ex.name.toLowerCase()] = ex.id;
    });

    // 2. Insert Workout parent record
    const { data: dbWorkout, error: wErr } = await supabaseClient
      .from('workouts')
      .insert({
        user_id: currentUser.id,
        name: name,
        workout_date: date,
        duration_minutes: durationMins || 0,
        primary_muscle: primaryMuscle,
        notes: notesStr
      })
      .select()
      .single();

    if (wErr) throw wErr;

    // 3. Insert Sets (NEW CODE ADDED HERE)
    const setsToInsert = exercises.map((e, idx) => ({
      workout_id: dbWorkout.id,
      exercise_id: exerciseIdMap[e.name.toLowerCase()] || null, // <-- Links the ID!
      exercise_name: e.name,
      muscle_group: e.muscle,
      sets: e.sets,
      reps: e.reps,
      weight_kg: e.weight,
      set_order: idx
    }));

    const { error: setsErr } = await supabaseClient.from('workout_sets').insert(setsToInsert);
    if (setsErr) throw setsErr;

    // 4. Update Local UI immediately
    const newWorkout = {
      id: dbWorkout.id,
      name, date, duration: durationMins || 0, muscle: primaryMuscle, notes: notesStr, exercises
    };
    workouts.unshift(newWorkout);
    
    updateStats();
    refreshWorkoutNameDB();
    renderHistory();
    checkForNewAchievements(previousUnlockedIds);
    if (isVolumePR) triggerConfetti();
    
    clearInterval(sessionClockInterval);
    sessionClockInterval = null;
    sessionStartTime = null;
    document.getElementById('sessionBar').classList.remove('active');
    document.getElementById('sessionClock').textContent = '00:00';
    const btn = document.getElementById('sessionToggleBtn');
    btn.textContent = '▶ Start Session';
    btn.classList.remove('running');

    showRecap(newWorkout, isVolumePR);

    document.getElementById('wName').value = '';
    document.getElementById('wNotes').value = '';
    document.getElementById('exercisesList').innerHTML = '';
    blockCount = 0; loadCount = 0;
    addExerciseBlock();
    document.getElementById('fabEndSession').style.display = 'none';
    localStorage.removeItem('ctrlset_draft');

  } catch (err) {
    console.error(err);
    toast("Database error. Workout not saved.");
  }
}

function updateSessionVolume() {
  const el = document.getElementById('sessionVolDisplay');
  if (!el || !sessionStartTime) return;
  const exercises = collectExercises();
  const vol = exercises.reduce((a, e) => a + e.sets * e.reps * e.weight, 0);
  el.textContent = `${Math.round(vol).toLocaleString()} kg`;
}

function updateLastSessionInfo(workoutName) {
  const bar = document.getElementById('lastSessionBar');
  if (!bar) return;
  if (!workoutName) { bar.classList.remove('visible'); return; }
  const prev = workouts.find(w => w.name.toLowerCase() === workoutName.toLowerCase());
  if (!prev) { bar.classList.remove('visible'); return; }
  const vol = prev.exercises.reduce((a, e) => a + e.sets * e.reps * e.weight, 0);
  const daysAgo = Math.round((Date.now() - new Date(prev.date + 'T00:00:00')) / 86400000);
  const daysStr = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo}d ago`;
  bar.innerHTML = `Last: <strong>${daysStr}</strong> · <strong>${Math.round(vol).toLocaleString()} kg</strong>`;
  bar.classList.add('visible');
}

let editBlockCount = 0;
let editLoadCount = 0;

function openEditWorkout(id) {
  const w = workouts.find(x => x.id === id);
  if (!w) return;
  editingWorkoutId = id;

  document.getElementById('editWName').value = w.name || '';
  document.getElementById('editWDate').value = w.date || '';
  document.getElementById('editWDuration').value = w.duration || '';
  document.getElementById('editWNotes').value = w.notes || '';

  const list = document.getElementById('editExercisesList');
  list.innerHTML = '';
  editBlockCount = 0;
  editLoadCount = 0;

  // Group flat data into blocks for the UI
  const grouped = {};
  w.exercises.forEach(e => {
    const key = e.name.toLowerCase();
    if (!grouped[key]) grouped[key] = { name: e.name, muscle: e.muscle, loads: [] };
    grouped[key].loads.push({ sets: e.sets, reps: e.reps, weight: e.weight });
  });

  Object.values(grouped).forEach(group => addEditExerciseBlock(group));

  openModal('editWorkoutModal');
}

function addEditExerciseBlock(group = {}) {
  editBlockCount++;
  const bid = editBlockCount;
  const muscleOptions = ['','Chest','Back','Shoulders','Arms','Legs','Core','Full Body','Cardio']
    .map(m => `<option value="${m}" ${(group.muscle||'')=== m?'selected':''}>${m||'Muscle…'}</option>`).join('');

  const block = document.createElement('div');
  block.className = 'exercise-block';
  block.id = 'edit-exb-' + bid;
  block.innerHTML = `
    <div class="exercise-block-header">
      <div class="name-wrapper" style="position:relative;">
        <input type="text" placeholder="Exercise name" value="${group.name || ''}"
          data-field="name" list="exercise-db" autocomplete="off" style="margin-bottom:0;">
      </div>
      <div class="muscle-select-wrap">
        <select data-field="muscle" style="font-size:0.78rem;padding:10px 8px;margin-bottom:0;">
          ${muscleOptions}
        </select>
      </div>
      <button class="btn-remove-block" onclick="document.getElementById('edit-exb-${bid}').remove()" title="Remove block">✕</button>
    </div>
    <div class="load-row-labels">
      <span>Sets</span><span>Reps</span><span>Kg</span><span></span><span></span>
    </div>
    <div class="load-rows" id="edit-loads-${bid}"></div>
    <button class="btn-add-load" onclick="addEditLoadRow(${bid})">+ Add load</button>
  `;
  document.getElementById('editExercisesList').appendChild(block);

  if (group.loads && group.loads.length > 0) {
    group.loads.forEach(load => addEditLoadRow(bid, load));
  } else {
    addEditLoadRow(bid, {}); // Initialize empty row for new block
  }
}

function addEditLoadRow(bid, loadData = {}) {
  editLoadCount++;
  const lid = editLoadCount;
  const container = document.getElementById('edit-loads-' + bid);
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'load-row';
  row.id = `edit-load-${bid}-${lid}`;
  
  // We use an empty div as a spacer so the "✕" button sits cleanly on the right
  row.innerHTML = `
    <div><input type="number" inputmode="decimal" placeholder="S" data-field="sets" value="${loadData.sets || ''}" style="padding:10px;margin-bottom:0;"></div>
    <div><input type="number" inputmode="decimal" placeholder="R" data-field="reps" value="${loadData.reps || ''}" style="padding:10px;margin-bottom:0;"></div>
    <div><input type="number" inputmode="decimal" placeholder="Kg" data-field="weight" value="${loadData.weight || ''}" step="0.5" style="padding:10px;margin-bottom:0;"></div>
    <div></div> 
    <button class="btn-icon" style="margin-bottom:0;" onclick="document.getElementById('edit-load-${bid}-${lid}').remove()" title="Remove load">✕</button>
  `;
  container.appendChild(row);
}

async function saveEditedWorkout() {
  const name = document.getElementById('editWName').value.trim();
  const date = document.getElementById('editWDate').value;
  const duration = parseInt(document.getElementById('editWDuration').value) || 0;
  const notes = document.getElementById('editWNotes').value.trim();
  if (!name || !date || !currentUser) return toast('Name, date, and login required!');

  // Flatten blocks into array
  const exercises = [];
  document.querySelectorAll('#editExercisesList .exercise-block').forEach(block => {
    const exName = block.querySelector('[data-field="name"]').value.trim();
    const muscle = block.querySelector('[data-field="muscle"]')?.value || '';
    if (!exName) return;

    block.querySelectorAll('.load-row').forEach(row => {
      const sets = parseFloat(row.querySelector('[data-field="sets"]').value) || 0;
      const reps = parseFloat(row.querySelector('[data-field="reps"]').value) || 0;
      const weight = parseFloat(row.querySelector('[data-field="weight"]').value) || 0;
      if (sets > 0 || reps > 0 || weight > 0) {
        exercises.push({ name: exName, muscle, sets, reps, weight });
      }
    });
  });

  if (!exercises.length) return toast('Add at least one valid load entry!');
  toast('Updating cloud... ☁️');

  try {
    // 1. Build dictionary from existing cloud exercises (NEW CODE HERE)
    const exerciseIdMap = {};
    exercisesDB.forEach(ex => {
        if (ex.id) exerciseIdMap[ex.name.toLowerCase()] = ex.id;
    });

    // 2. Update the parent workout
    const { error: wErr } = await supabaseClient
      .from('workouts')
      .update({ name, workout_date: date, duration_minutes: duration, notes })
      .eq('id', editingWorkoutId);
    if (wErr) throw wErr;

    // 3. Delete old sets
    await supabaseClient.from('workout_sets').delete().eq('workout_id', editingWorkoutId);

    // 4. Insert new sets (NEW CODE ADDED HERE)
    const setsToInsert = exercises.map((e, idx) => ({
      workout_id: editingWorkoutId,
      exercise_id: exerciseIdMap[e.name.toLowerCase()] || null, // <-- Links the ID!
      exercise_name: e.name, 
      muscle_group: e.muscle,
      sets: e.sets, 
      reps: e.reps, 
      weight_kg: e.weight, 
      set_order: idx
    }));
    const { error: setsErr } = await supabaseClient.from('workout_sets').insert(setsToInsert);
    if (setsErr) throw setsErr;

    // 5. Refresh Data
    await syncDataFromSupabase();
    closeModal('editWorkoutModal');
    toast('Workout updated! ✅');
  } catch (err) {
    console.error(err);
    toast('Error updating workout.');
  }
}

let editingRecoveryDate = null;

function openEditRecovery(date) {
  const r = recoveryLogs.find(x => x.date === date);
  if (!r) return;
  editingRecoveryDate = date;

  document.getElementById('editRDate').value = r.date;
  document.getElementById('editRSleep').value = r.sleep || '';
  document.getElementById('editRProtein').value = r.protein || '';
  document.getElementById('editRBodyweight').value = r.bodyweight || '';
  document.getElementById('editRZinc').checked = r.zinc || false;
  document.getElementById('editRCreatine').checked = r.creatine || false;
  const soreness = r.soreness || 5;
  document.getElementById('editRSoreness').value = soreness;
  document.getElementById('editSorenessVal').textContent = soreness;

  openModal('editRecoveryModal');
}

async function saveEditedRecovery() {
  const date = document.getElementById('editRDate').value;
  if (!date || !currentUser) return toast('Date and login required!');

  const idx = recoveryLogs.findIndex(r => r.date === editingRecoveryDate);
  if (idx === -1) return toast('Entry not found locally!');
  const logId = recoveryLogs[idx].id;

  try {
    const { error } = await supabase
      .from('recovery_logs')
      .update({
        log_date: date,
        sleep_hours: parseFloat(document.getElementById('editRSleep').value) || null,
        protein_g: parseFloat(document.getElementById('editRProtein').value) || null,
        bodyweight_kg: parseFloat(document.getElementById('editRBodyweight').value) || null,
        zinc: document.getElementById('editRZinc').checked,
        creatine: document.getElementById('editRCreatine').checked,
        soreness: parseInt(document.getElementById('editRSoreness').value) || 5
      })
      .eq('id', logId);

    if (error) throw error;
    
    await syncDataFromSupabase();
    closeModal('editRecoveryModal');
    toast('Recovery log updated! ✅');
  } catch (err) {
    console.error(err);
    toast('Error updating recovery log.');
  }
}
