'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const FILE_NAME = 'workout-tracker-data.json';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

// ─── Default plan ─────────────────────────────────────────────────────────────
const DEFAULT_DATA = {
  version: 1,
  plan: {
    days: [
      {
        id: 'day1',
        name: 'Day 1 — Push',
        subtitle: 'chest, shoulders, triceps',
        exercises: [
          { name: 'Barbell bench press',            prescription: '4×6-8'  },
          { name: 'Incline dumbbell press',          prescription: '3×8-10' },
          { name: 'Cable fly',                       prescription: '3×12-15'},
          { name: 'Seated dumbbell shoulder press',  prescription: '3×8-10' },
          { name: 'Lateral raises',                  prescription: '4×15-20'},
          { name: 'Tricep rope pushdown',            prescription: '3×10-12'},
          { name: 'Overhead tricep extension',       prescription: '3×10-12'},
        ],
      },
      {
        id: 'day2',
        name: 'Day 2 — Pull',
        subtitle: 'back, biceps',
        exercises: [
          { name: 'Pull-ups / lat pulldown', prescription: '4×6-8'  },
          { name: 'Barbell row',             prescription: '4×8-10' },
          { name: 'Cable seated row',        prescription: '3×10-12'},
          { name: 'Face pulls',              prescription: '3×15-20'},
          { name: 'Barbell curl',            prescription: '3×10-12'},
          { name: 'Hammer curl',             prescription: '3×10-12'},
        ],
      },
      {
        id: 'day3',
        name: 'Day 3 — Legs',
        subtitle: 'quads, hamstrings, glutes, calves',
        exercises: [
          { name: 'Barbell squat',       prescription: '4×6-8'  },
          { name: 'Romanian deadlift',   prescription: '3×8-10' },
          { name: 'Leg press',           prescription: '3×10-12'},
          { name: 'Leg curl',            prescription: '3×10-12'},
          { name: 'Leg extension',       prescription: '3×12-15'},
          { name: 'Standing calf raise', prescription: '4×15-20'},
        ],
      },
      {
        id: 'day4',
        name: 'Day 4 — Full body',
        subtitle: '',
        exercises: [
          { name: 'Deadlift',                prescription: '4×5-6'        },
          { name: 'Incline dumbbell press',   prescription: '3×10-12'      },
          { name: 'Cable row',                prescription: '3×10-12'      },
          { name: 'Bulgarian split squat',    prescription: '3×10 each leg'},
          { name: 'Lateral raises',           prescription: '3×15-20'      },
          { name: 'Weak point exercise',      prescription: '3×12'         },
        ],
      },
    ],
  },
  sessions: [],
};

// ─── State ────────────────────────────────────────────────────────────────────
const S = {
  clientId: null,
  accessToken: null,
  tokenExpiry: 0,
  userEmail: null,
  data: null,
  fileId: null,
  activeSession: null,
  activeView: 'today',
  timerInterval: null,
  saveTimeout: null,
  isSaving: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${s % 60}s`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function epley1RM(weight, reps) {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

let toastTimer = null;
function showToast(msg, duration = 2500) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

function setSyncIndicator(state) {
  const el = $('sync-indicator');
  el.className = 'sync-indicator ' + state;
  el.title = { saving: 'Saving…', saved: 'Saved', error: 'Save failed', '': '' }[state] || '';
}

// ─── Screens ──────────────────────────────────────────────────────────────────
function showScreen(name) {
  ['setup', 'auth', 'main'].forEach(s => $(`screen-${s}`).classList.toggle('hidden', s !== name));
}

// ─── Google Auth ──────────────────────────────────────────────────────────────
let tokenClient = null;

function waitForGSI() {
  return new Promise(resolve => {
    if (window.gsiReady) { resolve(); return; }
    window._gsiCallbacks.push(resolve);
  });
}

async function initTokenClient() {
  await waitForGSI();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: S.clientId,
    scope: DRIVE_SCOPE,
    callback: handleTokenResponse,
  });
}

function handleTokenResponse(resp) {
  if (resp.error) {
    showToast('Sign-in failed: ' + resp.error);
    return;
  }
  S.accessToken = resp.access_token;
  S.tokenExpiry = Date.now() + (resp.expires_in - 120) * 1000;
  localStorage.setItem('liftlog_signed_in', '1');
  onAuthenticated();
}

function signIn() {
  if (!tokenClient) { showToast('Auth not ready yet, try again.'); return; }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function silentRefresh() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) { reject(new Error('No token client')); return; }
    const original = tokenClient.callback;
    tokenClient.callback = (resp) => {
      tokenClient.callback = original;
      if (resp.error) { reject(new Error(resp.error)); return; }
      S.accessToken = resp.access_token;
      S.tokenExpiry = Date.now() + (resp.expires_in - 120) * 1000;
      resolve();
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function ensureToken() {
  if (S.accessToken && Date.now() < S.tokenExpiry) return;
  try {
    await silentRefresh();
  } catch {
    showScreen('auth');
    throw new Error('Token expired, please sign in again.');
  }
}

function signOut() {
  if (S.accessToken) {
    google.accounts.oauth2.revoke(S.accessToken, () => {});
  }
  S.accessToken = null;
  S.tokenExpiry = 0;
  S.userEmail = null;
  S.data = null;
  S.fileId = null;
  S.activeSession = null;
  clearInterval(S.timerInterval);
  localStorage.removeItem('liftlog_signed_in');
  showScreen('auth');
  closeUserMenu();
}

// ─── Drive API ────────────────────────────────────────────────────────────────
async function driveGet(path, params = {}) {
  await ensureToken();
  const url = new URL(`${DRIVE_BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${S.accessToken}` },
  });
  if (!r.ok) throw new Error(`Drive GET error ${r.status}`);
  return r.json();
}

async function driveUpload(method, fileId, content, metadata = null) {
  await ensureToken();
  const boundary = 'liftlog_boundary_abc123';
  const parts = [];
  if (metadata) {
    parts.push(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
    );
  }
  parts.push(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`);
  const body = parts.join('');

  const url = metadata
    ? `${UPLOAD_BASE}/files?uploadType=multipart`
    : `${UPLOAD_BASE}/files/${fileId}?uploadType=media`;

  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${S.accessToken}`,
      'Content-Type': metadata ? `multipart/related; boundary=${boundary}` : 'application/json',
    },
    body,
  });
  if (!r.ok) throw new Error(`Drive upload error ${r.status}`);
  return r.json();
}

// ─── Data persistence ─────────────────────────────────────────────────────────
async function loadOrCreateFile() {
  // Try cached fileId first
  const cachedId = localStorage.getItem('liftlog_file_id');
  if (cachedId) {
    try {
      const meta = await driveGet(`files/${cachedId}`, { fields: 'id,name,trashed' });
      if (!meta.trashed) {
        S.fileId = cachedId;
        const content = await driveGet(`files/${cachedId}`, { alt: 'media' });
        return content;
      }
    } catch {
      // file gone, fall through to search
    }
  }

  // Search for the file
  const list = await driveGet('files', {
    q: `name='${FILE_NAME}' and trashed=false`,
    fields: 'files(id,name)',
    spaces: 'drive',
  });

  if (list.files && list.files.length > 0) {
    S.fileId = list.files[0].id;
    localStorage.setItem('liftlog_file_id', S.fileId);
    const content = await driveGet(`files/${S.fileId}`, { alt: 'media' });
    return content;
  }

  // Create new file
  const newFile = await driveUpload('POST', null, JSON.stringify(DEFAULT_DATA), {
    name: FILE_NAME,
    mimeType: 'application/json',
  });
  S.fileId = newFile.id;
  localStorage.setItem('liftlog_file_id', S.fileId);
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function scheduleSave() {
  clearTimeout(S.saveTimeout);
  setSyncIndicator('saving');
  S.saveTimeout = setTimeout(saveNow, 1500);
}

async function saveNow() {
  if (!S.fileId || !S.data) return;
  S.isSaving = true;
  try {
    await driveUpload('PATCH', S.fileId, JSON.stringify(S.data));
    setSyncIndicator('saved');
    setTimeout(() => setSyncIndicator(''), 3000);
  } catch (e) {
    setSyncIndicator('error');
    showToast('Save failed. Will retry.');
    setTimeout(saveNow, 5000);
  }
  S.isSaving = false;
}

// ─── Boot sequence ────────────────────────────────────────────────────────────
async function onAuthenticated() {
  // Fetch user info
  try {
    const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${S.accessToken}` },
    });
    const u = await info.json();
    S.userEmail = u.email || '';
    $('user-email-display').textContent = S.userEmail;
  } catch {}

  showScreen('main');
  setSyncIndicator('saving');

  try {
    const raw = await loadOrCreateFile();
    // Migrate / validate
    if (!raw.plan || !raw.sessions) {
      S.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    } else {
      S.data = raw;
    }
    setSyncIndicator('saved');
    setTimeout(() => setSyncIndicator(''), 2000);
  } catch (e) {
    setSyncIndicator('error');
    showToast('Could not load data from Drive.');
    S.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  renderCurrentView();
  populateBestsSelect();
}

// ─── View routing ─────────────────────────────────────────────────────────────
function showView(name) {
  S.activeView = name;
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${name}`);
    v.classList.toggle('hidden', v.id !== `view-${name}`);
  });
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  renderCurrentView();
}

function renderCurrentView() {
  if (!S.data) return;
  switch (S.activeView) {
    case 'today': renderToday(); break;
    case 'history': renderHistory(); break;
    case 'bests': renderBests(); break;
    case 'plan': renderPlan(); break;
  }
}

// ─── TODAY view ───────────────────────────────────────────────────────────────
function renderToday() {
  if (S.activeSession) {
    $('today-no-session').classList.add('hidden');
    $('today-active-session').classList.remove('hidden');
    renderActiveSession();
  } else {
    $('today-no-session').classList.remove('hidden');
    $('today-active-session').classList.add('hidden');
    renderDayCards();
  }
  $('today-date').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function renderDayCards() {
  const container = $('day-cards');
  const { days } = S.data.plan;
  container.innerHTML = days.map(day => {
    const lastSession = [...S.data.sessions].reverse().find(s => s.dayId === day.id);
    const lastText = lastSession ? `Last: ${formatDate(lastSession.startTime)}` : 'Not yet done';
    return `
      <div class="day-card" data-day-id="${esc(day.id)}">
        <div class="day-card-info">
          <h3>${esc(day.name)}</h3>
          ${day.subtitle ? `<p>${esc(day.subtitle)}</p>` : ''}
          <p class="day-card-last">${lastText}</p>
        </div>
        <div class="day-card-chevron">›</div>
      </div>`;
  }).join('');

  container.querySelectorAll('.day-card').forEach(card => {
    card.addEventListener('click', () => startSession(card.dataset.dayId));
  });
}

function startSession(dayId) {
  const day = S.data.plan.days.find(d => d.id === dayId);
  if (!day) return;

  const exercises = {};
  day.exercises.forEach(ex => {
    const name = typeof ex === 'string' ? ex : ex.name;
    exercises[name] = { sets: [], prescription: typeof ex === 'string' ? '' : (ex.prescription || '') };
  });

  S.activeSession = {
    id: `sess_${Date.now()}`,
    date: today(),
    dayId,
    dayName: day.name,
    startTime: Date.now(),
    exercises,
  };

  startTimer();
  renderToday();
}

function startTimer() {
  clearInterval(S.timerInterval);
  S.timerInterval = setInterval(() => {
    if (!S.activeSession) { clearInterval(S.timerInterval); return; }
    const elapsed = Date.now() - S.activeSession.startTime;
    const m = Math.floor(elapsed / 60000);
    const s = Math.floor((elapsed % 60000) / 1000);
    const el = $('session-timer');
    if (el) el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }, 1000);
}

function renderActiveSession() {
  $('session-day-name').textContent = S.activeSession.dayName;

  const container = $('session-exercises');
  const exercises = Object.entries(S.activeSession.exercises);
  container.innerHTML = exercises.map(([name]) => buildExerciseCard(name)).join('');

  container.querySelectorAll('.add-set-btn').forEach(btn => {
    btn.addEventListener('click', () => addSet(btn.dataset.exercise));
  });
  container.querySelectorAll('.set-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteSet(btn.dataset.exercise, +btn.dataset.idx));
  });
  container.querySelectorAll('.stepper-minus').forEach(btn => {
    btn.addEventListener('click', () => stepInput(btn.dataset.target, -btn.dataset.step));
  });
  container.querySelectorAll('.stepper-plus').forEach(btn => {
    btn.addEventListener('click', () => stepInput(btn.dataset.target, +btn.dataset.step));
  });
}

function buildExerciseCard(name) {
  const exData = S.activeSession.exercises[name];
  const prescription = exData.prescription || '';
  const prevSets = getPrevSets(name, S.activeSession.dayId, S.activeSession.id);
  const prevText = prevSets.length
    ? `Last: ${prevSets.map(s => `${s.weight}×${s.reps}`).slice(0, 3).join(', ')}`
    : 'First time';

  const inputId = `ex-${btoa(name).replace(/[^a-z0-9]/gi, '')}`;

  const setsRows = exData.sets.map((set, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <div class="set-input-wrap">
          <div class="stepper">
            <button class="stepper-minus" data-target="${inputId}-w-${i}" data-step="2.5">−</button>
          </div>
          <input type="number" id="${inputId}-w-${i}" value="${set.weight}" min="0" step="2.5"
            data-exercise="${esc(name)}" data-idx="${i}" data-field="weight"
            class="set-weight-input" inputmode="decimal">
          <div class="stepper">
            <button class="stepper-plus" data-target="${inputId}-w-${i}" data-step="2.5">+</button>
          </div>
        </div>
      </td>
      <td>
        <div class="set-input-wrap">
          <div class="stepper">
            <button class="stepper-minus" data-target="${inputId}-r-${i}" data-step="1">−</button>
          </div>
          <input type="number" id="${inputId}-r-${i}" value="${set.reps}" min="0" step="1"
            data-exercise="${esc(name)}" data-idx="${i}" data-field="reps"
            class="set-reps-input" inputmode="numeric">
          <div class="stepper">
            <button class="stepper-plus" data-target="${inputId}-r-${i}" data-step="1">+</button>
          </div>
        </div>
      </td>
      <td><button class="set-delete-btn" data-exercise="${esc(name)}" data-idx="${i}">✕</button></td>
    </tr>`).join('');

  return `
    <div class="exercise-card">
      <div class="exercise-card-header">
        <div>
          <h4>${esc(name)}${prescription ? ` <span class="prescription-badge">${esc(prescription)}</span>` : ''}</h4>
          <div class="exercise-prev">${esc(prevText)}</div>
        </div>
      </div>
      <div class="exercise-card-body">
        <table class="sets-table">
          <thead><tr><th>Set</th><th>kg</th><th>Reps</th><th></th></tr></thead>
          <tbody>${setsRows}</tbody>
        </table>
        <div class="add-set-row">
          <button class="btn btn-outline btn-sm btn-block add-set-btn" data-exercise="${esc(name)}">+ Add Set</button>
        </div>
      </div>
    </div>`;
}

function getPrevSets(exerciseName, dayId, currentSessionId) {
  const prev = [...S.data.sessions]
    .reverse()
    .find(s => s.dayId === dayId && s.id !== currentSessionId && s.exercises[exerciseName]);
  return prev ? prev.exercises[exerciseName].sets : [];
}

function addSet(exerciseName) {
  const exData = S.activeSession.exercises[exerciseName];
  const lastSet = exData.sets[exData.sets.length - 1];
  const weight = lastSet ? lastSet.weight : 20;
  const reps = lastSet ? lastSet.reps : 8;
  exData.sets.push({ weight, reps });
  renderActiveSession();
}

function deleteSet(exerciseName, idx) {
  S.activeSession.exercises[exerciseName].sets.splice(idx, 1);
  renderActiveSession();
}

function stepInput(targetId, step) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const val = parseFloat(el.value) || 0;
  el.value = Math.max(0, val + parseFloat(step));
  el.dispatchEvent(new Event('change'));
}

function syncSetFromInput(input) {
  const { exercise, idx, field } = input.dataset;
  const val = parseFloat(input.value) || 0;
  if (S.activeSession && S.activeSession.exercises[exercise]) {
    const set = S.activeSession.exercises[exercise].sets[idx];
    if (set) set[field] = val;
  }
}

function finishSession() {
  if (!S.activeSession) return;
  // Flush any pending input values
  document.querySelectorAll('.set-weight-input, .set-reps-input').forEach(syncSetFromInput);

  S.activeSession.endTime = Date.now();
  S.data.sessions.push(JSON.parse(JSON.stringify(S.activeSession)));
  S.activeSession = null;
  clearInterval(S.timerInterval);
  scheduleSave();
  populateBestsSelect();
  showToast('Workout saved!');
  renderToday();
}

// ─── HISTORY view ─────────────────────────────────────────────────────────────
function renderHistory() {
  const container = $('history-list');
  const sessions = [...S.data.sessions].reverse();

  if (!sessions.length) {
    container.innerHTML = '<p class="empty-state">No workouts logged yet.</p>';
    return;
  }

  container.innerHTML = sessions.map(s => {
    const exCount = Object.keys(s.exercises).length;
    const totalSets = Object.values(s.exercises).reduce((n, ex) => n + ex.sets.length, 0);
    const duration = s.endTime ? formatDuration(s.endTime - s.startTime) : '—';
    return `
      <div class="history-item" data-session-id="${esc(s.id)}">
        <div class="history-item-header">
          <h3>${esc(s.dayName)}</h3>
          <span class="history-item-date">${formatDate(s.startTime)}</span>
        </div>
        <div class="history-item-stats">
          <span class="history-stat"><strong>${exCount}</strong> exercises</span>
          <span class="history-stat"><strong>${totalSets}</strong> sets</span>
          <span class="history-stat"><strong>${duration}</strong></span>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => openSessionModal(el.dataset.sessionId));
  });
}

function openSessionModal(sessionId) {
  const session = S.data.sessions.find(s => s.id === sessionId);
  if (!session) return;

  $('modal-title').textContent = session.dayName;
  const body = $('modal-body');

  body.innerHTML = `<div class="modal-session-day">${formatDate(session.startTime)}${session.endTime ? ' · ' + formatDuration(session.endTime - session.startTime) : ''}</div>` +
    Object.entries(session.exercises).map(([name, ex]) => {
      if (!ex.sets.length) return '';
      const setRows = ex.sets.map((s, i) =>
        `<div class="modal-set"><span class="set-num">Set ${i + 1}</span><span class="set-weight">${s.weight} kg × ${s.reps}</span></div>`
      ).join('');
      return `<div class="modal-exercise"><h4>${esc(name)}</h4><div class="modal-sets">${setRows}</div></div>`;
    }).join('');

  $('session-modal').classList.remove('hidden');
}

// ─── BESTS / PROGRESS view ────────────────────────────────────────────────────
function getAllExercises() {
  const names = new Set();
  S.data.plan.days.forEach(d => d.exercises.forEach(e => names.add(typeof e === 'string' ? e : e.name)));
  S.data.sessions.forEach(s => Object.keys(s.exercises).forEach(e => names.add(e)));
  return [...names].sort();
}

function populateBestsSelect() {
  if (!S.data) return;
  const sel = $('bests-exercise-select');
  const prev = sel.value;
  const exercises = getAllExercises();
  sel.innerHTML = exercises.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join('');
  if (prev && exercises.includes(prev)) sel.value = prev;
  if (S.activeView === 'bests') renderBests();
}

function getBestsForExercise(name) {
  let bestWeight = 0, bestReps = 0, best1RM = 0;
  const history = [];

  S.data.sessions.forEach(session => {
    const ex = session.exercises[name];
    if (!ex || !ex.sets.length) return;
    let session1RM = 0;
    ex.sets.forEach(set => {
      if (!set.weight || !set.reps) return;
      const rm = epley1RM(set.weight, set.reps);
      if (set.weight > bestWeight) { bestWeight = set.weight; bestReps = set.reps; }
      if (rm > best1RM) best1RM = rm;
      if (rm > session1RM) session1RM = rm;
    });
    if (session1RM > 0) {
      history.push({ date: session.startTime, value: session1RM });
    }
  });

  return { bestWeight, bestReps, best1RM, history };
}

function renderBests() {
  const sel = $('bests-exercise-select');
  const name = sel.value;
  if (!name) return;

  const { bestWeight, bestReps, best1RM, history } = getBestsForExercise(name);
  const selectedCard = $('bests-selected-card');

  if (bestWeight === 0) {
    selectedCard.innerHTML = `<h3>${esc(name)}</h3><p style="color:var(--muted);font-size:.85rem">No data yet.</p>`;
  } else {
    selectedCard.innerHTML = `
      <h3>${esc(name)}</h3>
      <div class="bests-stats-row">
        <div class="bests-stat-box">
          <div class="label">Best weight</div>
          <div class="value">${bestWeight}</div>
          <div class="unit">kg × ${bestReps} reps</div>
        </div>
        <div class="bests-stat-box">
          <div class="label">Est. 1RM</div>
          <div class="value">${best1RM.toFixed(1)}</div>
          <div class="unit">kg</div>
        </div>
        <div class="bests-stat-box">
          <div class="label">Sessions</div>
          <div class="value">${history.length}</div>
          <div class="unit">logged</div>
        </div>
      </div>`;
  }

  renderChart($('progress-chart'), history.map(h => ({
    y: h.value,
    label: new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  })));

  // All bests grid
  const grid = $('bests-grid');
  const exercises = getAllExercises();
  grid.innerHTML = exercises.map(ex => {
    const b = getBestsForExercise(ex);
    if (b.bestWeight === 0) return `
      <div class="best-card">
        <div class="exercise-name">${esc(ex)}</div>
        <div class="best-weight" style="color:var(--muted)">—</div>
      </div>`;
    return `
      <div class="best-card">
        <div class="exercise-name">${esc(ex)}</div>
        <div class="best-weight">${b.bestWeight} kg</div>
        <div class="best-reps">× ${b.bestReps} reps</div>
        <div class="best-1rm">~${b.best1RM.toFixed(1)} kg 1RM</div>
      </div>`;
  }).join('');
}

function renderChart(container, points) {
  if (points.length < 2) {
    container.innerHTML = '<p class="empty-state" style="padding:24px">Log 2+ sessions to see progress.</p>';
    return;
  }

  const W = Math.max(container.clientWidth || 300, 280);
  const H = 160;
  const PAD = { t: 20, r: 16, b: 32, l: 52 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  const vals = points.map(p => p.y);
  const minY = Math.floor(Math.min(...vals) * 0.95);
  const maxY = Math.ceil(Math.max(...vals) * 1.05);
  const rangeY = maxY - minY || 1;

  const sx = (i) => PAD.l + (i / (points.length - 1)) * iW;
  const sy = (v) => PAD.t + iH - ((v - minY) / rangeY) * iH;

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${sx(points.length - 1).toFixed(1)} ${PAD.t + iH} L ${PAD.l} ${PAD.t + iH} Z`;

  const gridVals = [minY, Math.round((minY + maxY) / 2), maxY];
  const gridLines = gridVals.map(v => `
    <line x1="${PAD.l}" y1="${sy(v).toFixed(1)}" x2="${PAD.l + iW}" y2="${sy(v).toFixed(1)}" stroke="#2a2a42" stroke-width="1"/>
    <text x="${PAD.l - 6}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="10">${v}</text>
  `).join('');

  const step = Math.ceil(points.length / 5);
  const labels = points.map((p, i) => i % step === 0 || i === points.length - 1 ? `
    <text x="${sx(i).toFixed(1)}" y="${H - 4}" text-anchor="middle" fill="#64748b" font-size="9">${esc(p.label)}</text>
  ` : '').join('');

  const dots = points.map((p, i) => `
    <circle cx="${sx(i).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${i === points.length - 1 ? 5 : 3}" fill="#6c63ff"/>
  `).join('');

  const lastPt = points[points.length - 1];
  const lastLabel = `<text x="${sx(points.length - 1).toFixed(1)}" y="${(sy(lastPt.y) - 10).toFixed(1)}" text-anchor="middle" fill="#e2e8f0" font-size="11" font-weight="600">${lastPt.y.toFixed(1)}</text>`;

  container.innerHTML = `
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6c63ff" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#6c63ff" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <path d="${areaD}" fill="url(#chartGrad)"/>
      <path d="${pathD}" fill="none" stroke="#6c63ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      ${lastLabel}
      ${labels}
    </svg>`;
}

// ─── PLAN view ────────────────────────────────────────────────────────────────
function renderPlan() {
  const container = $('plan-days');
  container.innerHTML = S.data.plan.days.map((day, di) => buildDayCard(day, di)).join('');

  container.querySelectorAll('.plan-day-name-input').forEach(input => {
    input.addEventListener('change', () => {
      const di = +input.closest('[data-day-index]').dataset.dayIndex;
      S.data.plan.days[di].name = input.value.trim() || S.data.plan.days[di].name;
      scheduleSave();
    });
  });

  container.querySelectorAll('.plan-day-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const di = +btn.dataset.dayIndex;
      if (!confirm(`Delete "${S.data.plan.days[di].name}"?`)) return;
      S.data.plan.days.splice(di, 1);
      scheduleSave();
      renderPlan();
    });
  });

  // Inline edit: exercise name or prescription
  container.querySelectorAll('.plan-exercise-name-input, .plan-exercise-pres-input').forEach(input => {
    input.addEventListener('change', () => {
      const di = +input.dataset.dayIndex;
      const ei = +input.dataset.exIndex;
      const field = input.dataset.field;
      const ex = S.data.plan.days[di].exercises[ei];
      if (typeof ex === 'string') {
        S.data.plan.days[di].exercises[ei] = { name: ex, prescription: '' };
      }
      S.data.plan.days[di].exercises[ei][field] = input.value.trim();
      scheduleSave();
    });
  });

  container.querySelectorAll('.plan-exercise-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const di = +btn.dataset.dayIndex;
      const ei = +btn.dataset.exIndex;
      S.data.plan.days[di].exercises.splice(ei, 1);
      scheduleSave();
      renderPlan();
    });
  });

  container.querySelectorAll('.ex-move-up').forEach(btn => {
    btn.addEventListener('click', () => {
      const di = +btn.dataset.dayIndex;
      const ei = +btn.dataset.exIndex;
      if (ei === 0) return;
      const exs = S.data.plan.days[di].exercises;
      [exs[ei - 1], exs[ei]] = [exs[ei], exs[ei - 1]];
      scheduleSave();
      renderPlan();
    });
  });

  container.querySelectorAll('.ex-move-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const di = +btn.dataset.dayIndex;
      const ei = +btn.dataset.exIndex;
      const exs = S.data.plan.days[di].exercises;
      if (ei >= exs.length - 1) return;
      [exs[ei], exs[ei + 1]] = [exs[ei + 1], exs[ei]];
      scheduleSave();
      renderPlan();
    });
  });

  container.querySelectorAll('.add-exercise-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const di = +btn.dataset.dayIndex;
      const nameInput = container.querySelector(`.add-exercise-input[data-day-index="${di}"]`);
      const presInput = container.querySelector(`.add-exercise-pres-input[data-day-index="${di}"]`);
      const name = nameInput.value.trim();
      if (!name) return;
      S.data.plan.days[di].exercises.push({ name, prescription: presInput.value.trim() });
      nameInput.value = '';
      presInput.value = '';
      scheduleSave();
      renderPlan();
    });
  });

  container.querySelectorAll('.add-exercise-input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const di = +input.dataset.dayIndex;
        const btn = container.querySelector(`.add-exercise-btn[data-day-index="${di}"]`);
        btn && btn.click();
      }
    });
  });
}

function buildDayCard(day, di) {
  const exItems = day.exercises.map((ex, ei) => {
    const exName = typeof ex === 'string' ? ex : ex.name;
    const exPres = typeof ex === 'string' ? '' : (ex.prescription || '');
    return `
    <li class="plan-exercise-item">
      <div class="plan-exercise-fields">
        <input type="text" class="plan-exercise-name-input" value="${esc(exName)}"
          placeholder="Exercise name" data-day-index="${di}" data-ex-index="${ei}" data-field="name">
        <input type="text" class="plan-exercise-pres-input" value="${esc(exPres)}"
          placeholder="Sets×reps" data-day-index="${di}" data-ex-index="${ei}" data-field="prescription">
      </div>
      <div class="plan-exercise-move">
        <button class="ex-move-up" data-day-index="${di}" data-ex-index="${ei}">▲</button>
        <button class="ex-move-down" data-day-index="${di}" data-ex-index="${ei}">▼</button>
      </div>
      <button class="plan-exercise-delete" data-day-index="${di}" data-ex-index="${ei}">✕</button>
    </li>`;
  }).join('');

  return `
    <div class="plan-day-card" data-day-index="${di}">
      <div class="plan-day-header">
        <input type="text" class="plan-day-name-input" value="${esc(day.name)}" placeholder="Day name">
        <button class="plan-day-delete-btn" data-day-index="${di}" title="Delete day">🗑</button>
      </div>
      <ul class="plan-exercises">${exItems}</ul>
      <div class="plan-add-exercise">
        <input type="text" class="add-exercise-input" data-day-index="${di}" placeholder="Exercise name…">
        <input type="text" class="add-exercise-pres-input" data-day-index="${di}" placeholder="Sets×reps">
        <button class="btn btn-outline btn-sm add-exercise-btn" data-day-index="${di}">Add</button>
      </div>
    </div>`;
}

// ─── User menu ────────────────────────────────────────────────────────────────
function openUserMenu() {
  $('user-menu').classList.remove('hidden');
  $('user-menu-overlay').classList.remove('hidden');
}

function closeUserMenu() {
  $('user-menu').classList.add('hidden');
  $('user-menu-overlay').classList.add('hidden');
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
function wireEvents() {
  // Setup screen
  $('save-setup-btn').addEventListener('click', () => {
    const val = $('client-id-input').value.trim();
    if (!val || !val.includes('.apps.googleusercontent.com')) {
      showToast('Please enter a valid Client ID');
      return;
    }
    localStorage.setItem('liftlog_client_id', val);
    S.clientId = val;
    initTokenClient();
    showScreen('auth');
  });

  // Auth screen
  $('sign-in-btn').addEventListener('click', signIn);
  $('change-client-id-btn').addEventListener('click', () => {
    showScreen('setup');
    $('client-id-input').value = S.clientId || '';
  });

  // User menu
  $('user-menu-btn').addEventListener('click', openUserMenu);
  $('user-menu-overlay').addEventListener('click', closeUserMenu);
  $('sign-out-btn').addEventListener('click', signOut);
  $('change-client-btn').addEventListener('click', () => {
    closeUserMenu();
    showScreen('setup');
    $('client-id-input').value = S.clientId || '';
  });

  // Nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Today
  $('finish-workout-btn').addEventListener('click', finishSession);

  // Live input sync from exercise sets
  document.getElementById('view-today').addEventListener('change', e => {
    if (e.target.classList.contains('set-weight-input') || e.target.classList.contains('set-reps-input')) {
      syncSetFromInput(e.target);
    }
  });

  // Bests select
  $('bests-exercise-select').addEventListener('change', () => { if (S.data) renderBests(); });

  // Add day
  $('add-day-btn').addEventListener('click', () => {
    const id = `day_${Date.now()}`;
    S.data.plan.days.push({ id, name: 'New Day', subtitle: '', exercises: [] });
    scheduleSave();
    renderPlan();
  });

  // Modal close
  $('modal-close-btn').addEventListener('click', () => $('session-modal').classList.add('hidden'));
  $('modal-backdrop').addEventListener('click', () => $('session-modal').classList.add('hidden'));
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function tryAutoSignIn() {
  return new Promise(resolve => {
    const original = tokenClient.callback;
    tokenClient.callback = (resp) => {
      tokenClient.callback = original;
      if (resp.error) { resolve(false); return; }
      S.accessToken = resp.access_token;
      S.tokenExpiry = Date.now() + (resp.expires_in - 120) * 1000;
      resolve(true);
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function init() {
  wireEvents();

  const storedId = localStorage.getItem('liftlog_client_id');
  if (!storedId) {
    showScreen('setup');
    return;
  }

  S.clientId = storedId;
  await initTokenClient();

  const wasSignedIn = localStorage.getItem('liftlog_signed_in');
  if (wasSignedIn) {
    showScreen('auth');
    $('sign-in-btn').textContent = 'Signing in…';
    $('sign-in-btn').disabled = true;
    const ok = await tryAutoSignIn();
    if (ok) {
      localStorage.setItem('liftlog_signed_in', '1');
      onAuthenticated();
      return;
    }
    $('sign-in-btn').textContent = 'Sign in with Google';
    $('sign-in-btn').disabled = false;
  }

  showScreen('auth');
}

document.addEventListener('DOMContentLoaded', init);

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
