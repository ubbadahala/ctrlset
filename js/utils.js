function getLocalDateString(dateObj = new Date()) {
  const tzOffset = dateObj.getTimezoneOffset() * 60000;
  return new Date(dateObj.getTime() - tzOffset).toISOString().split('T')[0];
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function calculate1RM(weight, reps) {
  if (reps <= 1) return weight;
  // Epley Formula
  return weight * (1 + (reps / 30));
}

// bestSets: array of {weight, reps} — one entry per session, newest-first —
// representing the best set logged for a given exercise in that session.
function isStagnant(bestSets) {
  return bestSets.length >= 3 &&
    bestSets[0].weight === bestSets[1].weight &&
    bestSets[1].weight === bestSets[2].weight &&
    bestSets[0].reps <= bestSets[1].reps;
}