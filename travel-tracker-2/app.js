/* ---------------------------------------------------------
   Expedition — A Travel Atlas
   Now with Google sign-in + cloud sync (Firebase Auth + Firestore).

   Storage model:
   - Signed OUT  → everything saves to localStorage (same as before)
   - Signed IN   → everything saves to Firestore at users/{uid},
                   debounced; localStorage is left untouched so a
                   shared computer never mixes two people's data.
   - First sign-in with no cloud data → your existing localStorage
     data is migrated up to the cloud automatically.
   --------------------------------------------------------- */

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';

(() => {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const SOURCES = {
    states:    'https://cdn.jsdelivr.net/gh/PublicaMundi/MappingAPI@master/data/geojson/us-states.json',
    // ~250 KB — fast to load, ~177 countries, property: `name`
    countries: 'https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json'
  };

  const STORAGE_KEY = 'expedition.v1';
  const CACHE_KEY   = 'expedition.cache.v2'; // v1 used a different country source

  const STATE_EXCLUDE = new Set(['District of Columbia', 'Puerto Rico']);

  // Manual display positions for parks that don't fit on the lower-48 map
  // (territories — placed as small insets near the bottom)
  const PARK_DISPLAY_OVERRIDES = {
    'american-samoa': [22.0, -94.0],
    'virgin-islands': [23.5, -84.5]
  };

  // 63 US National Parks
  const PARKS = [
    { id: 'acadia',                 name: 'Acadia',                          state: 'Maine',                 lat: 44.35,  lng: -68.21 },
    { id: 'american-samoa',         name: 'American Samoa',                  state: 'American Samoa',        lat: -14.25, lng: -170.68 },
    { id: 'arches',                 name: 'Arches',                          state: 'Utah',                  lat: 38.68,  lng: -109.57 },
    { id: 'badlands',               name: 'Badlands',                        state: 'South Dakota',          lat: 43.85,  lng: -101.99 },
    { id: 'big-bend',               name: 'Big Bend',                        state: 'Texas',                 lat: 29.25,  lng: -103.25 },
    { id: 'biscayne',               name: 'Biscayne',                        state: 'Florida',               lat: 25.65,  lng: -80.08 },
    { id: 'black-canyon',           name: 'Black Canyon of the Gunnison',    state: 'Colorado',              lat: 38.57,  lng: -107.72 },
    { id: 'bryce-canyon',           name: 'Bryce Canyon',                    state: 'Utah',                  lat: 37.59,  lng: -112.18 },
    { id: 'canyonlands',            name: 'Canyonlands',                     state: 'Utah',                  lat: 38.32,  lng: -109.85 },
    { id: 'capitol-reef',           name: 'Capitol Reef',                    state: 'Utah',                  lat: 38.20,  lng: -111.16 },
    { id: 'carlsbad-caverns',       name: 'Carlsbad Caverns',                state: 'New Mexico',            lat: 32.17,  lng: -104.44 },
    { id: 'channel-islands',        name: 'Channel Islands',                 state: 'California',            lat: 33.99,  lng: -119.42 },
    { id: 'congaree',               name: 'Congaree',                        state: 'South Carolina',        lat: 33.78,  lng: -80.78 },
    { id: 'crater-lake',            name: 'Crater Lake',                     state: 'Oregon',                lat: 42.94,  lng: -122.10 },
    { id: 'cuyahoga-valley',        name: 'Cuyahoga Valley',                 state: 'Ohio',                  lat: 41.24,  lng: -81.55 },
    { id: 'death-valley',           name: 'Death Valley',                    state: 'California / Nevada',   lat: 36.50,  lng: -117.08 },
    { id: 'denali',                 name: 'Denali',                          state: 'Alaska',                lat: 63.33,  lng: -150.50 },
    { id: 'dry-tortugas',           name: 'Dry Tortugas',                    state: 'Florida',               lat: 24.63,  lng: -82.87 },
    { id: 'everglades',             name: 'Everglades',                      state: 'Florida',               lat: 25.32,  lng: -80.93 },
    { id: 'gates-of-the-arctic',    name: 'Gates of the Arctic',             state: 'Alaska',                lat: 67.78,  lng: -153.30 },
    { id: 'gateway-arch',           name: 'Gateway Arch',                    state: 'Missouri',              lat: 38.63,  lng: -90.19 },
    { id: 'glacier',                name: 'Glacier',                         state: 'Montana',               lat: 48.80,  lng: -114.00 },
    { id: 'glacier-bay',            name: 'Glacier Bay',                     state: 'Alaska',                lat: 58.50,  lng: -137.00 },
    { id: 'grand-canyon',           name: 'Grand Canyon',                    state: 'Arizona',               lat: 36.06,  lng: -112.14 },
    { id: 'grand-teton',            name: 'Grand Teton',                     state: 'Wyoming',               lat: 43.73,  lng: -110.80 },
    { id: 'great-basin',            name: 'Great Basin',                     state: 'Nevada',                lat: 38.98,  lng: -114.30 },
    { id: 'great-sand-dunes',       name: 'Great Sand Dunes',                state: 'Colorado',              lat: 37.73,  lng: -105.51 },
    { id: 'great-smoky-mountains',  name: 'Great Smoky Mountains',           state: 'Tennessee / N. Carolina', lat: 35.68, lng: -83.53 },
    { id: 'guadalupe-mountains',    name: 'Guadalupe Mountains',             state: 'Texas',                 lat: 31.92,  lng: -104.87 },
    { id: 'haleakala',              name: 'Haleakala',                       state: 'Hawaii',                lat: 20.72,  lng: -156.17 },
    { id: 'hawaii-volcanoes',       name: 'Hawaii Volcanoes',                state: 'Hawaii',                lat: 19.38,  lng: -155.20 },
    { id: 'hot-springs',            name: 'Hot Springs',                     state: 'Arkansas',              lat: 34.51,  lng: -93.05 },
    { id: 'indiana-dunes',          name: 'Indiana Dunes',                   state: 'Indiana',               lat: 41.65,  lng: -87.05 },
    { id: 'isle-royale',            name: 'Isle Royale',                     state: 'Michigan',              lat: 48.10,  lng: -88.55 },
    { id: 'joshua-tree',            name: 'Joshua Tree',                     state: 'California',            lat: 33.88,  lng: -115.90 },
    { id: 'katmai',                 name: 'Katmai',                          state: 'Alaska',                lat: 58.50,  lng: -155.00 },
    { id: 'kenai-fjords',           name: 'Kenai Fjords',                    state: 'Alaska',                lat: 59.92,  lng: -149.65 },
    { id: 'kings-canyon',           name: 'Kings Canyon',                    state: 'California',            lat: 36.80,  lng: -118.55 },
    { id: 'kobuk-valley',           name: 'Kobuk Valley',                    state: 'Alaska',                lat: 67.55,  lng: -159.28 },
    { id: 'lake-clark',             name: 'Lake Clark',                      state: 'Alaska',                lat: 60.97,  lng: -153.42 },
    { id: 'lassen-volcanic',        name: 'Lassen Volcanic',                 state: 'California',            lat: 40.49,  lng: -121.51 },
    { id: 'mammoth-cave',           name: 'Mammoth Cave',                    state: 'Kentucky',              lat: 37.18,  lng: -86.10 },
    { id: 'mesa-verde',             name: 'Mesa Verde',                      state: 'Colorado',              lat: 37.18,  lng: -108.49 },
    { id: 'mount-rainier',          name: 'Mount Rainier',                   state: 'Washington',            lat: 46.85,  lng: -121.75 },
    { id: 'new-river-gorge',        name: 'New River Gorge',                 state: 'West Virginia',         lat: 38.07,  lng: -81.08 },
    { id: 'north-cascades',         name: 'North Cascades',                  state: 'Washington',            lat: 48.70,  lng: -121.20 },
    { id: 'olympic',                name: 'Olympic',                         state: 'Washington',            lat: 47.97,  lng: -123.50 },
    { id: 'petrified-forest',       name: 'Petrified Forest',                state: 'Arizona',               lat: 35.07,  lng: -109.78 },
    { id: 'pinnacles',              name: 'Pinnacles',                       state: 'California',            lat: 36.49,  lng: -121.16 },
    { id: 'redwood',                name: 'Redwood',                         state: 'California',            lat: 41.30,  lng: -124.00 },
    { id: 'rocky-mountain',         name: 'Rocky Mountain',                  state: 'Colorado',              lat: 40.40,  lng: -105.58 },
    { id: 'saguaro',                name: 'Saguaro',                         state: 'Arizona',               lat: 32.25,  lng: -110.50 },
    { id: 'sequoia',                name: 'Sequoia',                         state: 'California',            lat: 36.43,  lng: -118.68 },
    { id: 'shenandoah',             name: 'Shenandoah',                      state: 'Virginia',              lat: 38.53,  lng: -78.35 },
    { id: 'theodore-roosevelt',     name: 'Theodore Roosevelt',              state: 'North Dakota',          lat: 46.97,  lng: -103.45 },
    { id: 'virgin-islands',         name: 'Virgin Islands',                  state: 'US Virgin Islands',     lat: 18.34,  lng: -64.73 },
    { id: 'voyageurs',              name: 'Voyageurs',                       state: 'Minnesota',             lat: 48.50,  lng: -92.88 },
    { id: 'white-sands',            name: 'White Sands',                     state: 'New Mexico',            lat: 32.78,  lng: -106.17 },
    { id: 'wind-cave',              name: 'Wind Cave',                       state: 'South Dakota',          lat: 43.57,  lng: -103.48 },
    { id: 'wrangell-st-elias',      name: 'Wrangell-St. Elias',              state: 'Alaska',                lat: 61.00,  lng: -142.00 },
    { id: 'yellowstone',            name: 'Yellowstone',                     state: 'Wyoming / Montana / Idaho', lat: 44.60, lng: -110.50 },
    { id: 'yosemite',               name: 'Yosemite',                        state: 'California',            lat: 37.83,  lng: -119.50 },
    { id: 'zion',                   name: 'Zion',                            state: 'Utah',                  lat: 37.30,  lng: -113.05 }
  ];

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    view: 'parks',
    filter: 'all',
    search: '',
    visited: { parks: new Set(), states: new Set(), countries: new Set() },
    memories: { parks: {}, states: {}, countries: {} },
    data: { states: null, countries: null }
  };

  // ============================================================
  // FIREBASE (auth + cloud storage)
  // ============================================================
  // If firebase-config.js still has placeholder values, the app quietly
  // runs in local-only mode (the sign-in button is hidden). This lets
  // you develop/preview before doing the Firebase console setup.
  const firebaseReady =
    firebaseConfig &&
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.startsWith('YOUR_');

  let auth = null;
  let db = null;
  let currentUser = null;   // Firebase user object, or null when signed out

  if (firebaseReady) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    console.warn(
      '[Expedition] firebase-config.js has placeholder values — ' +
      'running in local-only mode. Fill in your Firebase config to enable sign-in.'
    );
  }

  function userDocRef() {
    return doc(db, 'users', currentUser.uid);
  }

  // ---- Cloud save (debounced) ----
  // Every toggle/memory-save calls saveData(). When signed in we wait a
  // beat (so rapid clicking = one write, which keeps Firestore usage tiny)
  // then push the whole profile document up.
  const SAVE_DEBOUNCE_MS = 700;
  let saveTimer = null;
  let savePending = false;
  let saveInFlight = false;

  function serializeProfile() {
    return {
      schema: 1,
      parks:     [...state.visited.parks],
      states:    [...state.visited.states],
      countries: [...state.visited.countries],
      memories:  state.memories,
      displayName: currentUser ? (currentUser.displayName || '') : '',
      updatedAt: serverTimestamp()
    };
  }

  function applyProfile(data) {
    ['parks', 'states', 'countries'].forEach(key => {
      state.visited[key] = new Set(Array.isArray(data[key]) ? data[key] : []);
    });
    state.memories = { parks: {}, states: {}, countries: {} };
    if (data.memories && typeof data.memories === 'object') {
      ['parks', 'states', 'countries'].forEach(key => {
        if (data.memories[key] && typeof data.memories[key] === 'object') {
          state.memories[key] = data.memories[key];
        }
      });
    }
  }

  function scheduleCloudSave() {
    savePending = true;
    setSyncStatus('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushCloudSave, SAVE_DEBOUNCE_MS);
  }

  async function flushCloudSave() {
    if (!currentUser || !savePending || saveInFlight) return;
    saveInFlight = true;
    savePending = false;
    try {
      await setDoc(userDocRef(), serializeProfile());
      setSyncStatus(savePending ? 'saving' : 'saved');
    } catch (e) {
      console.warn('[Expedition] cloud save failed', e);
      savePending = true; // keep it dirty; retry shortly
      setSyncStatus('error');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushCloudSave, 4000);
    } finally {
      saveInFlight = false;
      if (savePending && !saveTimer) scheduleCloudSave();
    }
  }

  // Try to get unsaved changes out the door if the tab is being closed/hidden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && savePending) {
      clearTimeout(saveTimer);
      flushCloudSave();
    }
  });

  // ---- Auth flows ----
  async function signIn() {
    if (!firebaseReady) return;
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged takes it from here
    } catch (e) {
      if (e.code === 'auth/popup-blocked' ||
          e.code === 'auth/operation-not-supported-in-this-environment') {
        // Popup blocked (some mobile browsers) → fall back to full-page redirect
        await signInWithRedirect(auth, provider);
      } else if (e.code === 'auth/unauthorized-domain') {
        alert(
          'This domain is not authorized for sign-in yet.\n\n' +
          'Add it under Firebase console → Authentication → Settings → Authorized domains.'
        );
      } else if (e.code !== 'auth/popup-closed-by-user' &&
                 e.code !== 'auth/cancelled-popup-request') {
        console.warn('[Expedition] sign-in failed', e);
        alert('Sign-in failed. Please try again.');
      }
    }
  }

  async function doSignOut() {
    // Push any unsaved edits before the session ends
    if (savePending) { clearTimeout(saveTimer); await flushCloudSave(); }
    await signOut(auth);
    // onAuthStateChanged fires with null → we reload local data there
  }

  // Loads (or creates) the user's cloud profile after sign-in.
  async function onSignedIn(user) {
    currentUser = user;
    renderAccount();
    setSyncStatus('loading');
    try {
      const snap = await getDoc(userDocRef());
      if (snap.exists()) {
        applyProfile(snap.data());
      } else {
        // First-ever sign-in on this account: migrate whatever this
        // browser already had in localStorage up to the cloud, so the
        // owner of the site doesn't lose their pre-login data.
        loadLocal();
        await setDoc(userDocRef(), serializeProfile());
      }
      setSyncStatus('saved');
    } catch (e) {
      console.warn('[Expedition] could not load cloud profile', e);
      setSyncStatus('error');
    }
    refreshAll();
  }

  function onSignedOut() {
    currentUser = null;
    savePending = false;
    clearTimeout(saveTimer);
    renderAccount();
    setSyncStatus('local');
    // Back to this browser's local data (NOT the signed-out user's data —
    // their stuff lives only in their cloud profile)
    state.visited = { parks: new Set(), states: new Set(), countries: new Set() };
    state.memories = { parks: {}, states: {}, countries: {} };
    loadLocal();
    refreshAll();
  }

  function initAuth() {
    if (!firebaseReady) {
      renderAccount();
      setSyncStatus('local');
      return;
    }
    // Completes the redirect flow if signInWithRedirect was used
    getRedirectResult(auth).catch(e =>
      console.warn('[Expedition] redirect sign-in failed', e)
    );
    onAuthStateChanged(auth, user => {
      if (user) onSignedIn(user);
      else onSignedOut();
    });
  }

  // ---- Account UI ----
  function renderAccount() {
    const wrap = document.getElementById('account');
    if (!wrap) return;

    if (!firebaseReady) { wrap.innerHTML = ''; return; }

    if (currentUser) {
      wrap.innerHTML = `
        <span class="account__sync" id="syncStatus" title="Sync status"></span>
        <img class="account__avatar" alt="" referrerpolicy="no-referrer" />
        <span class="account__name"></span>
        <button class="account__btn" id="signOutBtn" type="button">Sign out</button>
      `;
      const img = wrap.querySelector('.account__avatar');
      if (currentUser.photoURL) img.src = currentUser.photoURL;
      else img.remove();
      wrap.querySelector('.account__name').textContent =
        currentUser.displayName || currentUser.email || 'Explorer';
      wrap.querySelector('#signOutBtn').addEventListener('click', doSignOut);
    } else {
      wrap.innerHTML = `
        <span class="account__sync" id="syncStatus" title="Sync status"></span>
        <button class="account__btn account__btn--signin" id="signInBtn" type="button">
          <svg class="account__gicon" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Sign in with Google
        </button>
      `;
      wrap.querySelector('#signInBtn').addEventListener('click', signIn);
    }
    setSyncStatus(lastSync);
  }

  // Sync indicator: a small dot + word next to the account controls
  let lastSync = 'local';
  const SYNC_LABEL = {
    local:   'Local only',
    loading: 'Loading…',
    saving:  'Saving…',
    saved:   'Synced',
    error:   'Offline — will retry'
  };
  function setSyncStatus(kind) {
    lastSync = kind;
    const el = document.getElementById('syncStatus');
    if (!el) return;
    el.dataset.state = kind;
    el.textContent = SYNC_LABEL[kind] || '';
  }

  // ============================================================
  // STORAGE
  // ============================================================
  // Local (signed-out) persistence — unchanged from the original app
  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      ['parks', 'states', 'countries'].forEach(key => {
        if (Array.isArray(data[key])) state.visited[key] = new Set(data[key]);
      });
      if (data.memories && typeof data.memories === 'object') {
        ['parks', 'states', 'countries'].forEach(key => {
          if (data.memories[key] && typeof data.memories[key] === 'object') {
            state.memories[key] = data.memories[key];
          }
        });
      }
    } catch (e) { console.warn('load failed', e); }
  }

  function saveLocal() {
    const data = {
      parks: [...state.visited.parks],
      states: [...state.visited.states],
      countries: [...state.visited.countries],
      memories: state.memories
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (e) { console.warn('save failed', e); }
  }

  // Single entry point used everywhere a save is needed.
  // Signed in → debounced cloud write. Signed out → localStorage.
  function saveData() {
    if (currentUser) scheduleCloudSave();
    else saveLocal();
  }

  // True if a place has any saved memory content
  function hasMemory(category, id) {
    const m = state.memories[category] && state.memories[category][id];
    if (!m) return false;
    return Boolean((m.notes && m.notes.trim()) ||
                   (Array.isArray(m.list) && m.list.length) ||
                   (Array.isArray(m.favorites) && m.favorites.length));
  }

  function cleanupOldCache() {
    // remove obsolete v1 cache (large countries file from previous version)
    ['expedition.cache.v1.states', 'expedition.cache.v1.countries'].forEach(k => {
      try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
    });
  }

  async function fetchGeoJSON(key, url) {
    const cacheKey = `${CACHE_KEY}.${key}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (e) { /* ignore */ }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${key}: ${res.status}`);
    const data = await res.json();
    try { localStorage.setItem(cacheKey, JSON.stringify(data)); }
    catch (e) { /* quota — that's ok */ }
    return data;
  }

  // ============================================================
  // GEOMETRY HELPERS
  // ============================================================
  // Web Mercator latitude <-> projected-y helpers.
  // Leaflet renders in EPSG:3857, so to keep Alaska's shape natural we must
  // scale it in projected space — not in raw degrees of latitude, which get
  // compressed when the shape is moved down to lower-48 latitudes.
  function latToMercY(lat) {
    const r = lat * Math.PI / 180;
    return Math.log(Math.tan(Math.PI / 4 + r / 2));
  }
  function mercYToLat(y) {
    return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
  }

  // Shrink Alaska uniformly (same factor in x and projected-y) so it keeps
  // natural proportions, then drop it well below the southwest US.
  const AK_SCALE = 0.4;
  const AK_X_OFF = -54;    // longitude shift
  const AK_Y_OFF = -0.17;  // projected-y shift — puts the top of AK ~29-30N
  function transformAK(coord) {
    let [lng, lat] = coord;
    if (lng > 0) lng -= 360; // unwrap Aleutians
    const y = latToMercY(lat) * AK_SCALE + AK_Y_OFF;
    return [lng * AK_SCALE + AK_X_OFF, mercYToLat(y)];
  }

  // Slide Hawaii to the bottom-left of Texas (west of, and below, the mainland)
  function transformHI(coord) {
    return [coord[0] + 53, coord[1] + 3];
  }

  function transformGeometry(geom, fn) {
    const rec = c => (typeof c[0] === 'number' ? fn(c) : c.map(rec));
    geom.coordinates = rec(geom.coordinates);
  }

  // ---- City data helpers ----
  function preprocessStates(geojson) {
    const features = geojson.features
      .filter(f => !STATE_EXCLUDE.has(f.properties.name))
      .map(f => {
        // deep clone so we don't mutate any cached source
        const copy = JSON.parse(JSON.stringify(f));
        if (copy.properties.name === 'Alaska') transformGeometry(copy.geometry, transformAK);
        if (copy.properties.name === 'Hawaii') transformGeometry(copy.geometry, transformHI);
        return copy;
      });
    return { ...geojson, features };
  }

  // Normalize country properties so .name is always set (different sources use different keys)
  function preprocessCountries(geojson) {
    const features = geojson.features
      .map(f => {
        const props = f.properties || {};
        const name = props.name || props.NAME || props.ADMIN || props.name_long;
        if (!name) return null;
        return { ...f, properties: { ...props, name } };
      })
      .filter(Boolean);
    return { ...geojson, features };
  }

  function parkDisplayCoord(park) {
    if (PARK_DISPLAY_OVERRIDES[park.id]) return PARK_DISPLAY_OVERRIDES[park.id];
    if (park.state.includes('Alaska')) {
      const [lng, lat] = transformAK([park.lng, park.lat]);
      return [lat, lng];
    }
    if (park.state.includes('Hawaii')) {
      const [lng, lat] = transformHI([park.lng, park.lat]);
      return [lat, lng];
    }
    return [park.lat, park.lng];
  }

  // Centroid of the largest polygon (good enough for placing a pin)
  function regionCentroid(geom) {
    if (!geom) return null;
    let ring = null;
    if (geom.type === 'Polygon') {
      ring = geom.coordinates[0];
    } else if (geom.type === 'MultiPolygon') {
      let bestArea = 0;
      for (const poly of geom.coordinates) {
        const r = poly[0];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [x, y] of r) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        const area = (maxX - minX) * (maxY - minY);
        if (area > bestArea) { bestArea = area; ring = r; }
      }
    }
    if (!ring || !ring.length) return null;
    let sx = 0, sy = 0;
    for (const [x, y] of ring) { sx += x; sy += y; }
    return [sy / ring.length, sx / ring.length]; // [lat, lng]
  }

  // ============================================================
  // MAP
  // ============================================================
  let map, currentLayer, parkBaseLayer;
  let parkMarkers = [];
  let countryPins = [];

  // Tracks whether each tab's map view has been fitted. We only auto-fit on
  // first render or when switching tabs — never on a visited/memory refresh,
  // so toggling a place doesn't yank the map back to its default view.
  const viewFitted = { parks: false, states: false, countries: false };

  const STYLE = {
    land:         '#d7dbe0',   // was #d9cbab
    landHover:    '#c3c9d1',   // was #c9b78c
    visited:      '#b34a26',
    visitedHover: '#8e3818',
    border:       '#1f2a20',
    parkBase:     '#e6e9ec',   // was #e8dcbe
    parkBorder:   '#aeb5bd',   // was #b3a387
  };

  function initMap() {
    map = L.map('map', {
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: false,
      minZoom: 1,
      maxZoom: 8
    });
    map.setView([39, -96], 4);
  }

  function clearLayers() {
    if (currentLayer)  { map.removeLayer(currentLayer);  currentLayer  = null; }
    if (parkBaseLayer) { map.removeLayer(parkBaseLayer); parkBaseLayer = null; }
    parkMarkers.forEach(m => map.removeLayer(m));
    parkMarkers = [];
    countryPins.forEach(m => map.removeLayer(m));
    countryPins = [];
  }

  function regionStyle(visited) {
    return {
      fillColor: visited ? STYLE.visited : STYLE.land,
      weight: 0.7,
      color: STYLE.border,
      fillOpacity: 1,
      opacity: 0.55
    };
  }

  // Google-Maps-style pin icon as an SVG divIcon
  function makePin(opts = {}) {
    const { size = 'md', visited = true } = opts;
    const dims = size === 'sm'
      ? { w: 16, h: 24, anchor: 23, dot: 2.6 }
      : { w: 22, h: 32, anchor: 31, dot: 3.5 };
    const fill   = visited ? STYLE.visited      : '#f6efde';
    const stroke = visited ? STYLE.visitedHover : '#5a6258';
    const dotCol = visited ? '#f6efde'          : STYLE.visited;
    return L.divIcon({
      html: `<svg viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" width="${dims.w}" height="${dims.h}">
  <path d="M12 0 C5.4 0 0 5.4 0 12 C0 21 12 36 12 36 S24 21 24 12 C24 5.4 18.6 0 12 0 Z"
        fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
  <circle cx="12" cy="12" r="${dims.dot}" fill="${dotCol}"/>
</svg>`,
      className: `map-pin map-pin--${size}${visited ? ' is-visited' : ''}`,
      iconSize:    [dims.w, dims.h],
      iconAnchor:  [dims.w / 2, dims.anchor],
      popupAnchor: [0, -dims.anchor + 4]
    });
  }

  // Evergreen tree icon for national parks — white by default, green when visited
  function makeTree(visited) {
    const foliage = visited ? '#357a38' : '#fbfaf5';
    const stroke  = visited ? '#1d5226' : '#3f5a3f';
    const trunk   = visited ? '#43301a' : '#8a6a45';
    const w = 20, h = 27, anchor = 25;
    return L.divIcon({
      html: `<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect x="10.6" y="24" width="2.8" height="7" rx="0.6" fill="${trunk}" stroke="${stroke}" stroke-width="0.8"/>
  <polygon points="12,2 19,13 5,13"      fill="${foliage}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round"/>
  <polygon points="12,8 21,20 3,20"      fill="${foliage}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round"/>
  <polygon points="12,14 22.5,26 1.5,26" fill="${foliage}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round"/>
</svg>`,
      className: `map-tree${visited ? ' is-visited' : ''}`,
      iconSize:    [w, h],
      iconAnchor:  [w / 2, anchor],
      popupAnchor: [0, -anchor + 3]
    });
  }

  function renderStatesMap() {
    clearLayers();
    if (!state.data.states) return;
    currentLayer = L.geoJSON(state.data.states, {
      style: f => regionStyle(state.visited.states.has(f.properties.name)),
      onEachFeature: (f, layer) => {
        const name = f.properties.name;
        layer.on({
          mouseover: e => {
            const v = state.visited.states.has(name);
            e.target.setStyle({ fillColor: v ? STYLE.visitedHover : STYLE.landHover });
          },
          mouseout: e => currentLayer.resetStyle(e.target)
        });
        layer.bindTooltip(name, { sticky: true, direction: 'top', className: 'region-tip' });
        layer.bindPopup(() => buildRegionPopup('states', name, name, ''));
      }
    }).addTo(map);
    if (!viewFitted.states) {
      map.fitBounds(currentLayer.getBounds(), { padding: [20, 20] });
      viewFitted.states = true;
    }
  }

  function renderCountriesMap() {
    clearLayers();
    if (!state.data.countries) return;

    currentLayer = L.geoJSON(state.data.countries, {
      style: f => regionStyle(state.visited.countries.has(f.properties.name)),
      onEachFeature: (f, layer) => {
        const name = f.properties.name;
        if (!name) return;
        layer.on({
          mouseover: e => {
            const v = state.visited.countries.has(name);
            e.target.setStyle({ fillColor: v ? STYLE.visitedHover : STYLE.landHover });
          },
          mouseout: e => currentLayer.resetStyle(e.target)
        });
        layer.bindTooltip(name, { sticky: true, direction: 'top', className: 'region-tip' });
        layer.bindPopup(() => buildRegionPopup('countries', name, name, ''));
      }
    }).addTo(map);

    // Place a Google-Maps-style pin at the centroid of every visited country
    state.data.countries.features.forEach(f => {
      const name = f.properties.name;
      if (!name || !state.visited.countries.has(name)) return;
      const centroid = regionCentroid(f.geometry);
      if (!centroid) return;
      const pin = L.marker(centroid, {
        icon: makePin({ size: 'md', visited: true }),
        interactive: false,
        keyboard: false
      });
      pin.addTo(map);
      countryPins.push(pin);
    });

    if (!viewFitted.countries) {
      // Default view = "one click zoomed in" from the full world, so Antarctica
      // starts below the fold. Done deterministically (no animation, size synced)
      // so it lands the same way every time rather than toggling.
      map.invalidateSize(false);
      map.fitBounds([[-58, -170], [80, 170]], { padding: [8, 8], animate: false });
      map.setZoom(map.getZoom() + 1, { animate: false });
      viewFitted.countries = true;
    }
  }

  function renderParksMap() {
    clearLayers();

    if (state.data.states) {
      parkBaseLayer = L.geoJSON(state.data.states, {
        style: () => ({
          fillColor: STYLE.parkBase,
          weight: 0.6,
          color: STYLE.parkBorder,
          fillOpacity: 0.85,
          opacity: 0.6
        }),
        interactive: false
      }).addTo(map);
    }

    PARKS.forEach(park => {
      const visited = state.visited.parks.has(park.id);
      const latlng = parkDisplayCoord(park);
      const marker = L.marker(latlng, {
        icon: makeTree(visited),
        riseOnHover: true
      });
      marker.bindTooltip(park.name, { direction: 'top', offset: [0, -20] });
      marker.bindPopup(() => buildRegionPopup('parks', park.id, park.name, park.state));
      marker.addTo(map);
      parkMarkers.push(marker);
    });

    if (!viewFitted.parks) {
      if (parkBaseLayer) {
        map.fitBounds(parkBaseLayer.getBounds(), { padding: [20, 20] });
      } else {
        map.setView([35, -98], 4);
      }
      viewFitted.parks = true;
    }
  }

  // One popup builder for parks, states, and countries.
  // Returns a DOM node with listeners already attached (used via the function
  // form of bindPopup so it reflects current state each time it opens).
  function buildRegionPopup(category, id, name, meta) {
    const visited = state.visited[category].has(id);
    const memo = hasMemory(category, id);

    const div = document.createElement('div');
    div.className = 'place-popup';
    div.innerHTML = `
      <span class="popup-title"></span>
      ${meta ? '<span class="popup-meta"></span>' : ''}
      <button class="popup-btn popup-btn--memories ${memo ? 'has-memo' : ''}" data-act="memories">
        ${memo ? '✦ Saved Memories' : 'Saved Memories'}
      </button>
      <button class="popup-btn popup-btn--visit ${visited ? 'is-visited' : ''}" data-act="visit">
        ${visited ? '✓ Visited — Remove' : 'Mark as Visited'}
      </button>
    `;
    div.querySelector('.popup-title').textContent = name;
    if (meta) div.querySelector('.popup-meta').textContent = meta;

    div.querySelector('[data-act="visit"]').addEventListener('click', () => {
      toggleVisited(category, id);
      map.closePopup();
    });
    div.querySelector('[data-act="memories"]').addEventListener('click', () => {
      map.closePopup();
      openMemories(category, id, name);
    });
    return div;
  }

  // ============================================================
  // ACTIONS
  // ============================================================
  function toggleVisited(category, id) {
    const set = state.visited[category];
    if (set.has(id)) set.delete(id); else set.add(id);
    saveData();
    refreshAll();
  }

  // ============================================================
  // SAVED MEMORIES MODAL
  // ============================================================
  let activeMemo = null; // { category, id }

  const MEMO_META = {
    parks:     { eyebrow: 'National Park', kind: 'hikes',  listLabel: 'Favorite Hikes'  },
    states:    { eyebrow: 'U.S. State',    kind: 'cities', listLabel: 'Favorite Cities' },
    countries: { eyebrow: 'Country',       kind: 'cities', listLabel: 'Favorite Cities' }
  };

  function openMemories(category, id, name) {
    activeMemo = { category, id, name };
    const meta = MEMO_META[category];
    const mem = (state.memories[category] && state.memories[category][id]) || {};

    document.getElementById('memoEyebrow').textContent = meta.eyebrow;
    document.getElementById('memoPlace').textContent = name;
    document.getElementById('memoNotes').value = mem.notes || '';

    // Primary list: Favorite Hikes (parks) or Favorite Cities (states/countries)
    document.getElementById('memoListLabel').textContent = meta.listLabel;
    renderMemoList(category, Array.isArray(mem.list) ? mem.list : []);

    // Favorite Memories (everyone)
    document.getElementById('memoFavLabel').textContent = 'Favorite Memories';
    renderFavList(Array.isArray(mem.favorites) ? mem.favorites : []);

    document.getElementById('memoStatus').textContent = '';

    const overlay = document.getElementById('memoOverlay');
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    document.getElementById('memoNotes').focus();
  }

  function closeMemories() {
    const overlay = document.getElementById('memoOverlay');
    overlay.classList.remove('is-open');
    setTimeout(() => { overlay.hidden = true; }, 220);
    activeMemo = null;
  }

  // Render the list: hikes (name + AllTrails link) or cities (name).
  function renderMemoList(category, items) {
    const isHikes = MEMO_META[category].kind === 'hikes';
    const container = document.getElementById('memoListRows');
    container.innerHTML = '';

    const rows = items.slice();
    if (rows.length === 0) rows.push(isHikes ? { name: '', url: '' } : { name: '' });
    rows.forEach(item => container.appendChild(makeMemoRow(isHikes, item)));
  }

  function makeMemoRow(isHikes, item) {
    const row = document.createElement('div');
    row.className = 'memo-row' + (isHikes ? '' : ' memo-row--single');

    const nameInput = document.createElement('input');
    nameInput.className = 'memo-row__name';
    nameInput.type = 'text';
    nameInput.placeholder = isHikes ? 'Hike name' : 'City';
    nameInput.value = (item && item.name) || '';
    row.appendChild(nameInput);

    if (isHikes) {
      const urlInput = document.createElement('input');
      urlInput.className = 'memo-row__url';
      urlInput.type = 'text';
      urlInput.placeholder = 'AllTrails link (optional)';
      urlInput.value = (item && item.url) || '';
      row.appendChild(urlInput);
    }

    const del = document.createElement('button');
    del.className = 'memo-row__del';
    del.type = 'button';
    del.title = 'Remove';
    del.textContent = '×';
    del.addEventListener('click', () => row.remove());
    row.appendChild(del);

    return row;
  }

  function collectMemoList(category) {
    const isHikes = MEMO_META[category].kind === 'hikes';
    const out = [];
    document.querySelectorAll('#memoListRows .memo-row').forEach(row => {
      const name = row.querySelector('.memo-row__name').value.trim();
      if (!name) return;
      if (isHikes) {
        const url = row.querySelector('.memo-row__url').value.trim();
        out.push(url ? { name, url } : { name });
      } else {
        out.push({ name });
      }
    });
    return out;
  }

  function saveMemories() {
    if (!activeMemo) return;
    const { category, id } = activeMemo;
    const notes = document.getElementById('memoNotes').value.trim();
    const list = collectMemoList(category);
    const favorites = collectFavList();

    if (!state.memories[category]) state.memories[category] = {};
    if (!notes && list.length === 0 && favorites.length === 0) {
      delete state.memories[category][id];
    } else {
      state.memories[category][id] = { notes, list, favorites };
    }
    saveData(); // persists visited + memories together

    document.getElementById('memoStatus').textContent = 'Saved ✓';
    refreshAll();
    setTimeout(closeMemories, 550);
  }

  function addMemoRow() {
    if (!activeMemo) return;
    const isHikes = MEMO_META[activeMemo.category].kind === 'hikes';
    document.getElementById('memoListRows').appendChild(makeMemoRow(isHikes, null));
  }

  // ---- Favorite Memories (non-numbered, no drag) ----
  function renderFavList(items) {
    const container = document.getElementById('memoFavRows');
    container.innerHTML = '';
    const rows = items.slice();
    if (rows.length === 0) rows.push('');
    rows.forEach(text => container.appendChild(makeFavRow(text)));
  }

  function makeFavRow(text) {
    const row = document.createElement('div');
    row.className = 'memo-row memo-row--fav';

    const input = document.createElement('input');
    input.className = 'memo-row__name';
    input.type = 'text';
    input.placeholder = 'A favorite memory';
    input.value = text || '';
    row.appendChild(input);

    const del = document.createElement('button');
    del.className = 'memo-row__del';
    del.type = 'button';
    del.title = 'Remove';
    del.textContent = '×';
    del.addEventListener('click', () => row.remove());
    row.appendChild(del);

    return row;
  }

  function collectFavList() {
    const out = [];
    document.querySelectorAll('#memoFavRows .memo-row').forEach(row => {
      const text = row.querySelector('.memo-row__name').value.trim();
      if (text) out.push(text);
    });
    return out;
  }

  function addFavRow() {
    document.getElementById('memoFavRows').appendChild(makeFavRow(''));
  }

  // ============================================================
  // LIST
  // ============================================================
  function getCurrentList() {
    if (state.view === 'parks') {
      return PARKS.map(p => ({
        id: p.id,
        name: p.name,
        meta: p.state,
        visited: state.visited.parks.has(p.id)
      })).sort((a, b) => a.name.localeCompare(b.name));
    }
    if (state.view === 'states' && state.data.states) {
      return state.data.states.features.map(f => ({
        id: f.properties.name,
        name: f.properties.name,
        meta: '',
        visited: state.visited.states.has(f.properties.name)
      })).sort((a, b) => a.name.localeCompare(b.name));
    }
    if (state.view === 'countries' && state.data.countries) {
      return state.data.countries.features
        .filter(f => f.properties.name)
        .map(f => ({
          id: f.properties.name,
          name: f.properties.name,
          meta: '',
          visited: state.visited.countries.has(f.properties.name)
        })).sort((a, b) => a.name.localeCompare(b.name));
    }
    return [];
  }

  function renderList() {
    const items = getCurrentList();
    const q = state.search.toLowerCase().trim();
    const filtered = items.filter(item => {
      if (state.filter === 'visited' && !item.visited) return false;
      if (state.filter === 'todo' && item.visited) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });

    const ul = document.getElementById('placeList');
    ul.innerHTML = '';
    document.getElementById('emptyHint').hidden = filtered.length > 0;

    const cat = state.view;
    const frag = document.createDocumentFragment();
    filtered.forEach(item => {
      const li = document.createElement('li');
      li.className = 'place-item' + (item.visited ? ' is-visited' : '');
      const check = document.createElement('span');
      check.className = 'place-item__check';
      const name = document.createElement('span');
      name.className = 'place-item__name';
      name.textContent = item.name;
      li.appendChild(check);
      li.appendChild(name);
      if (item.meta) {
        const meta = document.createElement('span');
        meta.className = 'place-item__meta';
        meta.textContent = item.meta;
        li.appendChild(meta);
      }
      const memoBtn = document.createElement('button');
      const hasMemo = hasMemory(cat, item.id);
      memoBtn.className = 'place-item__memo' + (hasMemo ? ' has-memo' : '');
      memoBtn.title = hasMemo ? 'Saved memories' : 'Add memories';
      memoBtn.textContent = hasMemo ? '✦' : '✎';
      memoBtn.addEventListener('click', e => {
        e.stopPropagation();
        openMemories(cat, item.id, item.name);
      });
      li.appendChild(memoBtn);

      li.addEventListener('click', () => toggleVisited(cat, item.id));
      li.addEventListener('dblclick', () => flyToItem(cat, item.id));
      frag.appendChild(li);
    });
    ul.appendChild(frag);
  }

  function flyToItem(cat, id) {
    if (cat === 'parks') {
      const park = PARKS.find(p => p.id === id);
      if (park) map.flyTo(parkDisplayCoord(park), 6, { duration: 0.8 });
    } else if (cat === 'states' && state.data.states) {
      const feat = state.data.states.features.find(f => f.properties.name === id);
      if (feat) {
        const c = regionCentroid(feat.geometry);
        if (c) map.flyTo(c, 6, { duration: 0.8 });
      }
    } else if (cat === 'countries' && state.data.countries) {
      const feat = state.data.countries.features.find(f => f.properties.name === id);
      if (feat) {
        const c = regionCentroid(feat.geometry);
        if (c) map.flyTo(c, 4, { duration: 0.8 });
      }
    }
  }

  function renderStats() {
    const items = getCurrentList();
    const visited = items.filter(i => i.visited).length;
    document.getElementById('statsCount').textContent = visited;
    document.getElementById('statsTotal').textContent = items.length;
    const labels = { parks: 'parks visited', states: 'states visited', countries: 'countries visited' };
    document.getElementById('statsLabel').textContent = labels[state.view];
  }

  function renderCaption() {
    const caps = {
      parks: 'United States National Parks',
      states: 'United States of America',
      countries: 'The World'
    };
    document.getElementById('mapCaption').textContent = caps[state.view];
  }

  function renderMap() {
    if (state.view === 'parks') renderParksMap();
    else if (state.view === 'states') renderStatesMap();
    else if (state.view === 'countries') renderCountriesMap();
  }

  function refreshAll() {
    renderMap();
    renderList();
    renderStats();
    renderCaption();
  }

  // ============================================================
  // EVENTS
  // ============================================================
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const newView = tab.dataset.view;
      if (newView === state.view) return; // already here — don't touch the view/zoom

      document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      state.view = newView;
      state.search = '';
      document.getElementById('searchInput').value = '';
      viewFitted[newView] = false; // entering from another tab → reset to default view
      refreshAll();
    });
  });

  document.querySelectorAll('.filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.filter = btn.dataset.filter;
      renderList();
    });
  });

  document.getElementById('searchInput').addEventListener('input', e => {
    state.search = e.target.value;
    renderList();
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    const labels = { parks: 'national parks', states: 'states', countries: 'countries' };
    if (confirm(`Reset all visited ${labels[state.view]}? This cannot be undone.`)) {
      state.visited[state.view].clear();
      saveData();
      refreshAll();
    }
  });

  // ---- Saved Memories modal ----
  document.getElementById('memoSave').addEventListener('click', saveMemories);
  document.getElementById('memoClose').addEventListener('click', closeMemories);
  document.getElementById('memoAdd').addEventListener('click', addMemoRow);
  document.getElementById('memoFavAdd').addEventListener('click', addFavRow);
  document.getElementById('memoOverlay').addEventListener('click', e => {
    // click on the dimmed backdrop (not the modal itself) closes
    if (e.target.id === 'memoOverlay') closeMemories();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('memoOverlay').hidden) {
      closeMemories();
    }
  });

  // ============================================================
  // INIT
  // ============================================================
  async function init() {
    cleanupOldCache();
    loadLocal();   // instant first paint with this browser's data;
    initAuth();    // …then auth resolves and swaps in the cloud profile if signed in
    initMap();
    renderParksMap();
    renderList();
    renderStats();
    renderCaption();

    // Load the map datasets in parallel — show whatever arrives first
    const results = await Promise.allSettled([
      fetchGeoJSON('states', SOURCES.states),
      fetchGeoJSON('countries', SOURCES.countries)
    ]);

    if (results[0].status === 'fulfilled') {
      state.data.states = preprocessStates(results[0].value);
    }
    if (results[1].status === 'fulfilled') {
      state.data.countries = preprocessCountries(results[1].value);
    }

    if (!state.data.states && !state.data.countries) {
      const loader = document.getElementById('loader');
      loader.innerHTML = `
        <div class="loader__inner" style="flex-direction:column;text-align:center;max-width:420px;padding:24px;">
          <strong style="font-style:normal;color:var(--visited);font-size:18px;margin-bottom:8px;">
            Could not load map data
          </strong>
          <span style="font-style:normal;">
            The app fetches GeoJSON from cdn.jsdelivr.net on first load.
            Check your internet connection and reload.
          </span>
          <button onclick="location.reload()" style="margin-top:16px;padding:8px 16px;background:var(--ink);color:var(--bg-paper);border:none;cursor:pointer;font-family:inherit;text-transform:uppercase;letter-spacing:0.1em;font-size:11px;">
            Reload
          </button>
        </div>`;
      return;
    }

    document.getElementById('loader').classList.add('is-hidden');
    refreshAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
