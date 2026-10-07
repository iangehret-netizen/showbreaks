/* Local storage layer: replaces the hosted database so the app runs as a plain static site
   (GitHub Pages). Data lives in this browser's localStorage. Use Backup / Restore (bottom of
   the page) to move data between browsers or devices. */
(function(){
  "use strict";
  var KEY = 'gsc-weigh-breaks-v1';
  var data = null, subs = [];

  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(data)); } catch(e){ console.warn('Could not save to this browser:', e); } }
  function load(){
    try { var raw = localStorage.getItem(KEY); if (raw) data = JSON.parse(raw); } catch(e){}
    if (!data || typeof data.shows !== 'object'){
      data = { shows: clone((window.GSC_SEED || {}).shows || {}), series: {} };
      save();
    }
    if (!data.series) data.series = {};
  }
  load();

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

  var db = {
    collection: function(coll){
      if (!data[coll]) data[coll] = {};
      return {
        where: function(field, op, value){
          var filt = function(d){ return d[field] === value; };
          return { onSnapshot: function(cb){ return subscribe(coll, filt, cb); } };
        },
        onSnapshot: function(cb){ return subscribe(coll, null, cb); },
        add: function(d){ var id = newId(); data[coll][id] = clone(d); save(); notify(); return Promise.resolve({ id: id }); },
        doc: function(id){
          return {
            set: function(d){ data[coll][id] = clone(d); save(); notify(); return Promise.resolve(); },
            delete: function(){ delete data[coll][id]; save(); notify(); return Promise.resolve(); }
          };
        }
      };
    }
  };

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

  window.claude = { use: function(name){
    return Promise.resolve(name === 'db' ? db : name === 'downloads' ? downloads : null);
  } };

  // ---- Backup / Restore footer ----
  var css = document.createElement('style');
  css.textContent = '.localfoot{margin-top:22px;padding-top:14px;border-top:1px solid #3a3a3a;display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:var(--on-dark-soft);font-size:.78rem}' +
    '.localfoot span.msg{flex:1 1 260px}.localfoot .btn{padding:7px 12px;font-size:.78rem}';
  document.head.appendChild(css);

  function buildFooter(){
    var wrap = document.querySelector('.wrap');
    if (!wrap) return;
    var f = document.createElement('div');
    f.className = 'localfoot';
    f.innerHTML = '<span class="msg" id="localMsg">Your data is saved in this browser only. Back it up now and then, and use Restore to load it on another device.</span>' +
      '<button class="btn ghost" id="backupBtn">Backup data</button>' +
      '<button class="btn ghost" id="restoreBtn">Restore backup</button>' +
      '<input type="file" id="restoreFile" accept="application/json,.json" hidden>';
    wrap.appendChild(f);
    var msg = document.getElementById('localMsg');
    document.getElementById('backupBtn').addEventListener('click', function(){
      var d = new Date(), stamp = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      downloads.save({ filename: 'gsc-weigh-breaks-backup-' + stamp + '.json', data: JSON.stringify(data, null, 1) })
        .then(function(){ msg.textContent = 'Backup downloaded.'; });
    });
    document.getElementById('restoreBtn').addEventListener('click', function(){ document.getElementById('restoreFile').click(); });
    document.getElementById('restoreFile').addEventListener('change', function(e){
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var r = new FileReader();
      r.onload = function(){
        try {
          var d = JSON.parse(r.result);
          if (!d || typeof d.shows !== 'object') throw new Error('not a backup file');
          data = { shows: d.shows, series: d.series || {} };
          save(); notify();
          msg.textContent = 'Backup restored: ' + Object.keys(data.shows).length + ' shows.';
        } catch (err){ msg.textContent = 'That file isn’t a valid backup.'; }
        e.target.value = '';
      };
      r.readAsText(file);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildFooter); else buildFooter();
})();
