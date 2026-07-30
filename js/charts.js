let chartRange = '4w';
let activeChartMuscle = 'All';

// Chart.js needs actual computed color strings at chart-creation time — it
// doesn't react to CSS custom properties changing later, and Chart.defaults
// gets shadowed by any color set explicitly in a chart's own options (which
// every chart below does, for ticks/grid/tooltip). So each chart pulls its
// colors from here instead of hardcoding dark-mode-only values, which
// otherwise stay unreadable (e.g. neon yellow axis labels) in light mode.
function chartThemeColors() {
  const isLight = document.body.classList.contains('light-mode');
  return {
    tickColor: isLight ? '#57621f' : '#e8ff47',       // matches --accent's light/dark tuning
    tickColorGreen: isLight ? '#1b8a4a' : '#44ff88',  // matches --green's light/dark tuning
    axisLabelColor: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)',
    gridColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)',
    tooltipBg: isLight ? '#ffffff' : '#111',
    tooltipBorder: isLight ? 'rgba(0,0,0,0.15)' : '#2a2a2a',
    tooltipTitle: isLight ? '#171717' : '#e8ff47',
    tooltipBody: isLight ? '#171717' : '#f0f0f0',
    mutedColor: isLight ? '#6b7280' : '#888'
  };
}

function renderChart() {
  const canvas = document.getElementById('volumeChart');
  const wrap = canvas?.closest('.chart-wrap');
  if (!canvas || !wrap) return;
  const tc = chartThemeColors();

  const volumeChartSkeleton = document.getElementById('volumeChartSkeleton');
  const volumeChartContent = document.getElementById('volumeChartContent');
  if (volumeChartSkeleton) volumeChartSkeleton.style.display = 'none';
  if (volumeChartContent) volumeChartContent.style.display = '';

  const now = new Date();
  let cutoff = new Date(0); // Very old date as a fallback
  
  if (chartRange === '4w') { 
    cutoff = new Date(now); 
    cutoff.setDate(now.getDate() - 28); 
  }
  if (chartRange === '3m') { 
    cutoff = new Date(now); 
    cutoff.setMonth(now.getMonth() - 3); 
  }

  // Convert the calculated cutoff time into a clean YYYY-MM-DD string
  const cutoffStr = getLocalDateString(cutoff);

  // Compare the strings directly! (Super safe and faster)
  const filtered = workouts.filter(w => w.date >= cutoffStr);

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  const existingEmpty = wrap.querySelector('.empty-state');
  if (existingEmpty) existingEmpty.remove();

  // Rebuild muscle filter tabs from exercises in range
  const allMusclesInRange = [...new Set(
    filtered.flatMap(w => w.exercises.map(e => e.muscle).filter(Boolean))
  )].sort();
  const filterContainer = document.getElementById('chartMuscleFilter');
  if (filterContainer) {
    filterContainer.innerHTML = ['All', ...allMusclesInRange].map(m => `
      <button class="chart-btn chart-muscle-btn ${m === activeChartMuscle ? 'active' : ''}"
        onclick="setChartMuscle('${m}', this)">${m}</button>
    `).join('');
  }

  // Filter workouts by active muscle (exercise-level)
  const displayData = activeChartMuscle === 'All'
    ? filtered
    : filtered.map(w => ({
        ...w,
        exercises: w.exercises.filter(e => e.muscle === activeChartMuscle)
      })).filter(w => w.exercises.length > 0);

  if (!displayData.length) {
    canvas.style.display = 'none';
    wrap.insertAdjacentHTML('beforeend', '<div class="empty-state">No data for this period.</div>');
    document.getElementById('chartLegend').innerHTML = '';
    return;
  }
  canvas.style.display = 'block';

  // Unique sorted dates
  const allDates = [...new Set(displayData.map(w => w.date))].sort((a, b) => new Date(a) - new Date(b));

  // Muscle groups from exercises (not sessions)
  const muscleGroups = activeChartMuscle === 'All'
    ? [...new Set(displayData.flatMap(w => w.exercises.map(e => e.muscle || 'Other')))]
    : [activeChartMuscle];

  const palette = {
    'Chest':      { bg: 'rgba(232,255,71,0.7)',   border: '#e8ff47' },
    'Back':       { bg: 'rgba(255,107,53,0.7)',   border: '#ff6b35' },
    'Shoulders':  { bg: 'rgba(68,255,136,0.7)',   border: '#44ff88' },
    'Arms':       { bg: 'rgba(100,180,255,0.7)',  border: '#64b4ff' },
    'Legs':       { bg: 'rgba(200,100,255,0.7)',  border: '#c864ff' },
    'Core':       { bg: 'rgba(255,200,50,0.7)',   border: '#ffc832' },
    'Full Body':  { bg: 'rgba(255,255,255,0.5)',  border: '#ffffff' },
    'Cardio':     { bg: 'rgba(255,80,80,0.7)',    border: '#ff5050' },
    'Other':      { bg: 'rgba(120,120,120,0.5)',  border: '#888888' },
  };

  // Volume per muscle group per date — from exercise.muscle
  const datasets = muscleGroups.map(muscle => {
    const c = palette[muscle] || { bg: 'rgba(200,200,200,0.5)', border: '#ccc' };
    return {
      label: muscle,
      data: allDates.map(date => {
        const vol = displayData
          .filter(w => w.date === date)
          .reduce((sum, w) => sum + w.exercises
            .filter(e => (e.muscle || 'Other') === muscle)
            .reduce((a, e) => a + e.sets * e.reps * e.weight, 0), 0);
        return vol || null;
      }),
      backgroundColor: c.bg,
      borderColor: c.border,
      borderWidth: 1.5,
      borderRadius: 4,
      stack: 'volume',
    };
  });

  // Legend
  document.getElementById('chartLegend').innerHTML = muscleGroups.map(m => {
    const c = palette[m] || { border: '#ccc' };
    return `<div class="legend-item"><span style="width:10px;height:10px;border-radius:50%;background:${c.border};box-shadow:0 0 8px ${c.border};display:inline-block;"></span> ${m}</div>`;
  }).join('');

  chartInstance = new Chart(canvas, {
    type: 'bar',
    data: { labels: allDates.map(d => formatDate(d)), datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tc.tooltipBg, borderColor: tc.tooltipBorder, borderWidth: 1,
          titleColor: tc.tooltipTitle, bodyColor: tc.tooltipBody,
          titleFont: { family: 'DM Mono' }, bodyFont: { family: 'DM Mono' },
          callbacks: { label: ctx => `${ctx.dataset.label}: ${Math.round(ctx.raw || 0).toLocaleString()} kg` }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: tc.axisLabelColor, font: { family: 'DM Mono', size: 9 } } },
        y: { stacked: true, grid: { color: tc.gridColor }, ticks: { color: tc.tickColor, font: { family: 'DM Mono', size: 9 }, callback: v => v.toLocaleString() + ' kg' } }
      }
    }
  });
}

function setChartMuscle(muscle, btn) {
  activeChartMuscle = muscle;
  document.querySelectorAll('.chart-muscle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderChart();
}

function setChartRange(range, btn) {
  chartRange = range;
  document.querySelectorAll('.chart-btn:not(.chart-muscle-btn)').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderChart();
}

function renderHeatmap() {
  const container = document.getElementById('volumeHeatmap');
  if (!container) return;

  const skeleton = document.getElementById('heatmapSkeleton');
  const wrap = document.getElementById('heatmapContainer');
  if (skeleton) skeleton.style.display = 'none';
  if (wrap) wrap.style.display = '';

  const now = new Date();
  const heatmapData = {};

  let maxVolume = 0;
  workouts.forEach(w => {
    const vol = w.exercises.reduce((a, e) => a + (e.sets * e.reps * e.weight), 0);
    heatmapData[w.date] = (heatmapData[w.date] || 0) + vol;
    if (vol > maxVolume) maxVolume = vol;
  });

  let html = '';
  for (let w = 0; w < 13; w++) {
    html += '<div class="heatmap-column">';
    for (let d = 0; d < 7; d++) {
      const date = new Date(now);
      const dayOffset = (12 - w) * 7 + (6 - d);
      date.setDate(now.getDate() - dayOffset);
      const dateStr = getLocalDateString(date);
      
      const dailyVol = heatmapData[dateStr] || 0;
      let level = 0;
      let restEntry = null;

      if (dailyVol > 0) {
        const ratio = dailyVol / maxVolume;
        if (ratio < 0.25) level = 1;
        else if (ratio < 0.5) level = 2;
        else if (ratio < 0.75) level = 3;
        else level = 4;
      } else {
        restEntry = restDays.find(r => r.date === dateStr);
        if (restEntry) level = restEntry.restType === 'active' ? 'rest-active' : 'rest';
      }

      const tooltipText = level === 'rest' ? 'Complete Rest 🛋️'
        : level === 'rest-active' ? 'Active Rest 🏃'
        : `${Math.round(dailyVol)}kg`;
      html += `<div class="heatmap-day level-${level}" title="${formatDate(dateStr)}: ${tooltipText}"></div>`;
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

function renderBodyweightChart() {
  const canvas = document.getElementById('bwChart');
  const card = canvas?.closest('.card');
  if (!canvas) return;
  const tc = chartThemeColors();

  const bwSkeleton = document.getElementById('bwSkeleton');
  const bwChartWrap = document.getElementById('bwChartWrap');
  if (bwSkeleton) bwSkeleton.style.display = 'none';

  // Collect bodyweight entries sorted oldest → newest
  const entries = [...recoveryLogs]
    .filter(r => r.bodyweight > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (bwChartInstance) { bwChartInstance.destroy(); bwChartInstance = null; }

  if (!entries.length) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';
  if (bwChartWrap) bwChartWrap.style.display = '';

  const labels = entries.map(r => formatDate(r.date));
  const data   = entries.map(r => r.bodyweight);
  const minBW  = Math.min(...data) - 2;
  const maxBW  = Math.max(...data) + 2;

  bwChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Bodyweight (kg)',
        data,
        borderColor: '#44ff88',
        backgroundColor: 'rgba(68,255,136,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#44ff88',
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tc.tooltipBg,
          borderColor: tc.tooltipBorder,
          borderWidth: 1,
          titleColor: tc.tickColorGreen,
          bodyColor: tc.tooltipBody,
          titleFont: { family: 'DM Mono' },
          bodyFont: { family: 'DM Mono' },
          callbacks: { label: ctx => `${ctx.raw} kg` }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: tc.axisLabelColor, font: { family: 'DM Mono', size: 9 } }
        },
        y: {
          min: minBW,
          max: maxBW,
          grid: { color: tc.gridColor },
          ticks: { color: tc.tickColorGreen, font: { family: 'DM Mono', size: 9 }, callback: v => v + ' kg' }
        }
      }
    }
  });
}

function renderStrengthChart() {
  const picker = document.getElementById('strengthExercisePicker');
  const canvas = document.getElementById('strengthChart');
  const card = canvas?.closest('.card');
  if (!canvas || !picker) return;
  const tc = chartThemeColors();

  const strengthSkeleton = document.getElementById('strengthSkeleton');
  const strengthContent = document.getElementById('strengthContent');

  if (!workouts.length) {
    if (strengthSkeleton) strengthSkeleton.style.display = 'none';
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';
  if (strengthSkeleton) strengthSkeleton.style.display = 'none';
  if (strengthContent) strengthContent.style.display = '';

  const wrap = canvas.closest('.chart-wrap');
  const existingEmpty = wrap?.querySelector('.empty-state');
  if (existingEmpty) existingEmpty.remove();

  const name = picker.value;
  if (!name) {
    if (strengthChartInstance) { strengthChartInstance.destroy(); strengthChartInstance = null; }
    canvas.style.display = 'none';
    wrap?.insertAdjacentHTML('beforeend', '<div class="empty-state">Pick an exercise above to see its progress.</div>');
    return;
  }

  // Best weight per session date
  const points = workouts
    .filter(w => w.exercises.some(e => e.name.toLowerCase() === name.toLowerCase()))
    .map(w => {
      const best = w.exercises
        .filter(e => e.name.toLowerCase() === name.toLowerCase())
        .reduce((a, b) => b.weight > a.weight ? b : a);
      return { date: w.date, weight: best.weight, reps: best.reps };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (strengthChartInstance) { strengthChartInstance.destroy(); strengthChartInstance = null; }
  if (!points.length) {
    canvas.style.display = 'none';
    wrap?.insertAdjacentHTML('beforeend', '<div class="empty-state">No data for this exercise yet.</div>');
    return;
  }
  canvas.style.display = 'block';

  // Mark PRs
  let maxW = 0;
  const isPR = points.map(p => { const pr = p.weight > maxW; if (pr) maxW = p.weight; return pr; });

  strengthChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map(p => formatDate(p.date)),
      datasets: [{
        label: name,
        data: points.map(p => p.weight),
        borderColor: '#e8ff47',
        backgroundColor: 'rgba(232,255,71,0.07)',
        borderWidth: 2.5,
        pointBackgroundColor: points.map((_, i) => isPR[i] ? '#e8ff47' : 'rgba(232,255,71,0.4)'),
        pointRadius: points.map((_, i) => isPR[i] ? 6 : 4),
        pointHoverRadius: 7,
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tc.tooltipBg, borderColor: tc.tooltipBorder, borderWidth: 1,
          titleColor: tc.tickColor, bodyColor: tc.tooltipBody,
          titleFont: { family: 'DM Mono' }, bodyFont: { family: 'DM Mono' },
          callbacks: {
            label: ctx => {
              const p = points[ctx.dataIndex];
              return `${p.weight} kg × ${p.reps} reps${isPR[ctx.dataIndex] ? ' 🏆 PR' : ''}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: tc.axisLabelColor, font: { family: 'DM Mono', size: 9 } } },
        y: { grid: { color: tc.gridColor }, ticks: { color: tc.tickColor, font: { family: 'DM Mono', size: 9 }, callback: v => v + ' kg' } }
      }
    }
  });
}

function populateStrengthPicker() {
  const picker = document.getElementById('strengthExercisePicker');
  if (!picker) return;
  const names = [...new Set(workouts.flatMap(w => w.exercises.map(e => e.name)))].sort();
  const current = picker.value;
  picker.innerHTML = '<option value="">Pick an exercise…</option>' +
    names.map(n => `<option value="${n}" ${n === current ? 'selected' : ''}>${n}</option>`).join('');
}

function renderRadarChart() {
  const canvas = document.getElementById('muscleRadarChart');
  const card = canvas?.closest('.card');
  if (!canvas) return;
  const tc = chartThemeColors();

  const radarSkeleton = document.getElementById('radarSkeleton');
  const radarContainer = document.getElementById('radarContainer');
  if (radarSkeleton) radarSkeleton.style.display = 'none';

  const distribution = { 'Chest': 0, 'Back': 0, 'Shoulders': 0, 'Arms': 0, 'Legs': 0, 'Core': 0 };

  // Count volume (not sessions) per muscle group across all exercises
  workouts.forEach(w => {
    w.exercises.forEach(e => {
      if (e.muscle && distribution[e.muscle] !== undefined) {
        distribution[e.muscle] += e.sets * e.reps * e.weight;
      }
    });
  });

  if (radarInstance) { radarInstance.destroy(); radarInstance = null; }

  const totalVolume = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (!totalVolume) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';
  if (radarContainer) radarContainer.style.display = '';

  radarInstance = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: Object.keys(distribution),
      datasets: [{
        label: 'Volume (kg)',
        data: Object.values(distribution),
        backgroundColor: 'rgba(232,255,71,0.2)',
        borderColor: '#e8ff47',
        pointBackgroundColor: '#e8ff47',
        borderWidth: 2
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tc.tooltipBg, borderColor: tc.tooltipBorder, borderWidth: 1,
          titleColor: tc.tickColor, bodyColor: tc.tooltipBody,
          titleFont: { family: 'DM Mono' }, bodyFont: { family: 'DM Mono' },
          callbacks: { label: ctx => `${Math.round(ctx.raw).toLocaleString()} kg` }
        }
      },
      scales: {
        r: {
          angleLines: { color: tc.gridColor },
          grid: { color: tc.gridColor },
          pointLabels: { color: tc.mutedColor, font: { family: 'DM Mono' } },
          ticks: { display: false }
        }
      }
    }
  });
}

function toggleDetailedCharts() {
  const section = document.getElementById('detailedChartsSection');
  const chevron = document.getElementById('detailedChartsChevron');
  if (!section || !chevron) return;

  const willOpen = section.style.display === 'none';
  section.style.display = willOpen ? '' : 'none';
  chevron.classList.toggle('open', willOpen);
  localStorage.setItem('ctrlset_detailed_charts_open', willOpen ? '1' : '0');

  if (willOpen) {
    // Chart.js is generally good about picking up the correct size once its
    // canvas's parent goes from display:none to visible (responsive +
    // ResizeObserver), but force a resize on each existing instance as a
    // safety net in case any of them rendered at 0x0 while hidden.
    chartInstance?.resize();
    bwChartInstance?.resize();
    strengthChartInstance?.resize();
    radarInstance?.resize();
  }
}

// Restores the user's last expand/collapse choice for Detailed Charts.
// Collapsed by default for first-time users (keeps the Progress page
// shorter, with hierarchy: hero -> insights -> overview -> detail).
function initDetailedChartsState() {
  const section = document.getElementById('detailedChartsSection');
  const chevron = document.getElementById('detailedChartsChevron');
  if (!section || !chevron) return;
  const shouldBeOpen = localStorage.getItem('ctrlset_detailed_charts_open') === '1';
  section.style.display = shouldBeOpen ? '' : 'none';
  chevron.classList.toggle('open', shouldBeOpen);
}

function renderStagnationCard() {
  const listEl = document.getElementById('stagnationList');
  const skeleton = document.getElementById('stagnationSkeleton');
  const emptyEl = document.getElementById('stagnationEmpty');
  if (!listEl) return;
  if (skeleton) skeleton.style.display = 'none';

  // Collect every distinct exercise name logged so far
  const namesSeen = new Set();
  workouts.forEach(w => w.exercises.forEach(e => namesSeen.add(e.name)));

  const stagnantList = [];
  namesSeen.forEach(name => {
    // Same "one best set per session" pattern used by predictLoadBlock()
    const historyWorkouts = workouts.filter(w => w.exercises.some(e => e.name.toLowerCase() === name.toLowerCase()));
    if (historyWorkouts.length < 3) return;

    const historyBestSets = historyWorkouts.map(w =>
      w.exercises
        .filter(e => e.name.toLowerCase() === name.toLowerCase())
        .reduce((a, b) => calculate1RM(a.weight, a.reps) >= calculate1RM(b.weight, b.reps) ? a : b)
    );

    if (isStagnant(historyBestSets)) {
      const last = historyBestSets[0];
      const suggestion = Math.floor((last.weight * 0.9) * 2) / 2;
      stagnantList.push({ name, muscle: last.muscle, weight: last.weight, suggestion });
    }
  });

  if (!stagnantList.length) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  listEl.innerHTML = stagnantList.map(s => `
    <div class="stagnation-item">
      <div>
        <div class="stagnation-name">${s.name}</div>
        <div class="stagnation-meta">${s.muscle || '—'} • stuck at ${s.weight}kg for 3+ sessions</div>
      </div>
      <div class="stagnation-suggestion">Try ${s.suggestion}kg</div>
    </div>
  `).join('');
}

function getMonthBounds(monthOffset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
  return { start: getLocalDateString(start), end: getLocalDateString(end) };
}

function computePeriodStats(startDate, endDate) {
  const periodWorkouts = workouts.filter(w => w.date >= startDate && w.date <= endDate);
  const volume = periodWorkouts.reduce((sum, w) =>
    sum + w.exercises.reduce((a, e) => a + e.sets * e.reps * e.weight, 0), 0);

  // PR count within the period: seed max-per-exercise from everything
  // BEFORE the period started, then count new maxes hit during it.
  const priorWorkouts = workouts.filter(w => w.date < startDate).sort((a, b) => new Date(a.date) - new Date(b.date));
  const maxByExercise = {};
  priorWorkouts.forEach(w => {
    w.exercises.forEach(e => {
      const key = e.name.toLowerCase();
      if (!maxByExercise[key] || e.weight > maxByExercise[key]) maxByExercise[key] = e.weight;
    });
  });

  let prCount = 0;
  [...periodWorkouts].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(w => {
    const bestPerExercise = {};
    w.exercises.forEach(e => {
      const key = e.name.toLowerCase();
      if (!bestPerExercise[key] || e.weight > bestPerExercise[key].weight) bestPerExercise[key] = e;
    });
    Object.entries(bestPerExercise).forEach(([key, e]) => {
      if (!maxByExercise[key] || e.weight > maxByExercise[key]) {
        maxByExercise[key] = e.weight;
        prCount++;
      }
    });
  });

  // Best streak within the period (workouts + rest days, clipped to range)
  const datesInPeriod = new Set();
  periodWorkouts.forEach(w => datesInPeriod.add(w.date));
  restDays.filter(r => r.date >= startDate && r.date <= endDate).forEach(r => datesInPeriod.add(r.date));
  const bestStreak = computeBestStreakFromDates(datesInPeriod);

  return { volume, workoutCount: periodWorkouts.length, prCount, bestStreak };
}

// Same PR-detection logic as computePeriodStats(), but returns the actual
// PR events (exercise, weight, date) instead of just a count — used by the
// Share Progress poster to highlight what was actually hit this month.
function getPRsInPeriod(startDate, endDate) {
  const priorWorkouts = workouts.filter(w => w.date < startDate).sort((a, b) => new Date(a.date) - new Date(b.date));
  const maxByExercise = {};
  priorWorkouts.forEach(w => {
    w.exercises.forEach(e => {
      const key = e.name.toLowerCase();
      if (!maxByExercise[key] || e.weight > maxByExercise[key]) maxByExercise[key] = e.weight;
    });
  });

  const periodWorkouts = workouts.filter(w => w.date >= startDate && w.date <= endDate).sort((a, b) => new Date(a.date) - new Date(b.date));
  const prs = [];
  periodWorkouts.forEach(w => {
    const bestPerExercise = {};
    w.exercises.forEach(e => {
      const key = e.name.toLowerCase();
      if (!bestPerExercise[key] || e.weight > bestPerExercise[key].weight) bestPerExercise[key] = e;
    });
    Object.entries(bestPerExercise).forEach(([key, e]) => {
      if (!maxByExercise[key] || e.weight > maxByExercise[key]) {
        maxByExercise[key] = e.weight;
        prs.push({ name: e.name, muscle: e.muscle, weight: e.weight, date: w.date });
      }
    });
  });
  return prs;
}

function renderPeriodComparison() {
  const listEl = document.getElementById('periodComparisonList');
  const skeleton = document.getElementById('periodComparisonSkeleton');
  if (!listEl) return;
  if (skeleton) skeleton.style.display = 'none';
  listEl.style.display = '';

  const thisMonth = getMonthBounds(0);
  const lastMonth = getMonthBounds(-1);
  const current = computePeriodStats(thisMonth.start, thisMonth.end);
  const previous = computePeriodStats(lastMonth.start, lastMonth.end);

  const rows = [
    { label: 'Volume', suffix: 'kg', current: current.volume, previous: previous.volume },
    { label: 'Workouts', suffix: '', current: current.workoutCount, previous: previous.workoutCount },
    { label: 'PRs Set', suffix: '', current: current.prCount, previous: previous.prCount },
    { label: 'Best Streak', suffix: 'd', current: current.bestStreak, previous: previous.bestStreak }
  ];

  listEl.innerHTML = rows.map(r => {
    const diff = r.current - r.previous;
    const pct = r.previous > 0 ? Math.round((diff / r.previous) * 100) : (r.current > 0 ? 100 : 0);
    const trend = diff === 0 ? 'flat' : (diff > 0 ? 'up' : 'down');
    const arrow = trend === 'flat' ? '→' : (trend === 'up' ? '▲' : '▼');
    const deltaText = trend === 'flat' ? 'Same as last month' : `${arrow} ${Math.abs(pct)}% vs last month`;
    const displayValue = r.suffix === 'kg' ? Math.round(r.current).toLocaleString() : r.current;

    return `
      <div class="period-compare-row">
        <div class="period-compare-label">${r.label}</div>
        <div class="period-compare-value">${displayValue}${r.suffix}</div>
        <div class="period-compare-delta ${trend}">${deltaText}</div>
      </div>`;
  }).join('');
}

function renderProgress() {
  renderAchievements();
  renderPeriodComparison();
  renderPRs();
  renderStagnationCard();
  renderChart();
  renderBodyweightChart();
  populateStrengthPicker();
  renderStrengthChart();
}