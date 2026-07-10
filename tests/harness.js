// tests/harness.js
//
// CtrlSet's JS is written as plain classic <script> files (no bundler, no
// modules) that share one global scope in the browser. This harness runs
// the actual source files in a Node `vm` context with minimal DOM/browser
// stubs, so pure logic (no real DOM manipulation) can be unit tested
// without pulling in a browser or a headless-DOM dependency.
//
// Only load files here whose top-level (non-function-body) code doesn't
// touch the DOM — everything in js/*.js used below is safe because DOM
// access only happens inside function bodies, which never execute until
// something calls them.

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function noop() {}

function createSandbox() {
  const sandbox = {
    // Mutable app state the loaded files reference as free variables.
    // Tests overwrite these directly (e.g. ctx.workouts = [...]).
    workouts: [],
    restDays: [],
    exercisesDB: [],
    currentUser: null,

    // Minimal stubs so loading/calling code that *touches* these doesn't
    // throw, even though none of the tested functions actually need them.
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop } }),
      addEventListener: noop
    },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    toast: noop,
    triggerConfetti: noop,
    console
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function loadFile(sandbox, relativePath) {
  const filePath = path.join(__dirname, '..', relativePath);
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, sandbox, { filename: relativePath });
}

// Returns a fresh sandbox with utils.js, achievements.js, and charts.js
// loaded — enough for testing calculate1RM, isStagnant,
// computeBestStreakFromDates, computeAchievements, getMonthBounds, and
// computePeriodStats. Fresh per call so tests don't leak state into
// each other via ACHIEVEMENT_DEFS or module-level caches.
function createTestContext() {
  const sandbox = createSandbox();
  loadFile(sandbox, 'js/utils.js');
  loadFile(sandbox, 'js/achievements.js');
  loadFile(sandbox, 'js/charts.js');
  return sandbox;
}

module.exports = { createTestContext };
