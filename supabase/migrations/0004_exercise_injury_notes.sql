-- Adds an optional injury/caution note per exercise, shown as a gentle
-- warning whenever that exercise is selected while logging a workout.
-- Referenced by: js/data.js (setExerciseInjuryNote, saveExercises,
-- addCustomExercise), js/workout.js (showInjuryWarning), js/state.js

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS injury_note text DEFAULT NULL;
