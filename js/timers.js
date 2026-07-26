let timerInterval = null;
let timerSeconds = 0;

function startTimer(seconds) {
  timerSeconds = seconds;
  updateTimerDisplay();
  
  const widget = document.getElementById('restTimerWidget');
  const miniPill = document.getElementById('miniTimerPill');
  
  widget.classList.add('active');
  widget.classList.remove('blinking');
  miniPill.style.display = 'none'; // Ensure mini pill is hidden when maximized
  miniPill.classList.remove('blinking');
  lockBodyScroll();
  
  if (timerInterval) clearInterval(timerInterval);
  
  timerInterval = setInterval(() => {
    if (timerSeconds > 0) {
      timerSeconds--;
      updateTimerDisplay();
    }
    
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      widget.classList.add('blinking');
      miniPill.classList.add('blinking');
      toast('⏰ Rest time is up!');
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    }
  }, 1000);
}

function triggerSmartTimer(exerciseName, exerciseMuscle) {
  if (!exerciseName) return;
  const isLeg = (exerciseMuscle || '').toLowerCase() === 'legs';
  const isHeavy = isLeg || HEAVY_COMPOUNDS.some(c => exerciseName.toLowerCase().includes(c));
  const seconds = isHeavy ? 180 : 60;
  startTimer(seconds);
  toast(`Rest: ${seconds}s started`);
}

function minimizeTimer() {
  document.getElementById('restTimerWidget').classList.remove('active');
  document.getElementById('miniTimerPill').style.display = 'block';
  unlockBodyScroll(); // Minimized to a small pill — no longer blocking the page
}

function maximizeTimer() {
  document.getElementById('miniTimerPill').style.display = 'none';
  document.getElementById('restTimerWidget').classList.add('active');
  lockBodyScroll();
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  const wasFullscreen = document.getElementById('restTimerWidget').classList.contains('active');
  document.getElementById('restTimerWidget').classList.remove('active', 'blinking');
  document.getElementById('miniTimerPill').style.display = 'none';
  document.getElementById('miniTimerPill').classList.remove('blinking');
  if (wasFullscreen) unlockBodyScroll();
}

function adjustTimer(sec) {
  timerSeconds += sec;
  if (timerSeconds < 0) timerSeconds = 0;
  updateTimerDisplay();
  
  const widget = document.getElementById('restTimerWidget');
  const miniPill = document.getElementById('miniTimerPill');
  if (timerSeconds > 0 && widget.classList.contains('blinking')) {
    widget.classList.remove('blinking');
    miniPill.classList.remove('blinking');
    startTimer(timerSeconds); 
  }
}

function updateTimerDisplay() {
  const m = Math.floor(timerSeconds / 60);
  const s = timerSeconds % 60;
  const formatted = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  document.getElementById('timerDisplay').textContent = formatted;
  document.getElementById('miniTimerClock').textContent = formatted;
}

let sessionStartTime = null;
let sessionClockInterval = null;

function startSession() {
  const name = document.getElementById('wName').value.trim();
  if (!name) return toast('Enter a workout name before starting!');

  sessionStartTime = new Date();
  // Always stamp date to the actual start date (handles cross-midnight sessions)
  document.getElementById('wDate').value = getLocalDateString(sessionStartTime);

  document.getElementById('sessionBar').classList.add('active');
  document.getElementById('sessionStartLabel').textContent =
    sessionStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const btn = document.getElementById('sessionToggleBtn');
  btn.textContent = '■ End Session';
  btn.classList.add('running');

  sessionClockInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('sessionClock').textContent = `${m}:${s}`;
    // Keep date field current if session crosses midnight
    const nowDate = getLocalDateString();
    const dateField = document.getElementById('wDate');
    if (dateField.value !== nowDate) dateField.value = nowDate;
    // Update live session volume
    updateSessionVolume();
    saveDraft();
  }, 1000);

  // Show last time this workout was done
  updateLastSessionInfo(document.getElementById('wName').value.trim());

  // Show the sticky FAB
  document.getElementById('fabEndSession').style.display = 'block';
}

function toggleSession() {
  if (!sessionStartTime) {
    startSession();
  } else {
    confirmEndSession();
  }
}

function cancelSession() {
  showConfirm({
    icon: '✕',
    title: 'Cancel Session',
    body: 'Nothing will be saved. Are you sure you want to discard this session?',
    confirmLabel: 'Yes, Cancel',
    danger: true,
    onConfirm: () => {
      clearInterval(sessionClockInterval);
      sessionClockInterval = null;
      sessionStartTime = null;
      document.getElementById('sessionBar').classList.remove('active');
      document.getElementById('sessionClock').textContent = '00:00';
      const btn = document.getElementById('sessionToggleBtn');
      btn.textContent = '▶ Start Session';
      btn.classList.remove('running');
      toast('Session cancelled');
      // Hide the sticky FAB
      document.getElementById('fabEndSession').style.display = 'none';
      localStorage.removeItem('ctrlset_draft');
    }
  });
}

function confirmEndSession() {
  const exercises = collectExercises();
  if (!exercises.length) return toast('Add at least one exercise first!');
  const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  const mins = Math.round(elapsed / 60);
  showConfirm({
    icon: '💾',
    title: 'End Session',
    body: `Save workout after ${mins} min?`,
    confirmLabel: 'Save & End',
    onConfirm: () => saveWorkout(mins)
  });
}

function saveDraft() {
  if (!sessionStartTime) return; // Only save if a session is actively running
  const draft = {
    name: document.getElementById('wName').value.trim(),
    date: document.getElementById('wDate').value,
    notes: document.getElementById('wNotes').value.trim(),
    startTime: sessionStartTime.getTime(), // Save the exact time it started
    exercises: collectExercises()
  };
  localStorage.setItem('ctrlset_draft', JSON.stringify(draft));

  // Briefly flash a "Saved" indicator so the user knows their progress
  // is safe even if the app closes or crashes mid-session.
  const indicator = document.getElementById('autosaveIndicator');
  if (indicator) {
    indicator.style.opacity = '1';
    clearTimeout(indicator._fadeTimeout);
    indicator._fadeTimeout = setTimeout(() => { indicator.style.opacity = '0'; }, 1200);
  }
}

function checkAndRestoreDraft() {
  const draftStr = localStorage.getItem('ctrlset_draft');
  if (!draftStr) return;

  showConfirm({
    icon: '📝',
    title: 'Resume Workout?',
    body: 'You have an unfinished workout in progress. Would you like to resume it?',
    confirmLabel: 'Resume',
    onConfirm: () => {
      try {
        const draft = JSON.parse(draftStr);
        document.getElementById('wName').value = draft.name || '';
        document.getElementById('wDate').value = draft.date || '';
        document.getElementById('wNotes').value = draft.notes || '';
        
        document.getElementById('exercisesList').innerHTML = '';
        blockCount = 0; loadCount = 0;

        // Regroup the flat drafted exercises into UI blocks
        if (draft.exercises && draft.exercises.length > 0) {
          const grouped = {};
          draft.exercises.forEach(e => {
            const key = e.name.toLowerCase();
            if (!grouped[key]) grouped[key] = { name: e.name, muscle: e.muscle, loads: [] };
            grouped[key].loads.push(e);
          });
          
          Object.values(grouped).forEach(group => {
            // 1. Generate the block (this automatically increments blockCount to the correct number)
            addExerciseBlock({ name: group.name, muscle: group.muscle });
            
            // 2. Grab the actual ID that was just created
            const bid = blockCount;
            
            // 3. Clear the default empty load row it generated
            const loadContainer = document.getElementById('loads-' + bid);
            if (loadContainer) loadContainer.innerHTML = '';
            
            // 4. Insert your saved sets and reps from the draft
            group.loads.forEach(load => addLoadRow(bid, load));
          });
        } else {
          addExerciseBlock();
        }

        // Restart the session clock
        sessionStartTime = new Date(draft.startTime);
        document.getElementById('sessionBar').classList.add('active');
        document.getElementById('sessionStartLabel').textContent = sessionStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        document.getElementById('sessionToggleBtn').textContent = '■ End Session';
        document.getElementById('sessionToggleBtn').classList.add('running');
        document.getElementById('fabEndSession').style.display = 'block';

        // Re-run once now (covers the case workouts already loaded) and again
        // once cloud sync finishes, so it works regardless of load order.
        updateLastSessionInfo(draft.name || '');
        document.addEventListener('ctrlset:workoutsLoaded', () => {
          updateLastSessionInfo(document.getElementById('wName').value.trim());
          document.querySelectorAll('.exercise-block').forEach(block => {
            const bid = block.id.replace('exb-', '');
            block.querySelectorAll('.load-row').forEach(row => {
              const lid = row.id.split('-')[2];
              updateDeltaLoad(bid, lid);
            });
          });
        }, { once: true });

        sessionClockInterval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
          const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
          const s = (elapsed % 60).toString().padStart(2, '0');
          document.getElementById('sessionClock').textContent = `${m}:${s}`;
          updateSessionVolume();
          saveDraft(); // Keep saving
        }, 1000);
        
        toast('Draft restored!');
      } catch (e) {
        localStorage.removeItem('ctrlset_draft');
      }
    },
    onCancel: () => {
      localStorage.removeItem('ctrlset_draft');
      toast('Draft discarded.');
    }
  });
}