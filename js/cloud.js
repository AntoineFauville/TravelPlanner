// Sign-in and the shared plan, kept in Firebase. Someone not signed in only sees a "404" page.
//
// Firestore holds:
//   users/{uid}      -> { plan }               which plan this person uses
//   plans/{id}       -> { members, invited, s } members[0] is person 1 (Belgian passport), members[1] person 2
//   invites/{email}  -> { plan, by }           lets that person join the plan once
// Every value inside "s" is stored as JSON text; ratings, notes and packing lists are one field per place or trip,
// so the two of you can rate at the same time without overwriting each other.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, arrayUnion, deleteField, FieldPath, serverTimestamp, terminate, clearIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { state, plain, replaceState, onSave, forget } from './store.js';
import { $, esc } from './util.js';

const app = initializeApp({
  apiKey: 'AIzaSyBMNwchI11LYr-AIyUcUrS6qIdKopVr0gM',
  authDomain: 'travelplanner-847e5.firebaseapp.com',
  projectId: 'travelplanner-847e5',
  storageBucket: 'travelplanner-847e5.firebasestorage.app',
  messagingSenderId: '961277866600',
  appId: '1:961277866600:web:d5ce07a94f157acc4a81dd',
});
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

let step = '';               // what was being done when something failed
let user = null, planRef = null, plan = { members: [], invited: [] }, base = {}, timer = 0, started = false;

// ---------- turning the state into Firestore fields and back
const DEEP = new Set(['ratings', 'places', 'packed']);         // one field per entry
const text = v => JSON.stringify(v);
function encode(s) {
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined) continue;
    out[k] = DEEP.has(k) && v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([i, x]) => [i, text(x)])) : text(v);
  }
  return out;
}
function decode(s) {
  const out = {};
  for (const [k, v] of Object.entries(s || {})) {
    try { out[k] = typeof v === 'string' ? JSON.parse(v) : Object.fromEntries(Object.entries(v).map(([i, x]) => [i, JSON.parse(x)])); } catch { /* skip a broken field */ }
  }
  return out;
}
// what changed between two states: [[path], new value or undefined for gone]
function diff(a, b) {
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k];
    if (DEEP.has(k) && x && y && typeof x === 'object' && typeof y === 'object') {
      for (const i of new Set([...Object.keys(x), ...Object.keys(y)])) if (text(x[i]) !== text(y[i])) out.push([[k, i], y[i]]);
    } else if (text(x) !== text(y)) out.push([[k], y]);
  }
  return out;
}
function apply(s, changes) {
  for (const [[k, i], v] of changes) {
    if (i === undefined) { if (v === undefined) delete s[k]; else s[k] = v; } else { s[k] = s[k] || {}; if (v === undefined) delete s[k][i]; else s[k][i] = v; }
  }
  return s;
}
const fieldValue = ([k, i], v) => (v === undefined ? deleteField() : i === undefined && DEEP.has(k) ? encode({ [k]: v })[k] : text(v));

// ---------- sending your changes, a moment after the last one
function later() { clearTimeout(timer); timer = setTimeout(flush, 700); }
async function flush() {
  clearTimeout(timer); timer = 0;
  if (!planRef) return;
  const now = plain(), changes = diff(base, now);
  base = now;
  if (!changes.length) return;
  const args = changes.flatMap(([p, v]) => [new FieldPath('s', ...p), fieldValue(p, v)]);
  try { await updateDoc(planRef, ...args); } catch (e) { console.error('Saving online failed', e); }
}
addEventListener('pagehide', () => { if (timer) flush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && timer) flush(); });

// ---------- finding your plan
async function findPlan() {
  const email = (user.email || '').toLowerCase(), uid = user.uid;
  // invited by the other person: join their plan (what this browser had is replaced by the shared plan)
  try {
    const inv = await getDoc(doc(db, 'invites', email));
    if (inv.exists()) {
      const id = inv.data().plan;
      await updateDoc(doc(db, 'plans', id), { members: arrayUnion(uid) });
      await setDoc(doc(db, 'users', uid), { plan: id });
      await deleteDoc(doc(db, 'invites', email)).catch(() => {});
      return id;
    }
  } catch (e) { console.warn('No invitation read', e); }
  step = 'reading your account';
  const me = await getDoc(doc(db, 'users', uid));
  if (me.exists()) {
    const id = me.data().plan;
    try { await getDoc(doc(db, 'plans', id)); return id; } catch { /* plan gone or not ours: start a new one */ }
  }
  // the very first sign-in: what this browser has becomes the shared plan
  const ref = doc(collection(db, 'plans'));
  step = 'creating your plan';
  await setDoc(ref, { members: [uid], invited: [], created: serverTimestamp(), s: encode(plain()) });
  step = 'linking the plan to your account';
  await setDoc(doc(db, 'users', uid), { plan: ref.id });
  return ref.id;
}

function listen(id) {
  step = 'opening your plan';
  planRef = doc(db, 'plans', id);
  return new Promise((ok, fail) => {
    let first = true;
    onSnapshot(planRef, snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      plan = { members: d.members || [], invited: d.invited || [] };
      const remote = decode(d.s);
      if (first) {
        first = false;
        base = remote;
        const me = plan.members.indexOf(user.uid);
        if (me >= 0 && me < 2) state.who = me;
        replaceState(remote);
        return ok();
      }
      // your own changes not sent yet stay on top of what came in
      const mine = timer ? diff(base, plain()) : [];
      base = remote;
      if (diff(remote, plain()).length || mine.length) replaceState(mine.length ? apply(JSON.parse(JSON.stringify(remote)), mine) : remote);
    }, e => { console.error(e); if (first) fail(e); });
  });
}

// ---------- the page for anyone who is not signed in
const ERR = {
  'auth/invalid-credential': 'Wrong email or password.', 'auth/wrong-password': 'Wrong email or password.', 'auth/user-not-found': 'Wrong email or password.',
  'auth/email-already-in-use': 'There is already an account with this email. Sign in instead.', 'auth/weak-password': 'The password needs at least 6 characters.',
  'auth/invalid-email': 'This email address does not look right.', 'auth/popup-closed-by-user': '', 'auth/cancelled-popup-request': '',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes.', 'auth/network-request-failed': 'No internet connection.',
};
const say = (m, ok = false) => { const el = $('#gate .gmsg'); if (el) { el.textContent = m; el.classList.toggle('ok', ok); } };
const failed = e => say(ERR[e.code] ?? `That did not work (${e.code || e.message}).`);

function gate(kind = '404') {
  document.body.classList.add('locked');
  const g = $('#gate');
  g.hidden = false;
  if (kind === '404') {
    g.innerHTML = `<div class="g404"><h1>404</h1><p>This page could not be found.</p><button class="glink" data-g="open">Sign in</button></div>`;
  } else if (kind === 'signin') {
    g.innerHTML = `<form class="gbox" novalidate>
      <h2>Sign in</h2>
      <button type="button" class="btn main" data-g="google">Continue with Google</button>
      <p class="gor">or with email</p>
      <label class="f">Email<input name="email" type="email" autocomplete="email" required></label>
      <label class="f">Password<input name="pw" type="password" autocomplete="current-password" minlength="6" required></label>
      <div class="row"><button class="btn" data-g="in">Sign in</button><button type="button" class="btn" data-g="new">Create account</button></div>
      <button type="button" class="glink" data-g="reset">Forgot your password?</button>
      <p class="gmsg" role="status"></p></form>`;
  } else if (kind === 'verify') {
    g.innerHTML = `<div class="gbox"><h2>Check your email</h2>
      <p>We sent a link to <b>${esc(user.email)}</b>. Open it, then come back here.</p>
      <div class="row"><button class="btn main" data-g="checked">I clicked the link</button><button class="btn" data-g="resend">Send it again</button></div>
      <button class="glink" data-g="out">Use another account</button><p class="gmsg" role="status"></p></div>`;
  } else if (kind === 'wait') {
    g.innerHTML = '<div class="g404"><p class="soft">Loading your plan…</p></div>';
  }
}

function wireGate() {
  const g = $('#gate'), form = () => $('form', g);
  const creds = () => [form().email.value.trim(), form().pw.value];
  g.addEventListener('submit', e => { e.preventDefault(); const [m, p] = creds(); signInWithEmailAndPassword(auth, m, p).catch(failed); });
  g.addEventListener('click', async e => {
    const a = e.target.closest('[data-g]')?.dataset.g;
    if (!a) return;
    if (a === 'open') gate('signin');
    if (a === 'google') signInWithPopup(auth, new GoogleAuthProvider()).catch(failed);
    if (a === 'new') {
      const [m, p] = creds();
      try { const c = await createUserWithEmailAndPassword(auth, m, p); await sendEmailVerification(c.user); } catch (err) { failed(err); }
    }
    if (a === 'reset') {
      const [m] = creds();
      if (!m) return say('Type your email first.');
      sendPasswordResetEmail(auth, m).then(() => say('We sent you a link to choose a new password.', true)).catch(failed);
    }
    if (a === 'resend') sendEmailVerification(user).then(() => say('Sent again.', true)).catch(failed);
    if (a === 'checked') { await user.reload(); if (user.emailVerified) { await user.getIdToken(true); enter(); } else say('Not confirmed yet. Open the link in the email first.'); }
    if (a === 'out') signOut(auth);
  });
}

let resolveStart;
async function enter() {
  gate('wait');
  try {
    await listen(await findPlan());
  } catch (e) {
    console.error(e);
    $('#gate').innerHTML = `<div class="g404"><p>Your plan could not be opened while ${esc(step)}.</p>
      <p class="soft"><code>${esc(e.code || '')} ${esc(e.message || String(e))}</code></p>
      <p class="soft">${e.code === 'permission-denied' ? 'Firebase refused: are the rules from firestore.rules published?' : e.code === 'unavailable' ? 'Firebase cannot be reached: check the internet connection.' : ''}</p>
      <button class="glink" data-g="out">Sign out</button></div>`;
    return;
  }
  onSave(later);
  later();                    // fields this version added to an older plan go online too
  document.body.classList.remove('locked');
  $('#gate').hidden = true;
  $('#gate').innerHTML = '';
  started = true;
  resolveStart();
}

// resolves once someone is signed in and the plan is loaded; until then the 404 page shows
export function openCloud() {
  wireGate();
  return new Promise(ok => {
    resolveStart = ok;
    onAuthStateChanged(auth, u => {
      if (!u) {
        if (started) { forget(); location.reload(); return; }        // signed out: nothing stays on this computer
        user = null;
        return gate('404');
      }
      user = u;
      if (!started) {
        if (!u.emailVerified) return gate('verify');
        enter();
      }
    });
  });
}

// ---------- for Settings
export const account = () => ({ email: user?.email || '', people: plan.members.length, invited: plan.invited });
export async function invite(email) {
  const m = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) throw new Error('This email address does not look right.');
  if (m === (user.email || '').toLowerCase()) throw new Error('That is your own address.');
  await setDoc(doc(db, 'invites', m), { plan: planRef.id, by: user.email, at: serverTimestamp() });
  await updateDoc(planRef, { invited: arrayUnion(m) });
}
// sign out and leave nothing of the plan on this computer
export async function leave() {
  if (timer) await flush();
  forget();
  try { await terminate(db); await clearIndexedDbPersistence(db); } catch (e) { console.warn(e); }
  await signOut(auth);
}
