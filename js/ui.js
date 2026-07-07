let _confirmCallback = null;
let _cancelCallback = null;

// HELPER: Rolls numbers up smoothly
function animateValue(elementId, endValue, duration = 800) {
  const obj = document.getElementById(elementId);
  if (!obj) return;
  
  // Strip out commas if there are any to get the current integer
  const currentText = obj.innerText.replace(/,/g, '');
  const startValue = parseInt(currentText) || 0;
  
  if (startValue === endValue) return; // Don't animate if nothing changed

  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    
    // Calculate the ease-out curve so it slows down elegantly at the end
    const easeOutQuart = 1 - Math.pow(1 - progress, 4);
    const currentNum = Math.floor(easeOutQuart * (endValue - startValue) + startValue);
    
    obj.innerHTML = currentNum.toLocaleString();
    
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      obj.innerHTML = endValue.toLocaleString(); // Ensure it ends perfectly on the exact number
    }
  };
  window.requestAnimationFrame(step);
}

function showConfirm({ icon = '', title, body, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel = null }) {
  document.getElementById('confirmIcon').textContent = icon;
  document.getElementById('confirmIcon').style.display = icon ? 'block' : 'none';
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmBody').textContent = body || '';
  
  const okBtn = document.getElementById('confirmOk');
  okBtn.textContent = confirmLabel;
  okBtn.className = 'confirm-btn confirm-btn-ok' + (danger ? ' danger' : '');
  
  _confirmCallback = onConfirm;
  _cancelCallback = onCancel;
  
  okBtn.onclick = () => { 
    // Save the callback before wiping it
    const cb = _confirmCallback; 
    
    // Wipe callbacks first so dismissConfirm doesn't accidentally cancel
    _confirmCallback = null;
    _cancelCallback = null;
    
    dismissConfirm(); 
    if (cb) cb(); 
  };
  
  document.getElementById('confirmOverlay').classList.add('active');
}

function dismissConfirm() {
  document.getElementById('confirmOverlay').classList.remove('active');
  const cb = _cancelCallback;
  _confirmCallback = null;
  _cancelCallback = null;
  if (cb) cb();
}

function toast(msg, icon = '') {
  // 1. Get or create the container
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }

  // 2. Your FAB Avoidance Logic applied to the Container
  const fab = document.getElementById('fabEndSession');
  if (fab && fab.style.display !== 'none') {
    container.classList.add('lifted');
  } else {
    container.classList.remove('lifted');
  }

  // 3. Create the Premium Pill
  const el = document.createElement('div');
  el.className = 'toast-pill';
  el.innerHTML = `${icon ? `<span style="font-size: 1.1em;">${icon}</span>` : ''} <span>${msg}</span>`;
  
  // 4. Add to screen
  container.appendChild(el);

  // 5. Clean up after 2.8 seconds
  setTimeout(() => {
    el.classList.add('fade-out');
    // Wait for the fade animation to finish before destroying the HTML element
    el.addEventListener('animationend', () => {
      el.remove();
      
      // Optional: If no toasts are left, remove the lifted class
      if (container.children.length === 0) {
        container.classList.remove('lifted');
      }
    });
  }, 2800);
}

function switchTab(tab, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + tab).classList.add('active');
  if (btn) btn.classList.add('active');
  
  if (tab === 'history') { renderHistory(); renderRecoveryHistory(); }
  if (tab === 'progress') {
    renderProgress();
    renderNutritionInsights();
    renderHeatmap();
    renderRadarChart();
  }
}

function switchHistorySubTab(subTab) {
  document.getElementById('historyPanel-workouts').style.display = subTab === 'workouts' ? '' : 'none';
  document.getElementById('historyPanel-recovery').style.display = subTab === 'recovery' ? '' : 'none';
  document.getElementById('historyTabBtn-workouts').classList.toggle('active', subTab === 'workouts');
  document.getElementById('historyTabBtn-recovery').classList.toggle('active', subTab === 'recovery');
}

let editingWorkoutId = null;
let editExerciseCount = 0;

function openModal(id) {
  // 1. Show the specific modal
  document.getElementById(id).classList.add('active');
  
  // 2. Shrink the main app background into the distance
  const mainApp = document.getElementById('mainAppContent');
  if (mainApp) {
    mainApp.classList.add('app-background-scaled');
  }
}

function closeModal(id) {
  // 1. Hide the specific modal
  document.getElementById(id).classList.remove('active');
  
  // 2. Bring the main app background back to the front
  const mainApp = document.getElementById('mainAppContent');
  if (mainApp) {
    mainApp.classList.remove('app-background-scaled');
  }
}

function openViewWorkout(id) {
  const w = workouts.find(x => x.id === id);
  if (!w) return;

  const vol = w.exercises.reduce((a, e) => a + (e.sets * e.reps * e.weight), 0);

  document.getElementById('viewWName').textContent = w.name;
  document.getElementById('viewWDate').textContent = formatDate(w.date);
  document.getElementById('viewWDuration').textContent = w.duration || '0';
  document.getElementById('viewWVolume').textContent = Math.round(vol).toLocaleString();

  // Group the flat exercises back together by Name + Muscle for the UI
  const grouped = {};
  w.exercises.forEach(e => {
    const key = e.name.toLowerCase();
    if (!grouped[key]) grouped[key] = { name: e.name, muscle: e.muscle, setsData: [] };
    grouped[key].setsData.push({ s: e.sets, r: e.reps, w: e.weight });
  });

  const tbody = document.getElementById('viewWExercises');
  tbody.innerHTML = Object.values(grouped).map(group => {
    const totalVol = group.setsData.reduce((a, e) => a + (e.s * e.r * e.w), 0);
    const max1RM = Math.max(...group.setsData.map(e => calculate1RM(e.w, e.r)));
    
    // Stack the load entries visually using line breaks
    const setsHtml = group.setsData.map(e => e.s).join('<br>');
    const repsHtml = group.setsData.map(e => e.r).join('<br>');
    const weightHtml = group.setsData.map(e => e.w).join('<br>');

    return `
    <tr>
      <td style="vertical-align:top; padding-top:10px;">${group.name}</td>
      <td style="color:var(--muted);font-size:0.72rem; vertical-align:top; padding-top:10px;">${group.muscle || '—'}</td>
      <td style="vertical-align:top; padding-top:10px; line-height:1.5;">${setsHtml}</td>
      <td style="vertical-align:top; padding-top:10px; line-height:1.5;">${repsHtml}</td>
      <td style="vertical-align:top; padding-top:10px; line-height:1.5;">${weightHtml}</td>
      <td style="vertical-align:top; padding-top:10px;">${Math.round(totalVol)}</td>
      <td style="color: var(--accent); font-weight: 500; vertical-align:top; padding-top:10px;">${Math.round(max1RM)}</td>
    </tr>`;
  }).join('');

  const notesContainer = document.getElementById('viewWNotesContainer');
  if (w.notes) {
    document.getElementById('viewWNotes').textContent = w.notes;
    notesContainer.style.display = 'block';
  } else {
    notesContainer.style.display = 'none';
  }

  document.getElementById('viewBtnEdit').onclick = () => { closeModal('viewWorkoutModal'); openEditWorkout(w.id); };
  document.getElementById('viewBtnShare').onclick = () => shareWorkout(w.id);
  document.getElementById('viewBtnDelete').onclick = () => { closeModal('viewWorkoutModal'); deleteWorkout(w.id); };

  openModal('viewWorkoutModal');
}

// Close modal when clicking overlay background
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    
    // STRICT GATEKEEPER: Prevent closing the login screen if no user is logged in
    if (e.target.id === 'authOverlay' && typeof currentUser !== 'undefined' && !currentUser) {
      // Optional: Add a little "shake" animation or toast here to tell them to log in
      return; 
    }
    
    e.target.classList.remove('active');
  }
});

async function toggleLightMode(isLight, saveToCloud = true) {
  const toggleEl = document.getElementById('lightModeToggle');
  if (toggleEl) toggleEl.checked = isLight;
  
  if (isLight) {
    document.body.classList.add('light-mode');
    Chart.defaults.color = '#6b7280';
    Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.08)';
  } else {
    document.body.classList.remove('light-mode');
    Chart.defaults.color = 'rgba(255, 255, 255, 0.6)';
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
  }
  
  if (document.getElementById('view-progress').classList.contains('active')) {
    renderProgress();
  }

  // Cloud Sync Logic
  if (saveToCloud && currentUser) {
    try {
      await supabaseClient.from('user_settings').upsert({
        user_id: currentUser.id,
        light_mode: isLight ? '1' : '0'
      }, { onConflict: 'user_id' });
    } catch (err) {
      console.error("Failed to save theme to cloud:", err);
    }
  } else if (!currentUser) {
    localStorage.setItem('ctrlset_light_mode', isLight ? '1' : '0');
  }
}

function triggerConfetti() {
  for (let i = 0; i < 50; i++) {
    const div = document.createElement('div');
    div.className = 'confetti';
    div.style.left = Math.random() * 100 + 'vw';
    div.style.backgroundColor = Math.random() > 0.5 ? 'var(--accent)' : 'var(--green)';
    div.style.animationDelay = Math.random() * 2 + 's';
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }
}

// Function to toggle password visibility safely
function togglePassword() {
  const pwdInput = document.getElementById('authPassword');
  const toggleIcon = document.getElementById('togglePasswordVisibility');
  
  if (pwdInput.type === 'password') {
    pwdInput.type = 'text';
    toggleIcon.textContent = '🔒'; // Changes to a lock when visible
  } else {
    pwdInput.type = 'password';
    toggleIcon.textContent = '👁️'; // Changes back to eye when hidden
  }
}

function switchAuthView(targetView, email = '') {
  const welcomeView = document.getElementById('authWelcomeView');
  const formView = document.getElementById('authFormView');
  const successView = document.getElementById('authSuccessContainer'); // 👉 Added this
  const submitBtn = document.getElementById('authSubmitBtn');
  const subtitle = document.getElementById('authFormSubtitle');
  const errorEl = document.getElementById('authError');

  // Clear any old errors
  if (errorEl) errorEl.style.display = 'none';

  // Helper to safely hide all views
  const hideAllViews = () => {
    welcomeView.classList.remove('active-view');
    formView.classList.remove('active-view');
    if (successView) successView.classList.remove('active-view');
  };

  hideAllViews();

  setTimeout(() => {
    welcomeView.style.display = 'none';
    formView.style.display = 'none';
    if (successView) successView.style.display = 'none';

    if (targetView === 'welcome') {
      welcomeView.style.display = 'block';
      setTimeout(() => welcomeView.classList.add('active-view'), 10); 
    } 
    else if (targetView === 'login') {
      submitBtn.textContent = 'Sign In';
      submitBtn.onclick = handleLogin;
      subtitle.textContent = 'Sign In to Continue';
      formView.style.display = 'block';
      setTimeout(() => formView.classList.add('active-view'), 10);
    } 
    else if (targetView === 'signup') {
      submitBtn.textContent = 'Create Account';
      submitBtn.onclick = handleSignUp;
      subtitle.textContent = 'Create Your Ledger';
      formView.style.display = 'block';
      setTimeout(() => formView.classList.add('active-view'), 10);
    }
    // 👉 THE NEW SUCCESS STATE
    else if (targetView === 'success') {
      if (email) document.getElementById('sentEmailAddress').textContent = email;
      successView.style.display = 'block';
      setTimeout(() => successView.classList.add('active-view'), 10);
    }
  }, 300);
}