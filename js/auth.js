// js/auth.js

// TODO: Replace with your actual Supabase URL and Anon Key
const supabaseUrl = 'https://gmtoubsbfohjvfwgpcul.supabase.co';
const supabaseKey = 'sb_publishable_vFentuyMfMOGoXL-KGj7xA_xj3KkKF_';

// CHANGED: Renamed to supabaseClient to avoid colliding with the CDN library
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;

function updateAccountUI() {
  const emailDisplay = document.getElementById('currentUserEmail');
  if (emailDisplay) {
    if (currentUser) {
      emailDisplay.textContent = currentUser.email;
    } else {
      emailDisplay.textContent = 'Not logged in';
    }
  }
}

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  
  if (session) {
    currentUser = session.user;
    updateAccountUI();
    
    // 1. Hide the auth modal
    const authOverlay = document.getElementById('authOverlay');
    unlockBodyScroll();
    _gsapCloseOverlay(authOverlay, () => authOverlay.classList.remove('active'));
    
    // 👉 2. BRING APP TO THE FRONT
    document.getElementById('mainAppContent')?.classList.remove('app-background-scaled');
    
    await syncDataFromSupabase(); 
  } else {
    // 1. Show the auth modal
    const authOverlay = document.getElementById('authOverlay');
    authOverlay.classList.add('active');
    lockBodyScroll();
    _gsapOpenOverlay(authOverlay);
    
    // 👉 2. PUSH APP TO THE BACKGROUND
    document.getElementById('mainAppContent')?.classList.add('app-background-scaled');
  }
}

async function handleLogin() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('authError');
  
  if (!email || !password) {
    errorEl.textContent = "Please enter both email and password.";
    errorEl.style.display = 'block';
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  } else {
    errorEl.style.display = 'none';
    currentUser = data.user;
    updateAccountUI();
    
    // 1. Hide the Auth Modal
    const authOverlay = document.getElementById('authOverlay');
    unlockBodyScroll();
    _gsapCloseOverlay(authOverlay, () => authOverlay.classList.remove('active'));
    
    // 👉 2. BRING THE APP TO THE FRONT!
    document.getElementById('mainAppContent')?.classList.remove('app-background-scaled');
    
    await syncDataFromSupabase();
  }
}

async function handleSignUp() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('authError');
  
  if (!email || !password) {
    errorEl.textContent = "Please enter both an email and password.";
    errorEl.style.display = 'block';
    return;
  }

  // Optional: If you use a toast notification function, keep this!
  if (typeof toast === 'function') toast("Creating account... ⏳");
  
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  } else {
    errorEl.style.display = 'none';
    
    if (data.session) {
      // User logged in immediately (Email Confirmation is OFF in Supabase)
      currentUser = data.session.user;
      updateAccountUI();
      
      // Close the modal and bring the app out of the background
      const authOverlay = document.getElementById('authOverlay');
      unlockBodyScroll();
      _gsapCloseOverlay(authOverlay, () => authOverlay.classList.remove('active'));
      document.getElementById('mainAppContent')?.classList.remove('app-background-scaled');
      
      await syncDataFromSupabase();
      if (typeof toast === 'function') toast("Account created! Welcome to CTRLSET 🎉");
    } else {
      // User must confirm email (Email Confirmation is ON in Supabase)
      document.getElementById('authPassword').value = ''; // Clear password for security
      
      // 👉 MAGIC HAPPENS HERE: Use the new UI controller
      switchAuthView('success', email);
    }
  }
}

// Helper to switch the modal back to the login form
function resetAuthView() {
  document.getElementById('authSuccessContainer').style.display = 'none';
  document.getElementById('authFormContainer').style.display = 'block';
  document.getElementById('authError').style.display = 'none';
}

async function handleLogout() {
  // 1. Kill the Supabase session
  await supabaseClient.auth.signOut();
  currentUser = null;
  updateAccountUI();
  
  // 2. Empty the local data arrays
  workouts = [];
  recoveryLogs = [];
  restDays = [];
  exercisesDB = [...defaultExercises];
  
  // 3. Nuke old LocalStorage data so it doesn't "ghost" back in
  localStorage.clear();

  // 4. Force the UI to re-render immediately (This wipes the screen clean)
  updateStats();
  renderHistory();
  renderProgress();
  renderNutritionInsights();
  refreshWorkoutNameDB();
  renderSettingsExerciseList();
  renderExerciseDB();

  // 5. Cancel any active workout session timers
  if (typeof sessionClockInterval !== 'undefined' && sessionClockInterval) {
    clearInterval(sessionClockInterval);
    sessionClockInterval = null;
    sessionStartTime = null;
    document.getElementById('sessionBar').classList.remove('active');
    document.getElementById('sessionClock').textContent = '00:00';
    document.getElementById('sessionToggleBtn').textContent = '▶ Start Session';
    document.getElementById('sessionToggleBtn').classList.remove('running');
    document.getElementById('fabEndSession').style.display = 'none';
  }

  // 👉 6. Close the settings modal so the background app is clean
  // (Change 'settingsModal' if your modal has a different ID)
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) settingsModal.classList.remove('active');

  // 7. Show the login modal and clear inputs
  const authOverlay = document.getElementById('authOverlay');
  authOverlay.classList.add('active');
  lockBodyScroll();
  _gsapOpenOverlay(authOverlay);
  document.getElementById('authPassword').value = '';
  document.getElementById('authEmail').value = '';
  
  // 👉 8. PUSH THE APP INTO THE BACKGROUND
  document.getElementById('mainAppContent')?.classList.add('app-background-scaled');
}

document.addEventListener('DOMContentLoaded', () => {
  checkSession();
});