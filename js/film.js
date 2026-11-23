(function () {
  'use strict';

  var DESKTOP = { dir: 'media/d/', count: 359 };
  var MOBILE = { dir: 'media/m/', count: 180 }; // every second frame of the 359 frame master
  var isMobile = window.matchMedia('(max-width: 700px)').matches;
  var set = isMobile ? MOBILE : DESKTOP;
  var N = set.count;
  var MASTER = 359;

  // one entry per shot in the film (cut frames 0, 48, 108, 156, 228, 288 of the master)
  var STEPS = [
    { fx: 0.36, at: 0,   rail: 'Üretim',        title: 'Üretim',        desc: 'Pencere ve kapılar kendi fabrikamızda, üretim hattında hazırlanır ve kontrolden geçer.' },
    { fx: 0.55, at: 48,  rail: 'Yükleme',       title: 'Yükleme',       desc: 'Hazır ürünler koruyucu filmle sarılır ve özenle tırlara yüklenir.' },
    { fx: 0.40, at: 108, rail: 'Sevkiyat',      title: 'Sevkiyat',      desc: 'Kendi lojistik ekibimizle ürünler şantiyeye ulaştırılır.' },
    { fx: 0.72, at: 156, rail: 'Montaj',        title: 'Montaj',        desc: 'Ekibimiz pencereleri vinçle kata taşır ve açıklığa yerleştirir.' },
    { fx: 0.28, at: 228, rail: 'Hassas montaj', title: 'Hassas montaj', desc: 'Çerçeve su terazisiyle hizalanır, ankrajla sabitlenir, boşluklar köpükle yalıtılır.' },
    { fx: 0.50, at: 288, rail: 'Teslim',        title: 'Teslim',        desc: 'Proje tamamlanır, bina Diamond sistemleriyle teslim edilir.' }
  ];

  var film = document.getElementById('film');
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  var caption = document.getElementById('caption');
  var capTitle = document.getElementById('capTitle');
  var capDesc = document.getElementById('capDesc');
  var rail = document.getElementById('rail');
  var hint = document.getElementById('hint');
  var end = document.getElementById('filmEnd');
  var loader = document.getElementById('loader');
  var bar = document.getElementById('loaderBar');
  var txt = document.getElementById('loaderTxt');

  // build step rail
  STEPS.forEach(function (s) {
    var li = document.createElement('li');
    li.textContent = s.rail;
    rail.appendChild(li);
  });
  var railItems = rail.children;

  var imgs = new Array(N);
  var loaded = 0;
  var cur = 0, target = 0, drawn = -1;
  var stepIdx = -1;
  var focus = 0.5; // horizontal crop focus, matters on tall (phone) screens
  var dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75);

  function pad(n) { return ('0000' + n).slice(-4); }

  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    drawn = -1;
    draw(Math.round(cur));
  }

  function draw(i) {
    var im = imgs[i];
    if (!im || !im.complete || !im.naturalWidth) {
      im = null;
      for (var k = 1; k < N; k++) {
        var a = imgs[i - k], b = imgs[i + k];
        if (a && a.complete && a.naturalWidth) { im = a; break; }
        if (b && b.complete && b.naturalWidth) { im = b; break; }
      }
      if (!im) return;
    }
    var cw = canvas.width, ch = canvas.height;
    var s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight);
    var dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    ctx.drawImage(im, (cw - dw) * focus, (ch - dh) / 2, dw, dh);
    drawn = i;
  }

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

  function tick() {
    var p = progress();
    target = p * (N - 1);
    cur += (target - cur) * 0.16;
    if (Math.abs(target - cur) < 0.01) cur = target;
    var i = Math.round(cur);
    if (i !== drawn) draw(i);

    setStep(p);
    if (stepIdx > -1) {
      var tf = STEPS[stepIdx].fx;
      if (Math.abs(tf - focus) > 0.003) { focus += (tf - focus) * 0.1; drawn = -1; }
    }
    hint.style.opacity = p > 0.02 ? '0' : '1';

    var e = Math.max(0, Math.min(1, (p - 0.915) / 0.06));
    end.style.opacity = e;
    end.classList.toggle('on', e > 0.5);
    var fade = e > 0 ? String(Math.max(0, 1 - e * 1.8)) : '1';
    caption.style.opacity = fade;
    rail.style.opacity = fade;
    requestAnimationFrame(tick);
  }

  function finishLoad() {
    loader.classList.add('done');
    document.documentElement.style.overflow = '';
  }

  function onLoad() {
    loaded++;
    var pct = Math.round((loaded / N) * 100);
    bar.style.width = pct + '%';
    txt.textContent = 'Yükleniyor ' + pct + '%';
    if (loaded === 1) resize();
    // open the page once about a third of the frames are in; the rest keep loading
    // while the nearest loaded frame is drawn for anything not yet fetched
    if (loaded >= Math.ceil(N * 0.34) && !loader.classList.contains('done')) { draw(0); setTimeout(finishLoad, 150); }
    if (loaded >= N) draw(Math.round(cur));
  }

  document.documentElement.style.overflow = 'hidden';
  for (var i = 0; i < N; i++) {
    var im = new Image();
    im.decoding = 'async';
    im.onload = onLoad;
    im.onerror = onLoad;
    im.src = set.dir + pad(i + 1) + '.webp';
    imgs[i] = im;
  }
  // never trap the visitor behind the loader
  setTimeout(function () { if (!loader.classList.contains('done')) finishLoad(); }, 25000);

  window.addEventListener('resize', resize);
  window.addEventListener('load', resize);
  requestAnimationFrame(tick);

  // reveal on scroll
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 }) : null;
  document.querySelectorAll('.reveal').forEach(function (el, n) {
    el.style.transitionDelay = ((n % 4) * 70) + 'ms';
    if (io) io.observe(el); else el.classList.add('in');
  });

  // counters
  var cio = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target, to = +el.getAttribute('data-to'), t0 = performance.now(), dur = 1500;
      var plus = el.getAttribute('data-plus'), pct = el.getAttribute('data-pct');
      (function step(t) {
        var k = Math.min(1, (t - t0) / dur);
        var v = Math.round(to * (1 - Math.pow(1 - k, 3)));
        el.textContent = (pct ? '%' : '') + v + (plus && k === 1 ? '+' : '');
        if (k < 1) requestAnimationFrame(step);
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
