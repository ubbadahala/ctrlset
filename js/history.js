let historyCurrentPage = 1;
let lastHistoryFilterSignature = null;
const HISTORY_PAGE_SIZE = 7;

function onHistoryDateRangeChange() {
  const val = document.getElementById('historyDateRange').value;
  document.getElementById('historyCustomDateRange').style.display = val === 'custom' ? 'flex' : 'none';
  renderHistory();
}

function changeHistoryPage(delta) {
  historyCurrentPage += delta;
  renderHistory();
}

let _historySearchDebounce = null;
function debouncedRenderHistory() {
  // Search re-renders the full (now stagger-animated) list on every
  // keystroke otherwise — debouncing means the list only actually
  // re-renders (and re-animates) once typing pauses, rather than on
  // every character.
  clearTimeout(_historySearchDebounce);
  _historySearchDebounce = setTimeout(renderHistory, 250);
}

function renderHistory() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const muscleFilter = document.getElementById('historyMuscleFilter')?.value || '';
  const sortOrder = document.getElementById('historySortOrder')?.value || 'newest';
  const list = document.getElementById('historyList');
  
  if (!list) return;

  // 0. Resolve the date range filter (presets or custom From/To)
  const dateRangeVal = document.getElementById('historyDateRange')?.value || 'all';
  let dateFrom = null, dateTo = null;
  if (dateRangeVal === 'custom') {
    dateFrom = document.getElementById('historyDateFrom')?.value || null;
    dateTo = document.getElementById('historyDateTo')?.value || null;
  } else if (dateRangeVal !== 'all') {
    const from = new Date();
    from.setDate(from.getDate() - parseInt(dateRangeVal, 10));
    dateFrom = getLocalDateString(from);
  }
  const inDateRange = (dateStr) => (!dateFrom || dateStr >= dateFrom) && (!dateTo || dateStr <= dateTo);

  // Reset to page 1 whenever the filter criteria actually change (search,
  // muscle, sort, date range) — but NOT on every re-render, so paging
  // controls and other actions (delete/undo, sync, etc.) don't bounce the
  // user back to page 1 unnecessarily.
  const filterSignature = JSON.stringify([q, muscleFilter, sortOrder, dateRangeVal, dateFrom, dateTo]);
  if (filterSignature !== lastHistoryFilterSignature) {
    historyCurrentPage = 1;
    lastHistoryFilterSignature = filterSignature;
  }

  // 1. Filter Workouts
  let filteredWorkouts = workouts.filter(w =>
    (w.name.toLowerCase().includes(q) ||
    w.exercises.some(e => e.name.toLowerCase().includes(q)) ||
    w.exercises.some(e => (e.muscle || '').toLowerCase().includes(q))) &&
    (!muscleFilter || w.exercises.some(e => e.muscle === muscleFilter)) &&
    inDateRange(w.date)
  ).map(w => ({ type: 'workout', data: w }));

  // 2. Filter Rest Days (Hide them if a specific muscle filter is applied, but keep them for search)
  let filteredRestDays = [];
  if (!muscleFilter && (!q || 'rest day'.includes(q) || 'active rest'.includes(q) || 'cardio'.includes(q))) {
    filteredRestDays = restDays.filter(r => inDateRange(r.date)).map(r => ({ type: 'rest', date: r.date, restType: r.restType || 'complete' }));
  }

  // 3. Combine and Sort
  let combined = [...filteredWorkouts, ...filteredRestDays];
  
  if (sortOrder === 'oldest') {
    combined.sort((a, b) => new Date(a.type === 'rest' ? a.date : a.data.date) - new Date(b.type === 'rest' ? b.date : b.data.date));
  } else if (sortOrder === 'volume') {
    combined.sort((a, b) => {
      const va = a.type === 'rest' ? -1 : a.data.exercises.reduce((s, e) => s + e.sets * e.reps * e.weight, 0);
      const vb = b.type === 'rest' ? -1 : b.data.exercises.reduce((s, e) => s + e.sets * e.reps * e.weight, 0);
      return vb - va; // Rest days get pushed to the bottom
    });
  } else {
    // Default: Newest first
    combined.sort((a, b) => new Date(b.type === 'rest' ? b.date : b.data.date) - new Date(a.type === 'rest' ? a.date : a.data.date));
  }

  // --- THE INTENTIONAL EMPTY STATE (Smart Version) ---
  if (!combined.length) {
    const isTotallyEmpty = workouts.length === 0;
    list.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; animation: fadeIn 0.5s ease;">
        <div style="font-size: 3.5rem; margin-bottom: 16px; filter: grayscale(1) opacity(0.5);">🏋️</div>
        <h3 style="font-family: 'Bebas Neue', sans-serif; font-size: 1.8rem; color: var(--text); letter-spacing: 0.05em; margin-bottom: 8px;">The CtrlSet Awaits</h3>
        <p style="font-size: 0.95rem; color: var(--muted); line-height: 1.5; max-width: 250px; margin: 0 auto;">
          ${isTotallyEmpty 
            ? 'You haven\'t logged any workouts yet. Hit "Start Session" to begin building your legacy.' 
            : 'No activity matches your current filters or search.'}
        </p>
      </div>
    `;
    return;
  }

  // 3.5 Paginate — caps the number of simultaneously-rendered entries
  // (each is a .glass-panel using backdrop-filter, which gets expensive
  // and, at high counts on iOS Safari, can crash the tab if the full
  // unfiltered history renders all at once).
  const totalPages = Math.max(1, Math.ceil(combined.length / HISTORY_PAGE_SIZE));
  if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;
  if (historyCurrentPage < 1) historyCurrentPage = 1;
  const pageItems = combined.slice((historyCurrentPage - 1) * HISTORY_PAGE_SIZE, historyCurrentPage * HISTORY_PAGE_SIZE);

  // 4. Render HTML
  const itemsHtml = pageItems.map(item => {
    // ── RENDER REST DAY ──
    if (item.type === 'rest') {
      const isActive = item.restType === 'active';
      return `
      <div class="rest-entry glass-panel${isActive ? ' active-rest' : ''}">
        <div class="rest-entry-title">${isActive ? '🏃 Active Rest' : '🛋️ Complete Rest'}</div>
        <div style="display:flex; align-items:center; gap:16px;">
          <span style="font-family:'DM Mono',monospace;font-size:0.75rem;color:var(--muted);">${formatDate(item.date)}</span>
          <button class="btn-icon" style="width:32px; height:32px; margin-bottom:0; font-size:0.85rem;" onclick="toggleRestDayType('${item.date}')" title="Switch to ${isActive ? 'Complete' : 'Active'} Rest">🔄</button>
          <button class="btn-icon" style="width:32px; height:32px; margin-bottom:0; font-size:0.85rem;" onclick="removeRestDay('${item.date}')" title="Delete Rest Day">✕</button>
        </div>
      </div>`;
    }

    // ── RENDER WORKOUT ──
    const w = item.data;
    const vol = w.exercises.reduce((a, e) => a + (e.sets * e.reps * e.weight), 0);
    const density = w.duration ? (vol / w.duration).toFixed(1) : 0;
    const chips = [...new Set(w.exercises.map(e => e.name))].map(name => `<span class="chip">${name}</span>`).join('');
    const musclePills = [...new Set(w.exercises.map(e => e.muscle).filter(Boolean))]
      .map(m => `<span class="meta-pill">${m}</span>`).join('');

    return `
    <div class="workout-entry-wrap">
      <div class="swipe-delete-bg">Delete ✕</div>
      <div class="workout-entry glass-panel" id="we-${w.id}" onclick="openViewWorkout('${w.id}')">
        <div class="workout-entry-header">
          <div class="workout-entry-name">${w.name}</div>
          <div class="workout-meta">
            ${musclePills}
            ${w.duration ? `<span class="meta-pill"><strong>${w.duration}</strong> min</span>` : ''}
            <span class="meta-pill"><strong>${Math.round(vol).toLocaleString()}</strong> vol</span>
            <span class="meta-pill">⚡ <strong>${density}</strong> /min</span>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="exercise-chips">${chips}</div>
          <span style="font-family:'DM Mono',monospace;font-size:0.65rem;color:var(--text);opacity:0.6;">${formatDate(w.date)}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  const paginationHtml = totalPages > 1 ? `
    <div class="history-pagination">
      <button class="history-page-btn" onclick="changeHistoryPage(-1)" ${historyCurrentPage <= 1 ? 'disabled' : ''}>‹ Prev</button>
      <span class="history-page-indicator">Page ${historyCurrentPage} of ${totalPages}</span>
      <button class="history-page-btn" onclick="changeHistoryPage(1)" ${historyCurrentPage >= totalPages ? 'disabled' : ''}>Next ›</button>
    </div>
  ` : '';

  list.innerHTML = itemsHtml + paginationHtml;

  if (typeof gsap !== 'undefined') {
    gsap.from(list.querySelectorAll('.rest-entry, .workout-entry-wrap'), {
      opacity: 0, y: 10, duration: 0.3, ease: 'power1.out', stagger: 0.04
    });
  }

  // Re-attach swipe-to-delete for the workouts currently on this page
  pageItems.forEach(item => {
    if (item.type === 'workout') {
      const el = document.getElementById('we-' + item.data.id);
      if (el) attachSwipeDelete(el, item.data.id);
    }
  });
}

// --- HELPER TO SHOW SKELETONS DURING CLOUD SYNC ---
function showHistorySkeletons() {
  const container = document.getElementById('historyList');
  if (container) {
    container.innerHTML = `
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card" style="opacity: 0.5;"></div>
    `;
  }
}

function renderRecoveryHistory() {
  const card = document.getElementById('recoveryHistoryCard');
  const list = document.getElementById('recoveryHistoryList');
  if (!list) return;
  const sorted = [...recoveryLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!sorted.length) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';
  list.innerHTML = sorted.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--glass-border);">
      <div>
        <div style="font-family:'DM Mono',monospace;font-size:0.7rem;color:var(--muted);margin-bottom:4px;">${formatDate(r.date)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${r.sleep ? `<span class="chip">😴 ${r.sleep}h sleep</span>` : ''}
          ${r.protein ? `<span class="chip">🥩 ${r.protein}g protein</span>` : ''}
          ${r.bodyweight ? `<span class="chip">⚖️ ${r.bodyweight}kg</span>` : ''}
          ${r.zinc ? `<span class="chip" style="color:var(--green)">💊 Zinc</span>` : ''}
          ${r.creatine ? `<span class="chip" style="color:var(--green)">⚡ Creatine</span>` : ''}
          ${r.soreness ? `<span class="chip">😤 Soreness ${r.soreness}/10</span>` : ''}
        </div>
      </div>
      <button class="btn-share" style="flex-shrink:0;margin-left:12px;" onclick="openEditRecovery('${r.date}')">✏️ Edit</button>
    </div>
  `).join('');
}

function renderPRs() {
  const prSkeleton = document.getElementById('prSkeleton');
  const prContent = document.getElementById('prContent');
  if (prSkeleton) prSkeleton.style.display = 'none';
  if (prContent) prContent.style.display = '';

  // Build PRs map: exercise name → best entry (with muscle group from the workout)
  const prs = {};
  workouts.forEach(w => {
    w.exercises.forEach(e => {
      if (!e.name) return;
      const key = e.name.toLowerCase();
      if (!prs[key] || e.weight > prs[key].weight) {
        prs[key] = { name: e.name, weight: e.weight, sets: e.sets, reps: e.reps, date: w.date, muscle: e.muscle || 'Other' };
      }
    });
  });

  const allEntries = Object.values(prs).sort((a, b) => b.weight - a.weight);
  const grid = document.getElementById('prGrid');
  const tabsEl = document.getElementById('prMuscleTabs');

  if (!allEntries.length) {
    tabsEl.innerHTML = '';
    grid.innerHTML = `<div class="empty-state" style="grid-column:span 2"><div class="empty-icon">🏆</div>Log workouts to see your PRs.</div>`;
    return;
  }

  // Build muscle group list
  const muscles = ['All', ...new Set(allEntries.map(e => e.muscle))];

  // Render tabs
  tabsEl.innerHTML = muscles.map(m => `
    <button class="muscle-tab-btn ${m === activePRMuscle ? 'active' : ''}" onclick="setPRMuscle('${m}')">${m}</button>
  `).join('');

  // Filter entries
  const filtered = activePRMuscle === 'All' ? allEntries : allEntries.filter(e => e.muscle === activePRMuscle);

  grid.innerHTML = filtered.slice(0, 10).map(pr => {
    const oneRM = Math.round(calculate1RM(pr.weight, pr.reps));
    return `
    <div class="pr-card glass-panel">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div class="pr-exercise">${pr.name}</div>
        <span style="font-family:'DM Mono',monospace;font-size:0.6rem;color:var(--muted);background:var(--glass-border);padding:2px 7px;border-radius:10px;white-space:nowrap;">${pr.muscle}</span>
      </div>
      <div class="pr-weight">${pr.weight} <span style="font-size:1rem;color:var(--text);opacity:0.5;">kg</span></div>
      <div class="pr-detail">${pr.sets}×${pr.reps} · ${formatDate(pr.date)}</div>
      <div style="margin-top:12px;display:inline-block;background:rgba(232,255,71,0.1);border:1px solid rgba(232,255,71,0.2);color:var(--accent);padding:4px 8px;border-radius:6px;font-family:'DM Mono',monospace;font-size:0.7rem;letter-spacing:0.05em;">
        EST 1RM: <strong>${oneRM} KG</strong>
      </div>
    </div>`;
  }).join('');
}

function setPRMuscle(muscle) {
  activePRMuscle = muscle;
  renderPRs();
}

let activePRMuscle = 'All';

// Rule-based readiness check — deliberately simple and explainable (each
// flag has a plain-language reason shown to the user) rather than a
// black-box numeric score. Combines the most recent recovery log (sleep,
// soreness) with how many consecutive days you've trained without a break.
function computeReadiness() {
  const todayStr = getLocalDateString();
  const reasons = [];
  let flags = 0;    // significant concerns
  let cautions = 0; // minor concerns

  // 1. Most recent recovery log, only if logged today or yesterday —
  // older data isn't a reliable signal for "how am I today".
  const recentLogs = [...recoveryLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
  const latestLog = recentLogs[0];
  const daysSinceLog = latestLog ? Math.round((new Date(todayStr) - new Date(latestLog.date)) / 86400000) : null;
  const hasRecentLog = !!latestLog && daysSinceLog !== null && daysSinceLog <= 1;

  if (hasRecentLog) {
    if (latestLog.sleep > 0) {
      if (latestLog.sleep < 6) { flags++; reasons.push(`Only ${latestLog.sleep}h sleep logged`); }
      else if (latestLog.sleep < 7) { cautions++; reasons.push(`${latestLog.sleep}h sleep — a bit short`); }
    }
    if (latestLog.soreness >= 7) { flags++; reasons.push(`High soreness logged (${latestLog.soreness}/10)`); }
    else if (latestLog.soreness >= 5) { cautions++; reasons.push(`Moderate soreness logged (${latestLog.soreness}/10)`); }
  }

  // 2. Consecutive training days ending today or yesterday (a workout
  // today doesn't exist yet when this runs on page load, so start from
  // yesterday if today has no entry).
  const workoutDates = new Set(workouts.map(w => w.date));
  let consecutive = 0;
  const cursor = new Date(todayStr + 'T00:00:00');
  if (!workoutDates.has(getLocalDateString(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (workoutDates.has(getLocalDateString(cursor))) {
    consecutive++;
    cursor.setDate(cursor.getDate() - 1);
  }
  if (consecutive >= 5) { flags++; reasons.push(`${consecutive} training days in a row without rest`); }
  else if (consecutive >= 3) { cautions++; reasons.push(`${consecutive} training days in a row`); }

  const hasSignal = hasRecentLog || consecutive > 0;
  const score = flags * 2 + cautions;
  const level = score >= 3 ? 'fatigued' : (score >= 1 ? 'moderate' : 'fresh');

  return { level, reasons, hasSignal };
}

function renderReadinessCard() {
  const card = document.getElementById('readinessCard');
  const icon = document.getElementById('readinessIcon');
  const label = document.getElementById('readinessLabel');
  const reasonsEl = document.getElementById('readinessReasons');
  if (!card) return;

  const { level, reasons, hasSignal } = computeReadiness();

  // Not enough data yet (brand-new user, or no recent recovery/training
  // signal at all) — stay quiet rather than show a meaningless card.
  if (!hasSignal) { card.style.display = 'none'; return; }

  card.style.display = '';
  card.classList.remove('readiness-fresh', 'readiness-moderate', 'readiness-fatigued');
  card.classList.add(`readiness-${level}`);

  const copy = {
    fresh: { icon: '💪', text: 'Fresh — ready to train' },
    moderate: { icon: '⚖️', text: 'Moderate — listen to your body' },
    fatigued: { icon: '😴', text: 'Fatigued — consider a lighter session or rest' }
  }[level];

  icon.textContent = copy.icon;
  label.textContent = copy.text;
  reasonsEl.textContent = reasons.length ? reasons.join(' · ') : 'No concerns detected.';
}

function checkRecoveryReminder() {
  const banner = document.getElementById('recoveryReminderBanner');
  const textEl = document.getElementById('recoveryReminderText');
  if (!banner || !textEl) return;

  const todayStr = getLocalDateString();
  const dismissedFor = localStorage.getItem('ctrlset_recovery_reminder_dismissed');
  if (dismissedFor === todayStr) {
    banner.style.display = 'none';
    return;
  }

  const latest = [...recoveryLogs].sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  if (!latest) {
    // Never logged recovery at all — only nudge once the user has at least
    // one workout, so brand-new users aren't hit with this on their first visit.
    if (!workouts.length) { banner.style.display = 'none'; return; }
    textEl.textContent = "💤 You haven't logged any recovery data yet — tap to start tracking sleep, protein & more";
    banner.style.display = 'flex';
    return;
  }

  const daysSince = Math.round((new Date(todayStr) - new Date(latest.date)) / 86400000);
  if (daysSince <= 0) {
    banner.style.display = 'none';
    return;
  }

  textEl.textContent = daysSince === 1
    ? "💤 You haven't logged recovery today — keep the streak going"
    : `💤 You haven't logged recovery in ${daysSince} days — tap to catch up`;
  banner.style.display = 'flex';
}

function scrollToRecoveryForm(e) {
  if (e && e.target.classList.contains('recovery-reminder-dismiss')) return;
  const card = document.getElementById('recoveryFormCard');
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.remove('recovery-form-highlight');
  void card.offsetWidth; // restart animation if triggered again
  card.classList.add('recovery-form-highlight');
}

function dismissRecoveryReminder(e) {
  if (e) e.stopPropagation();
  localStorage.setItem('ctrlset_recovery_reminder_dismissed', getLocalDateString());
  const banner = document.getElementById('recoveryReminderBanner');
  if (banner) banner.style.display = 'none';
}

function renderNutritionInsights() {
  const statsContainer = document.getElementById('nutritionStats');
  const heatmapContainer = document.getElementById('stackHeatmap');
  if (!statsContainer || !heatmapContainer) return;

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last7Days.push(getLocalDateString(d));
  }

  // Calculate Totals
  const totalProtein = recoveryLogs.reduce((sum, r) => sum + (r.protein || 0), 0);
  const zincDays = recoveryLogs.filter(r => r.zinc).length;
  const creatineDays = recoveryLogs.filter(r => r.creatine).length;

  // Latest bodyweight
  const latestBW = [...recoveryLogs]
    .filter(r => r.bodyweight > 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  // Calculate Protein Streak (days with > 0g protein)
  let proteinStreak = 0;
  const sortedLogs = [...recoveryLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
  for (let log of sortedLogs) {
    if (log.protein > 0) proteinStreak++;
    else break;
  }

  statsContainer.innerHTML = `
    <div class="nutrient-card glass-panel">
      <span class="streak-badge">STRK: ${proteinStreak}d</span>
      <span class="nutrient-icon">🥩</span>
      <div class="nutrient-count">${totalProtein}g</div>
      <div class="nutrient-label">Total Protein Logged</div>
    </div>
    <div class="nutrient-card glass-panel">
      <span class="nutrient-icon">💊</span>
      <div class="nutrient-count">${zincDays}</div>
      <div class="nutrient-label">Days Zinc Logged</div>
    </div>
    <div class="nutrient-card glass-panel">
      <span class="nutrient-icon">⚡</span>
      <div class="nutrient-count">${creatineDays}</div>
      <div class="nutrient-label">Days Creatine</div>
    </div>
    <div class="nutrient-card glass-panel">
      <span class="nutrient-icon">⚖️</span>
      <div class="nutrient-count">${latestBW ? latestBW.bodyweight + 'kg' : '—'}</div>
      <div class="nutrient-label">Latest Bodyweight</div>
    </div>
  `;

  // Render 7-day Mini Heatmap
  heatmapContainer.innerHTML = last7Days.map(date => {
    const log = recoveryLogs.find(r => r.date === date);
    const active = log && (log.zinc || log.creatine || log.protein > 0);
    return `
      <div style="
        flex: 1; 
        height: 12px; 
        border-radius: 3px; 
        background: ${active ? 'var(--green)' : 'var(--glass-border)'};
        box-shadow: ${active ? '0 0 8px var(--green)' : 'none'};
        opacity: ${active ? '0.8' : '1'};
      " title="${date}"></div>
    `;
  }).join('');
}

function peekHistoryBlock(bid) {
  document.querySelectorAll('.peek-popover').forEach(p => p.remove());
  const block = document.getElementById('exb-' + bid);
  if (!block) return;
  const name = block.querySelector('[data-field="name"]').value.trim();
  if (!name) return toast('Enter an exercise name first');

  const history = workouts
    .filter(w => w.exercises.some(e => e.name.toLowerCase() === name.toLowerCase()))
    .slice(0, 5)
    .map(w => {
      // THE FIX:
      const best = w.exercises
        .filter(e => e.name.toLowerCase() === name.toLowerCase())
        .reduce((a, b) => calculate1RM(a.weight, a.reps) >= calculate1RM(b.weight, b.reps) ? a : b);
      return { date: w.date, sets: best.sets, reps: best.reps, weight: best.weight };
    });

  const popover = document.createElement('div');
  popover.className = 'peek-popover';

  if (!history.length) {
    popover.innerHTML = `<div class="peek-popover-title">${name}</div><div class="peek-popover-empty">No history yet</div>`;
  } else {
    const prWeight = Math.max(...history.map(h => h.weight));
    popover.innerHTML = `
      <div class="peek-popover-title">Last ${history.length} · ${name}</div>
      <table>
        ${history.map(h => `<tr${h.weight === prWeight ? ' style="color:var(--accent)"' : ''}>
          <td>${formatDate(h.date)}</td>
          <td>${h.sets}×${h.reps} @ <strong style="color:var(--accent)">${h.weight}kg</strong>${h.weight === prWeight ? ' 🏆' : ''}</td>
        </tr>`).join('')}
      </table>`;
  }

  const closeHandler = (e) => { if (!popover.contains(e.target)) { popover.remove(); document.removeEventListener('click', closeHandler, true); } };
  setTimeout(() => document.addEventListener('click', closeHandler, true), 0);

  const wrapper = block.querySelector('.name-wrapper');
  wrapper.style.position = 'relative';
  wrapper.appendChild(popover);
}

function peekHistory(id) {
  // Close any open popovers first
  document.querySelectorAll('.peek-popover').forEach(p => p.remove());

  const nameInput = document.querySelector(`#ex-${id} [data-field="name"]`);
  const name = nameInput?.value.trim();
  if (!name) return toast("Enter an exercise name first");

  const history = workouts
    .filter(w => w.exercises.some(e => e.name.toLowerCase() === name.toLowerCase()))
    .slice(0, 5)
    .map(w => {
      // THE FIX:
      const best = w.exercises
        .filter(e => e.name.toLowerCase() === name.toLowerCase())
        .reduce((a, b) => calculate1RM(a.weight, a.reps) >= calculate1RM(b.weight, b.reps) ? a : b);
      return { date: w.date, sets: best.sets, reps: best.reps, weight: best.weight };
    });

  const popover = document.createElement('div');
  popover.className = 'peek-popover';

  if (!history.length) {
    popover.innerHTML = `<div class="peek-popover-title">${name}</div><div class="peek-popover-empty">No history yet</div>`;
  } else {
    // Find the PR weight across all history
    const prWeight = Math.max(...history.map(h => h.weight));
    popover.innerHTML = `
      <div class="peek-popover-title">Last ${history.length} · ${name}</div>
      <table>
        ${history.map(h => `<tr${h.weight === prWeight ? ' style="color:var(--accent)"' : ''}>
          <td>${formatDate(h.date)}</td>
          <td>${h.sets}×${h.reps} @ <strong style="color:var(--accent)">${h.weight}kg</strong>${h.weight === prWeight ? ' 🏆' : ''}</td>
        </tr>`).join('')}
      </table>`;
  }

  // Close on outside click
  const closeHandler = (e) => { if (!popover.contains(e.target)) { popover.remove(); document.removeEventListener('click', closeHandler, true); } };
  setTimeout(() => document.addEventListener('click', closeHandler, true), 0);

  const wrapper = document.getElementById('ex-' + id).querySelector('.name-wrapper');
  wrapper.style.position = 'relative';
  wrapper.appendChild(popover);
}

function attachSwipeDelete(el, workoutId) {
  let startX = 0, currentX = 0, isDragging = false;
  const THRESHOLD = 80;
  const deleteBg = el.parentElement?.querySelector('.swipe-delete-bg');

  el.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    isDragging = true;
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    if (!isDragging) return;
    currentX = e.touches[0].clientX - startX;
    if (currentX < 0) {
      el.style.transform = `translateX(${Math.max(currentX, -120)}px)`;
      if (deleteBg) deleteBg.style.opacity = '1';
    }
  }, { passive: true });

  el.addEventListener('touchend', () => {
    isDragging = false;
    if (currentX < -THRESHOLD) {
      el.style.transform = 'translateX(-120px)';
      showConfirm({
        icon: '🗑️',
        title: 'Delete Workout',
        body: 'This workout will be removed. You can undo for a few seconds after.',
        confirmLabel: 'Delete',
        danger: true,
        onConfirm: () => deleteWorkout(workoutId),
        onCancel: () => {
          el.style.transform = '';
          if (deleteBg) deleteBg.style.opacity = '0';
        }
      });
    } else {
      el.style.transform = '';
      if (deleteBg) deleteBg.style.opacity = '0';
    }
    currentX = 0;
  });
}

function deleteWorkout(id) {
  showConfirm({
    icon: '🗑️',
    title: 'Delete Workout',
    body: 'This workout will be removed. You can undo for a few seconds after.',
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => {
      const idx = workouts.findIndex(w => w.id === id);
      if (idx === -1) return;
      const removed = workouts[idx];

      // Optimistic UI: remove locally right away so it feels instant
      workouts.splice(idx, 1);
      updateStats();
      renderHistory();

      let undone = false;
      const pendingDelete = setTimeout(async () => {
        if (undone) return;
        const { error: setsErr } = await supabaseClient.from('workout_sets').delete().eq('workout_id', id);
        const { error: wErr } = await supabaseClient.from('workouts').delete().eq('id', id);
        if (wErr || setsErr) {
          console.error(wErr || setsErr);
          // Cloud delete failed — restore locally so state doesn't drift from the cloud
          workouts.push(removed);
          workouts.sort((a, b) => new Date(b.date) - new Date(a.date));
          updateStats();
          renderHistory();
          toast('Failed to delete from cloud — restored.');
        }
      }, 5000);

      toastWithUndo('Workout deleted', '🗑️', () => {
        undone = true;
        clearTimeout(pendingDelete);
        workouts.push(removed);
        workouts.sort((a, b) => new Date(b.date) - new Date(a.date));
        updateStats();
        renderHistory();
        toast('Restored ✅');
      });
    }
  });
}

function openRestDayModal() {
  document.getElementById('restTypeOverlay').classList.add('active');
  lockBodyScroll();
}

function dismissRestTypeModal() {
  document.getElementById('restTypeOverlay').classList.remove('active');
  unlockBodyScroll();
}

async function logRestDay(restType) {
  dismissRestTypeModal();

  const todayStr = getLocalDateString();
  let selectedDate = document.getElementById('wDate').value || todayStr;
  const dateLabel = (selectedDate === todayStr) ? 'today' : formatDate(selectedDate);

  if (restDays.some(r => r.date === selectedDate)) {
    return toast(`Rest day already logged for ${dateLabel}.`);
  }

  const { error } = await supabaseClient.from('rest_days').insert({
    user_id: currentUser.id,
    rest_date: selectedDate,
    rest_type: restType
  });

  if (error) {
    console.error(error);
    return toast("Error logging rest day.");
  }

  restDays.push({ date: selectedDate, restType });
  updateStats();
  renderHistory();
  renderHeatmap();
  const label = restType === 'active' ? 'Active rest' : 'Rest day';
  toast(`${label} logged for ${dateLabel} ${restType === 'active' ? '🏃' : '🛌'}`);
}

function removeRestDay(date) {
  showConfirm({
    icon: '🗑️',
    title: 'Remove Rest Day',
    body: `Remove the rest day logged on ${formatDate(date)}? You can undo for a few seconds after.`,
    confirmLabel: 'Remove',
    danger: true,
    onConfirm: () => {
      const idx = restDays.findIndex(r => r.date === date);
      if (idx === -1) return;
      const removed = restDays[idx];

      restDays.splice(idx, 1);
      updateStats();
      renderHistory();
      renderProgress();
      renderHeatmap();

      let undone = false;
      const pendingDelete = setTimeout(async () => {
        if (undone) return;
        const { error } = await supabaseClient
          .from('rest_days')
          .delete()
          .match({ user_id: currentUser.id, rest_date: date });
        if (error) {
          console.error(error);
          restDays.push(removed);
          restDays.sort((a, b) => new Date(b.date) - new Date(a.date));
          updateStats();
          renderHistory();
          renderProgress();
          renderHeatmap();
          toast('Failed to remove from cloud — restored.');
        }
      }, 5000);

      toastWithUndo('Rest day removed', '🗑️', () => {
        undone = true;
        clearTimeout(pendingDelete);
        restDays.push(removed);
        restDays.sort((a, b) => new Date(b.date) - new Date(a.date));
        updateStats();
        renderHistory();
        renderProgress();
        renderHeatmap();
        toast('Restored ✅');
      });
    }
  });
}

async function toggleRestDayType(date) {
  const entry = restDays.find(r => r.date === date);
  if (!entry) return;

  const previousType = entry.restType;
  const newType = previousType === 'active' ? 'complete' : 'active';

  // Optimistic update
  entry.restType = newType;
  renderHistory();
  renderProgress();
  renderHeatmap();

  const { error } = await supabaseClient
    .from('rest_days')
    .update({ rest_type: newType })
    .match({ user_id: currentUser.id, rest_date: date });

  if (error) {
    console.error(error);
    entry.restType = previousType; // revert on failure
    renderHistory();
    renderProgress();
    renderHeatmap();
    return toast('Failed to update rest day.');
  }

  toast(newType === 'active' ? 'Switched to Active Rest 🏃' : 'Switched to Complete Rest 🛋️');
}

function showRecap(workout, isVolumePR) {
  const vol = workout.exercises.reduce((a, e) => a + e.sets * e.reps * e.weight, 0);
  const totalSets = workout.exercises.reduce((a, e) => a + e.sets, 0);
  const uniqueMuscles = [...new Set(workout.exercises.map(e => e.muscle).filter(Boolean))];

  // Hero
  document.getElementById('recapWorkoutName').textContent = workout.name;
  const muscleStr = uniqueMuscles.length ? ` · ${uniqueMuscles.join(' + ')}` : '';
  document.getElementById('recapDate').textContent = formatDate(workout.date) + muscleStr;

  // Stat cards
  document.getElementById('recapStats').innerHTML = `
    <div class="recap-stat">
      <div class="recap-stat-val">${workout.duration || '—'}</div>
      <div class="recap-stat-label">Minutes</div>
    </div>
    <div class="recap-stat">
      <div class="recap-stat-val">${Math.round(vol).toLocaleString()}</div>
      <div class="recap-stat-label">Total Volume (kg)</div>
    </div>
    <div class="recap-stat">
      <div class="recap-stat-val">${totalSets}</div>
      <div class="recap-stat-label">Total Sets</div>
    </div>
  `;

  // Build PRs map to detect new PRs in this session
  const prevPRs = {};
  workouts.slice(1).forEach(w => {
    w.exercises.forEach(e => {
      const key = e.name.toLowerCase();
      if (!prevPRs[key] || e.weight > prevPRs[key]) prevPRs[key] = e.weight;
    });
  });

  // Group flat exercises by name — same grouping the History detail view uses,
  // so a session with 3 sets of Bench Press shows as ONE row with stacked sets,
  // not 3 separate rows.
  const grouped = {};
  workout.exercises.forEach(e => {
    const key = e.name.toLowerCase();
    if (!grouped[key]) grouped[key] = { name: e.name, muscle: e.muscle, setsData: [] };
    grouped[key].setsData.push({ s: e.sets, r: e.reps, w: e.weight });
  });

  let tableRows = '';
  Object.values(grouped).forEach(group => {
    const totalVol = group.setsData.reduce((a, e) => a + (e.s * e.r * e.w), 0);
    const max1RM = Math.max(...group.setsData.map(e => calculate1RM(e.w, e.r)));
    const maxWeight = Math.max(...group.setsData.map(e => e.w));
    const isPR = maxWeight > (prevPRs[group.name.toLowerCase()] || 0);

    // Stack the load entries visually using line breaks, same as History detail
    const setsHtml = group.setsData.map(e => e.s).join('<br>');
    const repsHtml = group.setsData.map(e => e.r).join('<br>');
    const weightHtml = group.setsData.map(e => e.w).join('<br>');

    tableRows += `<tr>
      <td style="vertical-align:top;padding-top:10px;">${group.name}${isPR ? '<span class="recap-pr-badge">NEW PR</span>' : ''}</td>
      <td style="color:var(--muted);font-size:0.72rem;vertical-align:top;padding-top:10px;">${group.muscle || '—'}</td>
      <td style="vertical-align:top;padding-top:10px;line-height:1.5;">${setsHtml}</td>
      <td style="vertical-align:top;padding-top:10px;line-height:1.5;">${repsHtml}</td>
      <td style="vertical-align:top;padding-top:10px;line-height:1.5;">${weightHtml}</td>
      <td style="vertical-align:top;padding-top:10px;">${Math.round(totalVol)}</td>
      <td style="color:var(--accent);vertical-align:top;padding-top:10px;">${Math.round(max1RM)}</td>
    </tr>`;
  });
  document.getElementById('recapTableBody').innerHTML = tableRows;

  // Notes
  const notesEl = document.getElementById('recapNotes');
  const notesText = document.getElementById('recapNotesText');
  if (workout.notes) {
    notesText.textContent = `"${workout.notes}"`;
    notesEl.style.display = 'block';
  } else {
    notesEl.style.display = 'none';
  }

  if (isVolumePR) toast('🔥 NEW ALL-TIME VOLUME PR!');

  document.getElementById('recapOverlay').classList.add('active');
  lockBodyScroll();
}

function closeRecap() {
  document.getElementById('recapOverlay').classList.remove('active');
  unlockBodyScroll();
}

function closeRecapAndGoHistory() {
  closeRecap();
  switchTab('history', document.querySelector('.tab:nth-child(2)'));
}

// Saves/shares a generated poster canvas as an image. iOS Safari (including
// homescreen-installed PWAs) does not reliably support the <a download>
// trick — it either navigates to the data URI instead of downloading, or
// does nothing visible at all in standalone mode. The Web Share API with a
// File is the actual working approach there: it opens the native share
// sheet, from which "Save Image" (or sharing directly to Messages/
// Instagram/etc.) works correctly. Desktop browsers mostly don't support
// sharing files, so they fall back to the original direct-download method.
async function sharePosterImage(canvas, filename) {
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    if (!blob) throw new Error('Canvas produced an empty image');
    const file = new File([blob], filename, { type: 'image/jpeg' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'CtrlSet' });
      toast('Shared! 📸');
      return;
    }
  } catch (err) {
    // Tapping "Cancel" on the native share sheet rejects with an
    // AbortError — that's a normal cancellation, not a failure.
    if (err && err.name === 'AbortError') return;
    console.error('Web Share failed, falling back to direct download:', err);
  }

  // Fallback for browsers without file-sharing support (mainly desktop).
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/jpeg', 0.95);
  link.click();
  toast('Poster saved! Ready for Instagram. 📸');
}

function shareProgress() {
  toast('Generating poster... ⏳');

  const node = document.getElementById('share-node');
  const { start, end } = getMonthBounds(0);
  const stats = computePeriodStats(start, end);
  const prs = getPRsInPeriod(start, end);
  const achievements = computeAchievements();
  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Adapt colors based on Light/Dark mode for the poster output
  const isLight = document.body.classList.contains('light-mode');
  const bgGrid = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.02)';
  const bgColor = isLight ? '#f2f2f0' : '#050505';
  const cardBg = isLight ? 'rgba(255,255,255,0.8)' : 'rgba(20,20,20,0.8)';
  const textColor = isLight ? '#111' : '#f0f0f0';
  const mutedColor = isLight ? '#777' : '#888';
  const borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';

  node.innerHTML = `
    <div class="share-content" style="background-color: ${bgColor}; background-image: radial-gradient(circle at 15% 50%, rgba(232,255,71,0.08), transparent 40%), radial-gradient(circle at 85% 30%, rgba(255,107,53,0.08), transparent 40%), linear-gradient(${bgGrid} 1px, transparent 1px), linear-gradient(90deg, ${bgGrid} 1px, transparent 1px); background-size: 100% 100%, 100% 100%, 40px 40px, 40px 40px; padding: 40px; border-radius: 20px;">

      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 30px;">
        <div>
          <div style="font-family:'Bebas Neue', sans-serif; font-size:3.5rem; letter-spacing:0.08em; color:var(--accent); margin-bottom:5px; line-height:1; text-shadow: 0 0 20px rgba(232,255,71,0.2);">
            Ctrl<span style="color:${textColor}">Set</span>
          </div>
          <div style="font-family:'DM Mono', monospace; font-size:0.85rem; letter-spacing:0.1em; color:${mutedColor}; text-transform:uppercase;">
            Progress Report — ${escapeHtml(monthLabel)}
          </div>
        </div>
      </div>

      <div style="display:flex; gap:16px; margin-bottom:30px;">
        <div style="background:${cardBg}; border:1px solid ${borderColor}; border-radius:16px; padding:20px; flex:1; position:relative; overflow:hidden;">
          <div style="position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg, var(--accent), transparent);"></div>
          <div style="font-family:'DM Mono', monospace; font-size:0.72rem; letter-spacing:0.1em; color:${mutedColor}; margin-bottom:8px;">VOLUME</div>
          <div style="font-family:'Bebas Neue', sans-serif; font-size:2rem; color:var(--accent); line-height:1;">${Math.round(stats.volume).toLocaleString()} KG</div>
        </div>
        <div style="background:${cardBg}; border:1px solid ${borderColor}; border-radius:16px; padding:20px; flex:1; position:relative; overflow:hidden;">
          <div style="position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg, var(--accent), transparent);"></div>
          <div style="font-family:'DM Mono', monospace; font-size:0.72rem; letter-spacing:0.1em; color:${mutedColor}; margin-bottom:8px;">WORKOUTS</div>
          <div style="font-family:'Bebas Neue', sans-serif; font-size:2rem; color:${textColor}; line-height:1;">${stats.workoutCount}</div>
        </div>
        <div style="background:${cardBg}; border:1px solid ${borderColor}; border-radius:16px; padding:20px; flex:1; position:relative; overflow:hidden;">
          <div style="position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg, var(--accent), transparent);"></div>
          <div style="font-family:'DM Mono', monospace; font-size:0.72rem; letter-spacing:0.1em; color:${mutedColor}; margin-bottom:8px;">BEST STREAK</div>
          <div style="font-family:'Bebas Neue', sans-serif; font-size:2rem; color:${textColor}; line-height:1;">${stats.bestStreak}D</div>
        </div>
      </div>

      ${prs.length ? `
      <div style="background:${cardBg}; border:1px solid ${borderColor}; border-radius:20px; padding:24px; margin-bottom:20px;">
        <div style="font-family:'DM Mono', monospace; font-size:0.75rem; letter-spacing:0.1em; color:${mutedColor}; margin-bottom:16px; border-bottom:1px solid ${borderColor}; padding-bottom:12px;">🏆 PRs THIS MONTH</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${prs.map(pr => `
            <span style="font-family:'DM Mono', monospace; font-size:0.85rem; color:var(--accent); background:rgba(232,255,71,0.1); padding:6px 12px; border-radius:6px; border:1px solid rgba(232,255,71,0.2);">
              ${escapeHtml(pr.name)} <strong style="font-weight:700;">${pr.weight}kg</strong>
            </span>
          `).join('')}
        </div>
      </div>` : ''}

      <div style="background:${cardBg}; border:1px solid ${borderColor}; border-radius:16px; padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-family:'DM Mono', monospace; font-size:0.8rem; letter-spacing:0.05em; color:${mutedColor};">🏅 ACHIEVEMENTS UNLOCKED</span>
        <span style="font-family:'Bebas Neue', sans-serif; font-size:1.6rem; color:var(--accent);">${unlockedCount}/${achievements.length}</span>
      </div>
    </div>
  `;

  setTimeout(() => {
    html2canvas(node.querySelector('.share-content'), {
      backgroundColor: null,
      scale: 2,
      logging: false,
      useCORS: true
    }).then(async canvas => {
      await sharePosterImage(canvas, `ctrlset-progress-${getLocalDateString()}.jpg`);
      node.innerHTML = '';
    }).catch(err => {
      console.error(err);
      toast('Failed to generate image.');
    });
  }, 150);
}

function shareWorkout(id) {
  const w = workouts.find(x => x.id === id);
  if (!w) return;
  
  toast('Generating poster... ⏳');
  
  const vol = w.exercises.reduce((a, e) => a + (e.sets * e.reps * e.weight), 0);
  const node = document.getElementById('share-node');
  
  // Group flat data into blocks for a cleaner poster
  const grouped = {};
  w.exercises.forEach(e => {
    const key = e.name.toLowerCase();
    if (!grouped[key]) grouped[key] = { name: e.name, muscle: e.muscle, loads: [] };
    grouped[key].loads.push({ s: e.sets, r: e.reps, w: e.weight });
  });

  // Adapt colors based on Light/Dark mode for the poster output
  const isLight = document.body.classList.contains('light-mode');
  const bgGrid = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.02)';
  const bgColor = isLight ? '#f2f2f0' : '#050505';
  const cardBg = isLight ? 'rgba(255,255,255,0.8)' : 'rgba(20,20,20,0.8)';
  const textColor = isLight ? '#111' : '#f0f0f0';
  const mutedColor = isLight ? '#777' : '#888';
  const borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';

  node.innerHTML = `
    <div class="share-content" style="background-color: ${bgColor}; background-image: radial-gradient(circle at 15% 50%, rgba(232,255,71,0.08), transparent 40%), radial-gradient(circle at 85% 30%, rgba(255,107,53,0.08), transparent 40%), linear-gradient(${bgGrid} 1px, transparent 1px), linear-gradient(90deg, ${bgGrid} 1px, transparent 1px); background-size: 100% 100%, 100% 100%, 40px 40px, 40px 40px; padding: 40px; border-radius: 20px;">
      
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 30px;">
        <div>
          <div style="font-family:'Bebas Neue', sans-serif; font-size:3.5rem; letter-spacing:0.08em; color:var(--accent); margin-bottom:5px; line-height:1; text-shadow: 0 0 20px rgba(232,255,71,0.2);">
            Ctrl<span style="color:${textColor}">Set</span>
          </div>
          <div style="font-family:'DM Mono', monospace; font-size:0.85rem; letter-spacing:0.1em; color:${mutedColor}; text-transform:uppercase;">
            ${formatDate(w.date)}
          </div>
        </div>
      </div>

      <div style="font-family:'Bebas Neue', sans-serif; font-size:2.8rem; letter-spacing:0.05em; color:${textColor}; margin-bottom:24px; line-height:1.1;">
        ${w.name}
      </div>

      <div style="display:flex; gap:16px; margin-bottom:30px;">
        <div style="background:${cardBg}; border:1px solid ${borderColor}; border-radius:16px; padding:20px; flex:1; position:relative; overflow:hidden;">
          <div style="position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg, var(--accent), transparent);"></div>
          <div style="font-family:'DM Mono', monospace; font-size:0.75rem; letter-spacing:0.12em; color:${mutedColor}; margin-bottom:8px;">TOTAL VOLUME</div>
          <div style="font-family:'Bebas Neue', sans-serif; font-size:2.4rem; color:var(--accent); line-height:1;">${Math.round(vol).toLocaleString()} KG</div>
        </div>
        ${w.duration ? `
        <div style="background:${cardBg}; border:1px solid ${borderColor}; border-radius:16px; padding:20px; flex:1; position:relative; overflow:hidden;">
          <div style="position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg, var(--accent), transparent);"></div>
          <div style="font-family:'DM Mono', monospace; font-size:0.75rem; letter-spacing:0.12em; color:${mutedColor}; margin-bottom:8px;">DURATION</div>
          <div style="font-family:'Bebas Neue', sans-serif; font-size:2.4rem; color:${textColor}; line-height:1;">${w.duration} MIN</div>
        </div>` : ''}
      </div>

      <div style="background:${cardBg}; border:1px solid ${borderColor}; border-radius:20px; padding:24px;">
        <div style="font-family:'DM Mono', monospace; font-size:0.75rem; letter-spacing:0.1em; color:${mutedColor}; margin-bottom:20px; border-bottom:1px solid ${borderColor}; padding-bottom:12px;">EXERCISES</div>
        
        ${Object.values(grouped).map((group, i, arr) => `
          <div style="margin-bottom:${i === arr.length - 1 ? '0' : '20px'};">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
              <span style="font-size:1.2rem; font-weight:500; color:${textColor}; font-family:'Bebas Neue', sans-serif; letter-spacing:0.04em;">${group.name}</span>
              ${group.muscle ? `<span style="font-family:'DM Mono', monospace; font-size:0.65rem; color:${mutedColor}; text-transform:uppercase;">${group.muscle}</span>` : ''}
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${group.loads.map(l => `
                <span style="font-family:'DM Mono', monospace; font-size:0.85rem; color:var(--accent); background:rgba(232,255,71,0.1); padding:4px 10px; border-radius:6px; border:1px solid rgba(232,255,71,0.2);">
                  ${l.s} × ${l.r} @ <strong style="font-weight:600;">${l.w}kg</strong>
                </span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  setTimeout(() => {
    // Target the specific inner content so background styling stays perfectly bound
    html2canvas(node.querySelector('.share-content'), {
      backgroundColor: null,
      scale: 2,
      logging: false,
      useCORS: true
    }).then(async canvas => {
      await sharePosterImage(canvas, `ctrlset-${w.date.replace(/-/g, '')}.jpg`);
      node.innerHTML = ''; // Clean up invisible DOM
    }).catch(err => {
      console.error(err);
      toast('Failed to generate image.');
    });
  }, 150); // slight delay to ensure fonts render before snapping
}
