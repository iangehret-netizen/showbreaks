/* Data layer. Two modes, chosen automatically:
   - Cloud (Firebase): used when firebase-config.js has a real config. Google sign-in, shows sync
     across every device, and changes made offline sync when you reconnect.
   - Local: used while firebase-config.js still has the PASTE_ placeholders. Data stays in this browser.
   Either way it exposes window.claude.use('db' | 'downloads'), which the app already uses. */
(function(){
  "use strict";

  var FB_VERSION = '10.14.1';
  var LOCAL_KEY = 'gsc-weigh-breaks-v1';
  var cfg = window.FIREBASE_CONFIG || {};
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
        (opts.signOut ? '<button class="btn ghost" id="signOutBtn">Sign out</button>' : '') +
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
    function showGate(title, text, btnLabel, onClick){
      if (!gateEl){ gateEl = document.createElement('div'); gateEl.className = 'gscgate'; document.body.appendChild(gateEl); }
      gateEl.hidden = false;
      gateEl.innerHTML = '<div class="gscgate-card"><div class="eyebrow">Gehret Sheep Co · Weigh Breaks</div><h2></h2><p></p>' +
        (btnLabel ? '<button class="btn" id="gateBtn"></button>' : '') + '<div class="gatemsg" id="gateMsg"></div></div>';
      gateEl.querySelector('h2').textContent = title;
      gateEl.querySelector('p').textContent = text;
      if (btnLabel){ var b = gateEl.querySelector('#gateBtn'); b.textContent = btnLabel; b.addEventListener('click', onClick); }
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
          where: function(f, op, v){ var q = fsM.query(col, fsM.where(f, op, v)); return { onSnapshot: function(cb, err){ return fsM.onSnapshot(q, cb, err); } }; },
          onSnapshot: function(cb, err){ return fsM.onSnapshot(col, cb, err); },
          add: function(d){ return fsM.addDoc(col, d); },
          doc: function(id){ var ref = fsM.doc(firestore, c, id); return { set: function(d){ return fsM.setDoc(ref, d); }, delete: function(){ return fsM.deleteDoc(ref); } }; }
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
          await b.commit();
        }
        return items.length;
      }

      // First sign-in on a new project: load the starting NAILE / Ohio State Fair data once.
      async function ensureSeed(){
        var flag = fsM.doc(firestore, 'meta', 'seeded');
        var snap = await fsM.getDoc(flag);
        if (snap.exists()) return;
        var shows = (window.GSC_SEED || {}).shows || {};
        var ids = Object.keys(shows);
        var b = fsM.writeBatch(firestore);
        ids.forEach(function(id){ b.set(fsM.doc(firestore, 'shows', id), shows[id]); });
        b.set(flag, { at: Date.now() });
        await b.commit();
      }

      function doSignIn(){
        gateMsg('');
        var provider = new authM.GoogleAuthProvider();
        authM.signInWithPopup(auth, provider).catch(function(err){
          var code = err && err.code;
          if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment'){
            return authM.signInWithRedirect(auth, provider);
          }
          if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'){ gateMsg('Sign-in was cancelled.'); return; }
          if (code === 'auth/unauthorized-domain'){ gateMsg('This site’s address isn’t in Firebase > Authentication > Settings > Authorized domains yet.'); return; }
          gateMsg('Couldn’t sign in' + (code ? ' (' + code + ')' : '') + '.');
        });
      }
      function doSignOut(){ authM.signOut(auth).then(function(){ location.reload(); }); }

      var started = false;
      authM.onAuthStateChanged(auth, async function(user){
        if (!user){
          if (started){ location.reload(); return; }
          showGate('Sign in to sync', 'Sign in with the Google account approved for this app. Your shows then stay in sync on every device.', 'Sign in with Google', doSignIn);
          return;
        }
        if (started) return;
        showGate('Checking access…', '');
        try { await ensureSeed(); }
        catch (err){
          if (err && err.code === 'permission-denied'){
            showGate('Not allowed', user.email + ' isn’t on this app’s approved list. Sign in with a different Google account, or add this one to the Firestore rules.', 'Sign out', doSignOut);
            return;
          }
          // offline or a temporary error: carry on, the app works from the local cache
        }
        started = true;
        hideGate();
        resolveDb(db);

        var footer = {
          baseMsg: function(){ return (navigator.onLine ? 'Synced to the cloud' : 'Offline: changes will sync when you reconnect') + ' as ' + user.email + '.'; },
          backup: backup, restore: restore, signOut: doSignOut
        };
        var legacy = null;
        try { legacy = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e){}
        if (legacy && legacy.shows && Object.keys(legacy.shows).length){
          footer.migrate = function(){ return restore(legacy).then(function(n){ try { localStorage.removeItem(LOCAL_KEY); } catch (e){} return n; }); };
        }
        buildFooter(footer);
        function refresh(){ if (footer.onStatus) footer.onStatus(''); var m = document.getElementById('localMsg'); if (m && /^(Synced|Offline)/.test(m.textContent)) m.textContent = footer.baseMsg(); }
        window.addEventListener('online', refresh);
        window.addEventListener('offline', refresh);
      });
    })();
  }

  if (useCloud) startCloud(); else startLocal();
})();
