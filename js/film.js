(function () {
  'use strict';

  // Frame sets (AVIF). The master film has 359 frames; the desktop set keeps every 2nd,
  // the phone set keeps every 4th and is pre-cropped to portrait around each shot's subject.
  var DESKTOP = { dir: 'media/f/', count: 180 };
  var MOBILE = { dir: 'media/fm/', count: 90 };
  var MASTER = 359;

  var conn = navigator.connection || {};
  var lowData = conn.saveData || /(^|-)(2g|3g)$/.test(conn.effectiveType || '');
  var isMobile = window.matchMedia('(max-width: 700px)').matches || lowData;
  var set = isMobile ? MOBILE : DESKTOP;
  var N = set.count;
  var WINDOW = isMobile ? 10 : 12; // decoded bitmaps kept around the current frame

  // one entry per shot in the film (cut frames 0, 48, 108, 156, 228, 288 of the master)
  var STEPS = [
    { at: 0,   rail: 'Üretim',        title: 'Üretim',        desc: 'Pencere ve kapılar kendi fabrikamızda, üretim hattında hazırlanır ve kontrolden geçer.' },
    { at: 48,  rail: 'Yükleme',       title: 'Yükleme',       desc: 'Hazır ürünler koruyucu filmle sarılır ve özenle tırlara yüklenir.' },
    { at: 108, rail: 'Sevkiyat',      title: 'Sevkiyat',      desc: 'Kendi lojistik ekibimizle ürünler şantiyeye ulaştırılır.' },
    { at: 156, rail: 'Montaj',        title: 'Montaj',        desc: 'Ekibimiz pencereleri vinçle kata taşır ve açıklığa yerleştirir.' },
    { at: 228, rail: 'Hassas montaj', title: 'Hassas montaj', desc: 'Çerçeve su terazisiyle hizalanır, ankrajla sabitlenir, boşluklar köpükle yalıtılır.' },
    { at: 288, rail: 'Teslim',        title: 'Teslim',        desc: 'Proje tamamlanır, bina Diamond sistemleriyle teslim edilir.' }
  ];

  var film = document.getElementById('film');
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d', { alpha: false });
  var caption = document.getElementById('caption');
  var capTitle = document.getElementById('capTitle');
  var capDesc = document.getElementById('capDesc');
  var rail = document.getElementById('rail');
  var hint = document.getElementById('hint');
  var end = document.getElementById('filmEnd');
  var loader = document.getElementById('loader');
  var bar = document.getElementById('loaderBar');
  var txt = document.getElementById('loaderTxt');

  STEPS.forEach(function (s) {
    var li = document.createElement('li');
    li.textContent = s.rail;
    rail.appendChild(li);
  });
  var railItems = rail.children;

  var imgs = new Array(N);      // encoded images, filled by the loader
  var ready = new Array(N);     // true once an image has finished downloading
  var bmps = {};                // decoded ImageBitmaps for frames near the playhead
  var pending = {};
  var cur = 0, target = 0, drawn = -1;
  var stepIdx = -1;
  var dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.25);
  var running = false;

  function pad(n) { return ('0000' + n).slice(-4); }

  // ---------- drawing ----------
  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    drawn = -1;
    kick();
  }

  function pickSource(i) {
    if (bmps[i]) return bmps[i];
    if (ready[i]) return imgs[i];
    for (var k = 1; k < N; k++) {           // nearest frame that is already available
      var a = i - k, b = i + k;
      if (a >= 0 && (bmps[a] || ready[a])) return bmps[a] || imgs[a];
      if (b < N && (bmps[b] || ready[b])) return bmps[b] || imgs[b];
    }
    return null;
  }

  function draw(i) {
    var src = pickSource(i);
    if (!src) return false;
    var sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    var cw = canvas.width, ch = canvas.height;
    var s = Math.max(cw / sw, ch / sh);
    var dw = sw * s, dh = sh * s;
    ctx.drawImage(src, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    drawn = i;
    return true;
  }

  // keep decoded bitmaps only for frames near the playhead (memory + no decode jank)
  function ensureWindow(center) {
    for (var j = Math.max(0, center - WINDOW); j <= Math.min(N - 1, center + WINDOW); j++) {
      if (bmps[j] || pending[j] || !ready[j]) continue;
      (function (k) {
        pending[k] = true;
        createImageBitmap(imgs[k]).then(function (b) {
          pending[k] = false;
          if (Math.abs(k - Math.round(cur)) > WINDOW + 6) { b.close(); return; }
          bmps[k] = b;
          if (k === Math.round(cur)) { drawn = -1; kick(); }
        }, function () { pending[k] = false; });
      })(j);
    }
    for (var key in bmps) {
      if (Math.abs(+key - center) > WINDOW + 6) { bmps[key].close(); delete bmps[key]; }
    }
  }

  // ---------- scroll to frame ----------
  function progress() {
    var r = film.getBoundingClientRect();
    var total = film.offsetHeight - window.innerHeight;
    return Math.max(0, Math.min(1, -r.top / total));
  }

  function setStep(p) {
    var f = p * (MASTER - 1);
    var idx = 0;
    for (var i = 0; i < STEPS.length; i++) if (f >= STEPS[i].at) idx = i;
    if (idx === stepIdx) return;
    var first = stepIdx === -1;
    stepIdx = idx;
    for (var j = 0; j < railItems.length; j++) {
      railItems[j].className = j < idx ? 'past' : (j === idx ? 'active' : '');
    }
    function apply() {
      capTitle.textContent = STEPS[idx].title;
      capDesc.textContent = STEPS[idx].desc;
      caption.classList.remove('swap');
    }
    if (first) { apply(); return; }
    caption.classList.add('swap');
    setTimeout(apply, 260);
  }

  // The loop only runs while something is moving; it stops by itself when idle.
  function kick() {
    if (running) return;
    running = true;
    requestAnimationFrame(tick);
  }

  function tick() {
    var p = progress();
    target = p * (N - 1);
    cur += (target - cur) * 0.2;
    if (Math.abs(target - cur) < 0.02) cur = target;
    var i = Math.round(cur);
    ensureWindow(i);
    if (i !== drawn) draw(i);

    setStep(p);
    hint.style.opacity = p > 0.02 ? '0' : '1';
    var e = Math.max(0, Math.min(1, (p - 0.915) / 0.06));
    end.style.opacity = e;
    end.classList.toggle('on', e > 0.5);
    var fade = e > 0 ? String(Math.max(0, 1 - e * 1.8)) : '1';
    caption.style.opacity = fade;
    rail.style.opacity = fade;

    if (cur !== target || drawn !== i) requestAnimationFrame(tick);
    else running = false;
  }

  // ---------- loading ----------
  var gateTarget = 0, gateLoaded = 0, totalLoaded = 0, opened = false;

  function finishLoad() {
    if (opened) return;
    opened = true;
    loader.classList.add('done');
    document.documentElement.style.overflow = '';
    drawn = -1;
    kick();
  }

  function loadOne(i, isGate, done) {
    var im = new Image();
    im.decoding = 'async';
    im.onload = function () {
      var fin = function () {
        ready[i] = true; totalLoaded++;
        if (isGate) {
          gateLoaded++;
          var pct = Math.round((gateLoaded / gateTarget) * 100);
          bar.style.width = pct + '%';
          txt.textContent = 'Yükleniyor ' + pct + '%';
          if (gateLoaded === 1) resize();
          if (gateLoaded >= gateTarget) finishLoad();
        }
        if (i === Math.round(cur)) { drawn = -1; }
        kick();
        done();
      };
      fin(); // decoding happens off-thread later, only for frames near the playhead (createImageBitmap)
    };
    im.onerror = function () { if (isGate) { gateLoaded++; if (gateLoaded >= gateTarget) finishLoad(); } done(); };
    im.src = set.dir + pad(i + 1) + '.avif';
    imgs[i] = im;
  }

  // order: every 4th frame first (so scrubbing works everywhere), then 2nd, then the rest
  var order = [], coarse = 0, k;
  for (k = 0; k < N; k += 4) { order.push(k); coarse++; }
  for (k = 2; k < N; k += 4) order.push(k);
  for (k = 1; k < N; k += 2) order.push(k);
  gateTarget = coarse;

  document.documentElement.style.overflow = 'hidden';
  var CONC = 6, pos = 0;
  function pump() {
    while (pos < order.length && CONC > 0) {
      var idx = order[pos], gate = pos < coarse;
      pos++; CONC--;
      loadOne(idx, gate, function () { CONC++; pump(); });
    }
  }
  pump();
  // never trap the visitor behind the loader
  setTimeout(finishLoad, 20000);

  window.addEventListener('resize', resize);
  window.addEventListener('load', resize);
  window.addEventListener('scroll', kick, { passive: true });
  kick();

  // ---------- page behaviour ----------
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 }) : null;
  document.querySelectorAll('.reveal').forEach(function (el, n) {
    el.style.transitionDelay = ((n % 4) * 70) + 'ms';
    if (io) io.observe(el); else el.classList.add('in');
  });

  var cio = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target, to = +el.getAttribute('data-to'), t0 = performance.now(), dur = 1500;
      var plus = el.getAttribute('data-plus'), pct = el.getAttribute('data-pct');
      (function step(t) {
        var kk = Math.min(1, (t - t0) / dur);
        var v = Math.round(to * (1 - Math.pow(1 - kk, 3)));
        el.textContent = (pct ? '%' : '') + v + (plus && kk === 1 ? '+' : '');
        if (kk < 1) requestAnimationFrame(step);
      })(t0);
      cio.unobserve(el);
    });
  }, { threshold: 0.6 }) : null;
  document.querySelectorAll('[data-to]').forEach(function (el) {
    if (cio) cio.observe(el); else el.textContent = el.getAttribute('data-to');
  });

  // contact form: opens WhatsApp with the message prepared (no server involved)
  var form = document.getElementById('form');
  var note = document.getElementById('formNote');
  if (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = form.elements;
      var bad = [];
      ['ad', 'tel'].forEach(function (n) {
        var ok = f[n].value.trim().length > 1;
        f[n].classList.toggle('invalid', !ok);
        if (!ok) bad.push(n);
      });
      if (!f.kvkk.checked) bad.push('kvkk');
      if (bad.length) {
        note.className = 'form-note err';
        note.textContent = bad.indexOf('kvkk') > -1 && bad.length === 1
          ? 'Devam etmek için onay kutusunu işaretleyin.'
          : 'Lütfen ad soyad ve telefon alanlarını doldurun.';
        return;
      }
      var lines = [
        'Merhaba, Diamond Pencere Sistemleri web sitesinden teklif istiyorum.',
        'Ad soyad: ' + f.ad.value.trim(),
        'Telefon: ' + f.tel.value.trim(),
        f.mail.value.trim() ? 'E-posta: ' + f.mail.value.trim() : '',
        'Proje türü: ' + f.proje.value,
        'Ürün: ' + f.urun.value,
        f.mesaj.value.trim() ? 'Mesaj: ' + f.mesaj.value.trim() : ''
      ].filter(Boolean).join('\n');
      var url = 'https://api.whatsapp.com/send?phone=905332725941&text=' + encodeURIComponent(lines);
      note.className = 'form-note ok';
      note.textContent = 'Teşekkürler. Mesajınız WhatsApp\'ta hazır, göndermeniz yeterli.';
      window.open(url, '_blank', 'noopener');
    });
    form.addEventListener('input', function (e) {
      if (e.target.classList) e.target.classList.remove('invalid');
    });
  }
})();
