/* Data layer. Two modes, chosen automatically:
   - Cloud (Firebase): used when firebase-config.js has a real config. passcode unlock, shows sync
     across every device, and changes made offline sync when you reconnect.
   - Local: used while firebase-config.js still has the PASTE_ placeholders. Data stays in this browser.
   Either way it exposes window.claude.use('db' | 'downloads'), which the app already uses. */
(function(){
  "use strict";

  var FB_VERSION = '10.14.1';
  var LOCAL_KEY = 'gsc-weigh-breaks-v1';
  var cfg = window.FIREBASE_CONFIG || {};
  // Hidden shared account behind the passcode. The passcode is this account's password.
  var SYNC_EMAIL = cfg.syncEmail || 'sync@weighbreaks.app';
  var useCloud = !!(cfg.apiKey && cfg.projectId && String(cfg.apiKey).indexOf('PASTE') < 0 && String(cfg.projectId).indexOf('PASTE') < 0);

  function clone(o){ return JSON.parse(JSON.stringify(o)); }

  // ---------- downloads ----------
  var downloads = {
    save: function(req){
      return new Promise(function(resolve, reject){
        try {
          var blob = req.data instanceof Blob ? req.data : new Blob([req.data]);
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = req.filename;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
          resolve({ status: 'saved' });
        } catch (e){ reject({ code: 'unavailable', message: 'Downloads are blocked in this browser.' }); }
      });
    }
  };

  // ---------- shared styles ----------
  var css = document.createElement('style');
  css.textContent =
    '.localfoot{margin-top:22px;padding-top:14px;border-top:1px solid #3a3a3a;display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:var(--on-dark-soft);font-size:.78rem}' +
    '.localfoot span.msg{flex:1 1 260px}.localfoot .btn{padding:7px 12px;font-size:.78rem}' +
    '.gscgate{position:fixed;inset:0;background:rgba(0,0,0,.94);display:flex;align-items:center;justify-content:center;padding:20px;z-index:100}' +
    '.gscgate-card{background:var(--surface);color:var(--ink);border-top:3px solid var(--gold-fill);border-radius:14px;padding:26px 24px;max-width:420px;width:100%}' +
    '.gscgate-card .eyebrow{margin-bottom:10px}.gscgate-card h2{margin:0 0 8px;font-size:1.3rem}' +
    '.gscgate-card p{margin:0 0 16px;font-size:.92rem;line-height:1.5;color:var(--ink-soft)}' +
    '.gscgate-card .gatemsg{margin-top:12px;font-size:.82rem;color:#a33;min-height:1em}';
  document.head.appendChild(css);

  // ---------- sync pill ----------
  var pillEl = null, pillState = { pending: 0, error: false };
  var pcss = document.createElement('style');
  pcss.textContent =
    '.syncpill{position:fixed;top:12px;right:12px;z-index:50;display:inline-flex;align-items:center;gap:7px;padding:5px 12px 5px 10px;border-radius:999px;font:600 12px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.02em;background:#e6f6ea;color:#14602b;border:1px solid #8fd3a3;box-shadow:0 1px 4px rgba(0,0,0,.25)}' +
    '.syncpill i{width:8px;height:8px;border-radius:50%;background:#22b54b;box-shadow:0 0 0 0 rgba(34,181,75,.6)}' +
    '.syncpill.synced i{animation:syncpulse 2.4s ease-out infinite}' +
    '.syncpill.syncing{background:#fff6dd;color:#7a5a00;border-color:#e3c46b}.syncpill.syncing i{background:#e0a800;animation:syncblink .8s ease-in-out infinite}' +
    '.syncpill.offline{background:#eceef0;color:#444;border-color:#b5bac0}.syncpill.offline i{background:#8a9099}' +
    '.syncpill.error{background:#fde8e8;color:#8a1c1c;border-color:#e59a9a}.syncpill.error i{background:#d23b3b}' +
    '@keyframes syncpulse{0%{box-shadow:0 0 0 0 rgba(34,181,75,.55)}70%,100%{box-shadow:0 0 0 7px rgba(34,181,75,0)}}' +
    '@keyframes syncblink{50%{opacity:.35}}' +
    '@media (prefers-reduced-motion:reduce){.syncpill i{animation:none!important}}';
  document.head.appendChild(pcss);
  function renderPill(){
    if (!pillEl){
      pillEl = document.createElement('div');
      pillEl.className = 'syncpill'; pillEl.setAttribute('role', 'status'); pillEl.setAttribute('aria-live', 'polite');
      pillEl.innerHTML = '<i></i><span></span>';
      document.body.appendChild(pillEl);
    }
    var st, label;
    if (!navigator.onLine){ st = 'offline'; label = 'Offline' + (pillState.pending ? ' · ' + pillState.pending + ' waiting' : ''); }
    else if (pillState.error){ st = 'error'; label = 'Sync problem'; }
    else if (pillState.pending){ st = 'syncing'; label = 'Syncing…'; }
    else { st = 'synced'; label = 'Synced'; }
    pillEl.className = 'syncpill ' + st;
    pillEl.lastChild.textContent = label;
    pillEl.title = st === 'synced' ? 'All changes are saved to the cloud' : st === 'syncing' ? 'Saving changes to the cloud' : st === 'offline' ? 'Changes are saved on this device and will sync when you reconnect' : 'Couldn’t reach the cloud; changes are kept on this device';
  }
  function trackWrite(p){
    pillState.pending++; renderPill();
    return Promise.resolve(p).then(function(v){ pillState.pending--; pillState.error = false; renderPill(); return v; },
      function(e){ pillState.pending--; pillState.error = true; renderPill(); throw e; });
  }

  // ---------- footer: backup / restore (+ extras) ----------
  function buildFooter(opts){
    function mount(){
      var wrap = document.querySelector('.wrap');
      if (!wrap) return;
      var f = document.createElement('div');
      f.className = 'localfoot';
      f.innerHTML = '<span class="msg" id="localMsg"></span>' +
        (opts.migrate ? '<button class="btn ghost" id="migrateBtn">Upload this browser’s old data</button>' : '') +
        '<button class="btn ghost" id="backupBtn">Backup data</button>' +
        '<button class="btn ghost" id="restoreBtn">Restore backup</button>' +
        (opts.signOut ? '<button class="btn ghost" id="signOutBtn">Lock this device</button>' : '') +
        '<input type="file" id="restoreFile" accept="application/json,.json" hidden>';
      wrap.appendChild(f);
      var msg = document.getElementById('localMsg');
      var base = opts.baseMsg();
      msg.textContent = base;
      opts.onStatus = function(t){ msg.textContent = t || base; };

      document.getElementById('backupBtn').addEventListener('click', function(){
        var d = new Date(), stamp = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        Promise.resolve(opts.backup()).then(function(obj){
          return downloads.save({ filename: 'gsc-weigh-breaks-backup-' + stamp + '.json', data: JSON.stringify(obj, null, 1) });
        }).then(function(){ msg.textContent = 'Backup downloaded.'; })
          .catch(function(){ msg.textContent = 'Couldn’t create the backup.'; });
      });
      document.getElementById('restoreBtn').addEventListener('click', function(){ document.getElementById('restoreFile').click(); });
      document.getElementById('restoreFile').addEventListener('change', function(e){
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var r = new FileReader();
        r.onload = function(){
          var parsed;
          try { parsed = JSON.parse(r.result); if (!parsed || typeof parsed.shows !== 'object') throw 0; }
          catch (err){ msg.textContent = 'That file isn’t a valid backup.'; e.target.value = ''; return; }
          Promise.resolve(opts.restore(parsed)).then(function(n){ msg.textContent = 'Backup restored: ' + n + ' records.'; })
            .catch(function(){ msg.textContent = 'Couldn’t restore that backup.'; });
          e.target.value = '';
        };
        r.readAsText(file);
      });
      if (opts.migrate) document.getElementById('migrateBtn').addEventListener('click', function(){
        msg.textContent = 'Uploading…';
        opts.migrate().then(function(n){ msg.textContent = 'Uploaded ' + n + ' records from this browser.'; var b = document.getElementById('migrateBtn'); if (b) b.remove(); })
          .catch(function(){ msg.textContent = 'Couldn’t upload that data.'; });
      });
      if (opts.signOut) document.getElementById('signOutBtn').addEventListener('click', opts.signOut);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }

  // =====================================================================
  //  LOCAL MODE
  // =====================================================================
  function startLocal(){
    var data = null, subs = [];
    function save(){ try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch(e){ console.warn('Could not save to this browser:', e); } }
    try { var raw = localStorage.getItem(LOCAL_KEY); if (raw) data = JSON.parse(raw); } catch(e){}
    if (!data || typeof data.shows !== 'object'){
      data = { shows: clone((window.GSC_SEED || {}).shows || {}), series: {} };
      save();
    }
    if (!data.series) data.series = {};
    if (!data.seeded) data.seeded = {};
    ((window.GSC_SEED || {}).extras || []).forEach(function(ex){
      if (data.seeded[ex.flag]) return;
      Object.keys(ex.shows).forEach(function(id){ if (!data.shows[id]) data.shows[id] = clone(ex.shows[id]); });
      data.seeded[ex.flag] = true; save();
    });

    function snap(coll, filt){
      return { docs: Object.keys(data[coll]).filter(function(id){ return !filt || filt(data[coll][id]); }).map(function(id){
        return { id: id, data: function(){ return clone(data[coll][id]); } };
      }) };
    }
    function notify(){ subs.slice().forEach(function(s){ s.cb(snap(s.coll, s.filt)); }); }
    function subscribe(coll, filt, cb){
      var s = { coll: coll, filt: filt, cb: cb };
      subs.push(s);
      setTimeout(function(){ cb(snap(coll, filt)); }, 0);
      return function(){ subs = subs.filter(function(x){ return x !== s; }); };
    }
    function newId(){ return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

    var db = { collection: function(coll){
      if (!data[coll]) data[coll] = {};
      return {
        where: function(field, op, value){
          var filt = function(d){ return d[field] === value; };
          return { onSnapshot: function(cb){ return subscribe(coll, filt, cb); } };
        },
        onSnapshot: function(cb){ return subscribe(coll, null, cb); },
        add: function(d){ var id = newId(); data[coll][id] = clone(d); save(); notify(); return Promise.resolve({ id: id }); },
        doc: function(id){ return {
          set: function(d){ data[coll][id] = clone(d); save(); notify(); return Promise.resolve(); },
          delete: function(){ delete data[coll][id]; save(); notify(); return Promise.resolve(); }
        }; }
      };
    } };

    window.claude = { use: function(name){ return Promise.resolve(name === 'db' ? db : name === 'downloads' ? downloads : null); } };

    buildFooter({
      baseMsg: function(){ return 'Your data is saved in this browser only (cloud sync is not set up yet). Back it up now and then.'; },
      backup: function(){ return clone(data); },
      restore: function(obj){
        data = { shows: obj.shows, series: obj.series || {} };
        save(); notify();
        return Object.keys(data.shows).length + Object.keys(data.series).length;
      }
    });
  }

  // =====================================================================
  //  CLOUD MODE (Firebase Auth + Firestore)
  // =====================================================================
  function startCloud(){
    var resolveDb, ready = new Promise(function(r){ resolveDb = r; });
    window.claude = { use: function(name){ return name === 'db' ? ready : Promise.resolve(name === 'downloads' ? downloads : null); } };

    var gateEl = null;
    function showGate(title, text, btnLabel, onClick, withInput){
      if (!gateEl){ gateEl = document.createElement('div'); gateEl.className = 'gscgate'; document.body.appendChild(gateEl); }
      gateEl.hidden = false;
      gateEl.innerHTML = '<div class="gscgate-card"><div class="eyebrow">Gehret Sheep Co · Weigh Breaks</div><h2></h2><p></p>' +
        (withInput ? '<input id="gatePass" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" placeholder="Passcode" style="width:100%;box-sizing:border-box;padding:12px;font-size:16px;text-align:center;border:1px solid #bbb;border-radius:8px;margin:0 0 12px">' : '') +
        (btnLabel ? '<button class="btn" id="gateBtn"></button>' : '') + '<div class="gatemsg" id="gateMsg"></div></div>';
      gateEl.querySelector('h2').textContent = title;
      gateEl.querySelector('p').textContent = text;
      if (btnLabel){ var b = gateEl.querySelector('#gateBtn'); b.textContent = btnLabel; b.addEventListener('click', onClick); }
      var pi = gateEl.querySelector('#gatePass');
      if (pi){ pi.addEventListener('keydown', function(e){ if (e.key === 'Enter') onClick(); }); setTimeout(function(){ pi.focus(); }, 50); }
    }
    function gateMsg(t){ var m = document.getElementById('gateMsg'); if (m) m.textContent = t; }
    function hideGate(){ if (gateEl) gateEl.hidden = true; }

    (async function boot(){
      var base = 'https://www.gstatic.com/firebasejs/' + FB_VERSION + '/';
      var appM, fsM, authM;
      try {
        showGate('Connecting…', 'Loading your synced weigh breaks.');
        var mods = await Promise.all([ import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js'), import(base + 'firebase-auth.js') ]);
        appM = mods[0]; fsM = mods[1]; authM = mods[2];
      } catch (e){
        showGate('Can’t reach Firebase', 'Check your internet connection and reload the page.');
        return;
      }

      var app = appM.initializeApp(cfg);
      var auth = authM.getAuth(app);
      var firestore;
      try {
        firestore = fsM.initializeFirestore(app, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) });
      } catch (e){ firestore = fsM.getFirestore(app); }

      var db = { collection: function(c){
        var col = fsM.collection(firestore, c);
        return {
          where: function(f, op, v){ var q = fsM.query(col, fsM.where(f, op, v)); return { onSnapshot: function(cb, err){ return fsM.onSnapshot(q, cb, function(e){ pillState.error = true; renderPill(); if (err) err(e); }); } }; },
          onSnapshot: function(cb, err){ return fsM.onSnapshot(col, cb, function(e){ pillState.error = true; renderPill(); if (err) err(e); }); },
          add: function(d){ return trackWrite(fsM.addDoc(col, d)); },
          doc: function(id){ var ref = fsM.doc(firestore, c, id); return { set: function(d){ return trackWrite(fsM.setDoc(ref, d)); }, delete: function(){ return trackWrite(fsM.deleteDoc(ref)); } }; }
        };
      } };

      async function backup(){
        var out = { shows: {}, series: {} };
        for (var c in out){
          var s = await fsM.getDocs(fsM.collection(firestore, c));
          s.forEach(function(d){ out[c][d.id] = d.data(); });
        }
        return out;
      }
      async function restore(obj){
        var items = [];
        ['shows', 'series'].forEach(function(c){ Object.keys(obj[c] || {}).forEach(function(id){ items.push([c, id, obj[c][id]]); }); });
        for (var i = 0; i < items.length; i += 400){
          var b = fsM.writeBatch(firestore);
          items.slice(i, i + 400).forEach(function(it){ b.set(fsM.doc(firestore, it[0], it[1]), it[2]); });
          await trackWrite(b.commit());
        }
        return items.length;
      }

      // First sign-in on a new project: load the starting NAILE / Ohio State Fair data once.
      async function ensureSeed(){
        var flag = fsM.doc(firestore, 'meta', 'seeded');
        var snap = await fsM.getDoc(flag);
        if (!snap.exists()){
          var shows = (window.GSC_SEED || {}).shows || {};
          var b = fsM.writeBatch(firestore);
          Object.keys(shows).forEach(function(id){ b.set(fsM.doc(firestore, 'shows', id), shows[id]); });
          b.set(flag, { at: Date.now() });
          await b.commit();
        }
        // later additions (e.g. Clark County 2026), loaded once each
        var extras = (window.GSC_SEED || {}).extras || [];
        for (var i = 0; i < extras.length; i++){
          var ex = extras[i], f = fsM.doc(firestore, 'meta', 'seed-' + ex.flag);
          var sn = await fsM.getDoc(f);
          if (sn.exists()) continue;
          var eb = fsM.writeBatch(firestore);
          Object.keys(ex.shows).forEach(function(id){ eb.set(fsM.doc(firestore, 'shows', id), ex.shows[id]); });
          eb.set(f, { at: Date.now() });
          await eb.commit();
        }
      }

      function doSignIn(){
        var pi = document.getElementById('gatePass');
        var code = pi ? pi.value : '';
        if (!code){ gateMsg('Enter the passcode.'); return; }
        gateMsg('Checking…');
        var b = document.getElementById('gateBtn'); if (b) b.disabled = true;
        authM.signInWithEmailAndPassword(auth, SYNC_EMAIL, code).catch(function(err){
          if (b) b.disabled = false;
          var c = err && err.code;
          if (c === 'auth/network-request-failed') gateMsg('No internet. Connect once to unlock this device; after that it stays unlocked.');
          else if (c === 'auth/too-many-requests') gateMsg('Too many tries. Wait a minute and try again.');
          else if (c === 'auth/operation-not-allowed') gateMsg('Passcode sign-in isn’t turned on in Firebase yet (Authentication > Sign-in method > Email/Password).');
          else gateMsg('Incorrect passcode. Try again.');
          if (pi){ pi.value = ''; pi.focus(); }
        });
      }
      function doSignOut(){ authM.signOut(auth).then(function(){ location.reload(); }); }

      var started = false;
      authM.onAuthStateChanged(auth, async function(user){
        if (!user){
          if (started){ location.reload(); return; }
          showGate('Enter passcode', 'Enter the passcode to unlock this device. You only need it once per device; your shows then stay in sync everywhere.', 'Unlock', doSignIn, true);
          return;
        }
        if (started) return;
        showGate('Checking access…', '');
        try { await ensureSeed(); }
        catch (err){
          if (err && err.code === 'permission-denied'){
            showGate('Not allowed', 'The passcode worked, but the Firestore rules are blocking access. Update the rules in Firebase (see README), then reload.', 'Lock & retry', doSignOut);
            return;
          }
          // offline or a temporary error: carry on, the app works from the local cache
        }
        started = true;
        hideGate();
        resolveDb(db);

        var footer = {
          baseMsg: function(){ return (navigator.onLine ? 'Synced to the cloud' : 'Offline: changes will sync when you reconnect') + '.'; },
          backup: backup, restore: restore, signOut: doSignOut
        };
        var legacy = null;
        try { legacy = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e){}
        if (legacy && legacy.shows && Object.keys(legacy.shows).length){
          footer.migrate = function(){ return restore(legacy).then(function(n){ try { localStorage.removeItem(LOCAL_KEY); } catch (e){} return n; }); };
        }
        renderPill();
        buildFooter(footer);
        function refresh(){ renderPill(); if (footer.onStatus) footer.onStatus(''); var m = document.getElementById('localMsg'); if (m && /^(Synced|Offline)/.test(m.textContent)) m.textContent = footer.baseMsg(); }
        window.addEventListener('online', refresh);
        window.addEventListener('offline', refresh);
      });
    })();
  }

  if (useCloud) startCloud(); else startLocal();
})();
