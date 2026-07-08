let chartRange = '4w';
let activeChartMuscle = 'All';

function renderChart() {
  const canvas = document.getElementById('volumeChart');
  const wrap = canvas?.closest('.chart-wrap');
  if (!canvas || !wrap) return;

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
          backgroundColor: '#111', borderColor: '#2a2a2a', borderWidth: 1,
          titleColor: '#e8ff47', bodyColor: '#f0f0f0',
          titleFont: { family: 'DM Mono' }, bodyFont: { family: 'DM Mono' },
          callbacks: { label: ctx => `${ctx.dataset.label}: ${Math.round(ctx.raw || 0).toLocaleString()} kg` }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.4)', font: { family: 'DM Mono', size: 9 } } },
        y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#e8ff47', font: { family: 'DM Mono', size: 9 }, callback: v => v.toLocaleString() + ' kg' } }
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
          backgroundColor: '#111',
          borderColor: '#2a2a2a',
          borderWidth: 1,
          titleColor: '#44ff88',
          bodyColor: '#f0f0f0',
          titleFont: { family: 'DM Mono' },
          bodyFont: { family: 'DM Mono' },
          callbacks: { label: ctx => `${ctx.raw} kg` }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: 'rgba(255,255,255,0.4)', font: { family: 'DM Mono', size: 9 } }
        },
        y: {
          min: minBW,
          max: maxBW,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#44ff88', font: { family: 'DM Mono', size: 9 }, callback: v => v + ' kg' }
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
          backgroundColor: '#111', borderColor: '#2a2a2a', borderWidth: 1,
          titleColor: '#e8ff47', bodyColor: '#f0f0f0',
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
        x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.4)', font: { family: 'DM Mono', size: 9 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#e8ff47', font: { family: 'DM Mono', size: 9 }, callback: v => v + ' kg' } }
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
          backgroundColor: '#111', borderColor: '#2a2a2a', borderWidth: 1,
          titleColor: '#e8ff47', bodyColor: '#f0f0f0',
          titleFont: { family: 'DM Mono' }, bodyFont: { family: 'DM Mono' },
          callbacks: { label: ctx => `${Math.round(ctx.raw).toLocaleString()} kg` }
        }
      },
      scales: {
        r: {
          angleLines: { color: 'rgba(255,255,255,0.1)' },
          grid: { color: 'rgba(255,255,255,0.1)' },
          pointLabels: { color: '#888', font: { family: 'DM Mono' } },
          ticks: { display: false }
        }
      }
    }
  });
}

function renderProgress() {
  renderPRs();
  renderChart();
  renderBodyweightChart();
  populateStrengthPicker();
  renderStrengthChart();
}