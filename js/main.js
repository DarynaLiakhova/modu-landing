(function () {
  'use strict';

  // A page opened without an #anchor always starts at the top, whatever scroll position the browser or an embedding frame remembered.
  if (!location.hash) {
    try { history.scrollRestoration = 'manual'; } catch (e) { /* not supported */ }
    var toTop = function () {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      var first = document.querySelector('.site-header');
      if (first && first.scrollIntoView) first.scrollIntoView({ block: 'start', behavior: 'instant' });
    };
    toTop();
    window.addEventListener('pageshow', toTop);
    window.addEventListener('load', toTop);
  }

  // Set the shop's address here; every email link on the site fills in from it.
  var CONTACT_EMAIL = '';
  // POST endpoint of the mailing service for the "Join MODU" form.
  var NEWSLETTER_ENDPOINT = '';
  // POST endpoint that receives orders as JSON. While it is empty, checkout runs in test mode and sends nothing.
  var ORDER_ENDPOINT = 'https://formspree.io/f/myekdeed';

  var PRODUCTS = {
    coffee: {
      name: 'Corner Coffee Shop', url: 'corner-coffee-shop.html', kind: 'Miniature · LED light', price: 45.99,
      img: 'img/card-1.jpg', poster: 'img/assembly-coffee-poster.jpg', posterAlt: 'Corner Coffee Shop kit in its open box, before assembly', video: 'video/assembly-coffee.mp4',
      keywords: 'cafe café book nook house led light london'
    },
    marble: {
      name: 'Marble Night City', url: 'marble-night-city.html', kind: 'Marble run · Mechanical', price: 55.49,
      img: 'img/card-2.jpg', poster: 'img/assembly-marble-poster.jpg', posterAlt: 'Marble Night City kit in its open box, before assembly', video: 'video/assembly-marble.mp4',
      keywords: 'marble run balls mechanical crank gears tracks'
    },
    carousel: {
      name: 'Romantic Carousel', url: 'romantic-carousel.html', kind: 'Music box · Wind-up', price: 31.57,
      img: 'img/card-3.jpg', poster: 'img/assembly-carousel-poster.jpg', posterAlt: 'Romantic Carousel kit in its open box, before assembly', video: 'video/assembly-carousel.mp4',
      keywords: 'music box musical horses waltz merry-go-round gift'
    }
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var on = function (el, ev, fn, opt) { if (el) el.addEventListener(ev, fn, opt); };
  var euro = function (n) { return '€ ' + n.toFixed(2); };
  var store = {
    get: function (k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  /* ---------- analytics ----------
     Google Analytics 4 starts only after the visitor accepts cookies in the bar at the bottom of the page.
     Paste the Measurement ID (looks like G-XXXXXXXXXX) into GA_ID. While it is empty there is no bar and nothing is sent. */
  var GA_ID = '';
  window.dataLayer = window.dataLayer || [];
  var pendingEvents = [], gaStarted = false;
  var consent = store.get('modu-consent', null);          // 'granted' | 'denied' | null (not asked yet)

  function startGA() {
    if (!GA_ID || gaStarted) return;
    gaStarted = true;
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    var s = document.createElement('script'); s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
    pendingEvents.forEach(function (e) { window.gtag('event', e[0], e[1]); });
    pendingEvents = [];
  }
  function track(event, data) {
    var payload = data || {};
    try {
      if (gaStarted) window.gtag('event', event, payload);
      else if (GA_ID && consent !== 'denied') pendingEvents.push([event, payload]);   // kept until the visitor decides
      if (typeof window.plausible === 'function') window.plausible(event, { props: payload });
    } catch (e) { /* analytics must never break the shop */ }
  }
  function showCookieBar() {
    if (document.querySelector('.cookie-bar')) return;
    var bar = document.createElement('div');
    bar.className = 'cookie-bar'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'Cookies');
    var text = document.createElement('p');
    text.textContent = 'We use Google Analytics cookies to count visits and clicks, so we know which kits people want. Nothing is switched on until you accept.';
    var actions = document.createElement('div'); actions.className = 'cookie-actions';
    var decide = function (value) {
      consent = value; store.set('modu-consent', value); bar.remove();
      if (value === 'granted') startGA(); else pendingEvents = [];
    };
    [['Decline', 'denied', 'btn btn-outline'], ['Accept', 'granted', 'btn btn-dark']].forEach(function (b) {
      var el = document.createElement('button'); el.type = 'button'; el.className = b[2]; el.textContent = b[0];
      el.addEventListener('click', function () { decide(b[1]); });
      actions.appendChild(el);
    });
    bar.appendChild(text); bar.appendChild(actions);
    document.body.appendChild(bar);
  }
  if (GA_ID) {
    if (consent === 'granted') startGA();
    else if (consent === null) showCookieBar();
    var foot = document.querySelector('.footer-bottom');
    if (foot) {
      var again = document.createElement('button'); again.type = 'button'; again.className = 'cookie-again'; again.textContent = 'Cookie settings';
      again.addEventListener('click', showCookieBar);
      foot.appendChild(again);
    }
  }
  function itemData(id, qty) {
    var p = PRODUCTS[id];
    return { item_id: id, item_name: p.name, price: p.price, quantity: qty || 1, currency: 'EUR', value: p.price * (qty || 1) };
  }

  /* ---------- cart ---------- */
  var cart = store.get('modu-cart', {});
  var cartDialog = $('[data-cart-dialog]');

  function renderCart() {
    var count = 0, total = 0, lines = $('[data-cart-lines]');
    if (!lines) return;
    lines.textContent = '';
    Object.keys(cart).forEach(function (id) {
      var p = PRODUCTS[id], qty = cart[id];
      if (!p || !qty) return;
      count += qty; total += qty * p.price;
      var li = document.createElement('li');
      var img = document.createElement('img'); img.src = p.img; img.alt = ''; img.width = 72;
      var info = document.createElement('div');
      var name = document.createElement('a'); name.href = p.url; name.textContent = p.name; name.className = 'cart-name';
      var meta = document.createElement('div'); meta.textContent = qty + ' × ' + euro(p.price);
      var rm = document.createElement('button'); rm.type = 'button'; rm.textContent = 'Remove';
      rm.addEventListener('click', function () { delete cart[id]; store.set('modu-cart', cart); renderCart(); });
      info.appendChild(name); info.appendChild(meta);
      li.appendChild(img); li.appendChild(info); li.appendChild(rm);
      lines.appendChild(li);
    });
    $$('[data-cart-count]').forEach(function (c) { c.textContent = count; });
    $('[data-cart-empty]').hidden = count > 0;
    $('[data-cart-total-row]').hidden = count === 0;
    $('[data-cart-total]').textContent = euro(total);
    var co = $('[data-cart-checkout]'); if (co) co.hidden = count === 0;
  }
  function addToCart(id, btn, qty) {
    cart[id] = (cart[id] || 0) + (qty || 1); store.set('modu-cart', cart); renderCart();
    track('add_to_cart', itemData(id, qty));
    if (btn) { btn.classList.add('is-added'); setTimeout(function () { btn.classList.remove('is-added'); }, 900); }
  }
  $$('[data-add]').forEach(function (b) { b.addEventListener('click', function () { addToCart(b.dataset.add, b); }); });
  on($('[data-cart-open]'), 'click', function () { cartDialog.showModal(); });

  /* ---------- dialogs ---------- */
  $$('dialog').forEach(function (d) {
    on($('[data-dialog-close]', d), 'click', function () { d.close(); });
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
  });

  /* ---------- header: stays on screen, gets a solid background after the first scroll ---------- */
  var siteHeader = $('.site-header');
  var paintHeader = function () { siteHeader.classList.toggle('is-stuck', window.scrollY > 24); };
  if (siteHeader) { window.addEventListener('scroll', paintHeader, { passive: true }); window.addEventListener('pageshow', paintHeader); paintHeader(); }

  /* ---------- header: menu and search ---------- */
  var nav = $('#nav'), menuBtn = $('[data-menu-toggle]');
  on(menuBtn, 'click', function () {
    var open = nav.classList.toggle('is-open');
    menuBtn.setAttribute('aria-expanded', open);
  });
  on(nav, 'click', function (e) {
    if (e.target.tagName === 'A') { nav.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  });

  var search = $('[data-search]'), searchInput = $('#search-input'), searchResult = $('[data-search-result]'), searchLabel = $('[data-search-label]');
  var searchToggle = $('[data-search-toggle]');
  function renderSearch() {
    var raw = searchInput.value.trim(), q = raw.toLowerCase();
    var hits = Object.keys(PRODUCTS).filter(function (id) {
      var p = PRODUCTS[id];
      return !q || (p.name + ' ' + p.kind + ' ' + p.keywords).toLowerCase().indexOf(q) !== -1;
    });
    searchLabel.textContent = !q ? 'All kits' : hits.length ? hits.length + (hits.length === 1 ? ' kit found' : ' kits found') : 'No kit matches “' + raw + '”. Try coffee, marble or carousel.';
    searchResult.textContent = '';
    hits.forEach(function (id) {
      var p = PRODUCTS[id], li = document.createElement('li'), a = document.createElement('a');
      a.href = p.url;
      var img = document.createElement('img'); img.src = p.img; img.alt = '';
      var text = document.createElement('span'); text.className = 'search-text';
      var name = document.createElement('strong'); name.textContent = p.name;
      var kind = document.createElement('span'); kind.textContent = p.kind;
      var price = document.createElement('span'); price.className = 'price'; price.textContent = euro(p.price);
      text.appendChild(name); text.appendChild(kind);
      a.appendChild(img); a.appendChild(text); a.appendChild(price);
      li.appendChild(a); searchResult.appendChild(li);
    });
  }
  function setSearch(open) {
    search.hidden = !open;
    searchToggle.setAttribute('aria-expanded', open);
    if (open) { renderSearch(); searchInput.focus(); }
  }
  on(searchToggle, 'click', function () { setSearch(search.hidden); });
  on($('[data-search-close]'), 'click', function () { setSearch(false); searchToggle.focus(); });
  on(search, 'submit', function (e) {
    e.preventDefault();
    var first = $('a', searchResult); if (first) location.href = first.getAttribute('href');
  });
  on(searchInput, 'input', renderSearch);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && search && !search.hidden) { setSearch(false); searchToggle.focus(); } });
  document.addEventListener('click', function (e) {
    if (search && !search.hidden && !search.contains(e.target) && !searchToggle.contains(e.target)) setSearch(false);
  });

  /* ---------- home: building process slider ---------- */
  var proc = $('[data-process]');
  if (proc) {
    var slides = $$('.process-slide', proc), dots = $$('[data-process-dot]', proc), procIndex = 0;
    var showSlide = function (i) {
      procIndex = (i + slides.length) % slides.length;
      slides.forEach(function (s, n) {
        var active = n === procIndex;
        s.classList.toggle('is-active', active);
        if (active) s.removeAttribute('inert'); else s.setAttribute('inert', '');
      });
      dots.forEach(function (d, n) { d.setAttribute('aria-current', n === procIndex); });
      $('[data-process-current]', proc).textContent = '0' + (procIndex + 1);
    };
    on($('[data-process-prev]', proc), 'click', function () { showSlide(procIndex - 1); });
    on($('[data-process-next]', proc), 'click', function () { showSlide(procIndex + 1); });
    dots.forEach(function (d, n) { d.addEventListener('click', function () { showSlide(n); }); });
    proc.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') showSlide(procIndex - 1);
      if (e.key === 'ArrowRight') showSlide(procIndex + 1);
    });
    var touchX = null;
    proc.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    proc.addEventListener('touchend', function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX; touchX = null;
      if (Math.abs(dx) > 50) showSlide(procIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  /* ---------- home: assembly player ---------- */
  var poster = $('[data-player-poster]'), video = $('[data-player-video]'), playNote = $('[data-play-note]'), model = 'coffee';
  if (poster) {
    $$('.model-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        model = t.dataset.model;
        var p = PRODUCTS[model];
        $$('.model-tab').forEach(function (o) { o.setAttribute('aria-selected', o === t); });
        video.pause(); video.hidden = true; poster.hidden = false;
        poster.src = p.poster; poster.alt = p.posterAlt;
        playNote.hidden = true;
      });
    });
    var playBtn = $('[data-play]'), playIcon = $('[data-play-icon]'), playLabel = $('[data-play-label]'), replayBtn = $('[data-replay]');
    var setButton = function () {
      var started = !video.hidden, playing = started && !video.paused;
      playIcon.setAttribute('href', playing ? '#i-pause' : '#i-play');
      playLabel.textContent = playing ? 'Pause' : (started ? 'Resume' : 'Play assembly');
      playBtn.setAttribute('aria-pressed', playing);
      replayBtn.hidden = !started;
    };
    ['play', 'pause', 'ended'].forEach(function (ev) { video.addEventListener(ev, setButton); });
    $$('.model-tab').forEach(function (t) { t.addEventListener('click', function () { video.removeAttribute('src'); video.load(); setButton(); }); });
    on(playBtn, 'click', function () {
      var p = PRODUCTS[model];
      if (!video.hidden) { if (video.paused) video.play().catch(function () {}); else video.pause(); return; }
      if (!p.video) {
        playNote.textContent = 'The assembly film for ' + p.name + ' is on its way.';
        playNote.hidden = false;
        return;
      }
      video.src = (video.canPlayType('video/mp4; codecs="avc1.42E01E"') ? p.video : p.video.replace(/\.mp4$/, '.webm')); video.poster = p.poster;
      poster.hidden = true; video.hidden = false;
      video.play().catch(function () { /* the visible controls start it instead */ });
      setButton();
    });
    on(replayBtn, 'click', function () { video.currentTime = 0; video.play().catch(function () {}); });
  }

  /* ---------- home: reviews slider ---------- */
  var reviewsTrack = $('[data-reviews-track]');
  function slideReviews(dir) {
    var card = reviewsTrack.firstElementChild; if (!card) return;
    reviewsTrack.scrollBy({ left: dir * (card.getBoundingClientRect().width + 22), behavior: 'smooth' });
  }
  on($('[data-reviews-prev]'), 'click', function () { slideReviews(-1); });
  on($('[data-reviews-next]'), 'click', function () { slideReviews(1); });

  /* ---------- accordions: one answer open at a time ---------- */
  $$('[data-accordion]').forEach(function (group) {
    var items = $$('details', group);
    items.forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (d.open) items.forEach(function (o) { if (o !== d) o.open = false; });
      });
    });
  });

  /* ---------- newsletter ---------- */
  var join = $('[data-join]');
  if (join) {
    var joinField = $('[data-join-field]'), joinNote = $('[data-join-note]'), joinEmail = $('#join-email');
    join.addEventListener('submit', function (e) {
      e.preventDefault();
      if (joinField.hidden) { joinField.hidden = false; joinEmail.focus(); return; }
      if (!joinEmail.checkValidity()) { joinNote.textContent = 'Enter a valid email address, like name@example.com.'; joinEmail.focus(); return; }
      if (!NEWSLETTER_ENDPOINT) { joinNote.textContent = 'Sign-up opens soon. Your address was not saved.'; return; }
      fetch(NEWSLETTER_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: joinEmail.value }) })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          joinNote.textContent = 'You are on the list. The next release reaches you first.';
          join.reset();
        })
        .catch(function () { joinNote.textContent = 'That did not go through. Try again in a minute.'; });
    });
  }

  /* ---------- product page ---------- */
  var productId = document.body.dataset.product;
  if (productId && PRODUCTS[productId]) {
    $$('[data-price]').forEach(function (el) { el.textContent = euro(PRODUCTS[el.dataset.price].price); });

    var mainImg = $('[data-gallery-main]'), thumbs = $$('[data-gallery-thumb]');
    thumbs.forEach(function (t) {
      t.addEventListener('click', function () {
        mainImg.src = t.dataset.full; mainImg.alt = t.dataset.alt;
        thumbs.forEach(function (o) { o.setAttribute('aria-current', o === t); });
      });
    });
    var zoom = $('[data-zoom-dialog]');
    on($('[data-zoom]'), 'click', function () {
      var z = $('img', zoom); z.src = mainImg.src; z.alt = mainImg.alt;
      zoom.showModal();
    });

    var qtyEl = $('[data-qty]'), qty = 1;
    var setQty = function (n) { qty = Math.max(1, Math.min(10, n)); qtyEl.textContent = qty; };
    on($('[data-qty-minus]'), 'click', function () { setQty(qty - 1); });
    on($('[data-qty-plus]'), 'click', function () { setQty(qty + 1); });
    on($('[data-add-main]'), 'click', function () { addToCart(productId, this, qty); cartDialog.showModal(); });
    on($('[data-buy-now]'), 'click', function () { addToCart(productId, null, qty); track('buy_now', itemData(productId, qty)); });  // the link itself opens the cart page
    track('view_item', itemData(productId, 1));
  }

  /* ---------- order lines (checkout summary and thank-you page) ---------- */
  function renderLines(list, items) {
    list.textContent = '';
    items.forEach(function (it) {
      var li = document.createElement('li');
      var img = document.createElement('img'); img.src = it.img; img.alt = ''; img.width = 72;
      var info = document.createElement('div');
      var name = document.createElement('strong'); name.textContent = it.name;
      var meta = document.createElement('div'); meta.textContent = it.qty + ' × ' + euro(it.price);
      var sum = document.createElement('span'); sum.textContent = euro(it.qty * it.price);
      info.appendChild(name); info.appendChild(meta);
      li.appendChild(img); li.appendChild(info); li.appendChild(sum);
      list.appendChild(li);
    });
  }
  function cartItems() {
    return Object.keys(cart).filter(function (id) { return PRODUCTS[id] && cart[id]; }).map(function (id) {
      var p = PRODUCTS[id];
      return { id: id, name: p.name, img: p.img, price: p.price, qty: cart[id] };
    });
  }
  function sumOf(items) { return items.reduce(function (s, it) { return s + it.qty * it.price; }, 0); }

  /* ---------- cart page: items, "Pay now", then the pre-launch email dialog ---------- */
  var checkout = $('[data-checkout]');
  if (checkout) {
    var pageLines = $('[data-page-lines]'), preDialog = $('[data-preorder-dialog]'), preForm = $('[data-preorder]');
    var orderNote = $('[data-order-note]'), placeBtn = $('[data-place-order]');
    var setQty = function (id, n) {
      if (n < 1) delete cart[id]; else cart[id] = Math.min(10, n);
      store.set('modu-cart', cart); renderCart(); renderPage();
    };
    var stepBtn = function (icon, label, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', label);
      b.innerHTML = '<svg class="ico"><use href="#' + icon + '"/></svg>';
      b.addEventListener('click', fn); return b;
    };
    var renderPage = function () {
      var items = cartItems(), count = items.reduce(function (s, it) { return s + it.qty; }, 0);
      $('[data-checkout-empty]').hidden = items.length > 0;
      checkout.hidden = items.length === 0;
      pageLines.textContent = '';
      items.forEach(function (it) {
        var li = document.createElement('li');
        var img = document.createElement('img'); img.src = it.img; img.alt = '';
        var info = document.createElement('div'); info.className = 'line-info';
        var name = document.createElement('a'); name.href = PRODUCTS[it.id].url; name.textContent = it.name; name.className = 'cart-name';
        var meta = document.createElement('span'); meta.textContent = PRODUCTS[it.id].kind + ' · ' + euro(it.price);
        info.appendChild(name); info.appendChild(meta);
        var qty = document.createElement('div'); qty.className = 'qty qty-sm'; qty.setAttribute('role', 'group'); qty.setAttribute('aria-label', 'Quantity of ' + it.name);
        var out = document.createElement('output'); out.textContent = it.qty;
        qty.appendChild(stepBtn('i-minus', 'One less', function () { setQty(it.id, it.qty - 1); }));
        qty.appendChild(out);
        qty.appendChild(stepBtn('i-plus', 'One more', function () { setQty(it.id, it.qty + 1); }));
        var sum = document.createElement('strong'); sum.textContent = euro(it.qty * it.price);
        var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'line-remove'; rm.textContent = 'Remove';
        rm.addEventListener('click', function () { setQty(it.id, 0); });
        li.appendChild(img); li.appendChild(info); li.appendChild(qty); li.appendChild(sum); li.appendChild(rm);
        pageLines.appendChild(li);
      });
      $('[data-page-count]').textContent = count;
      $('[data-summary-total]').textContent = euro(sumOf(items));
    };
    renderPage();
    if (cartItems().length) track('begin_checkout', { currency: 'EUR', value: sumOf(cartItems()), items: cartItems().length });

    on($('[data-pay]'), 'click', function () {
      var items = cartItems();
      track('pay_click', { currency: 'EUR', value: sumOf(items), items: items.map(function (it) { return it.name + ' × ' + it.qty; }).join(', ') });
      preDialog.showModal();
    });

    preForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!preForm.checkValidity()) { preForm.reportValidity(); return; }
      var items = cartItems(), email = $('#co-email').value.trim();
      var order = { date: new Date().toISOString(), items: items, total: sumOf(items), customer: { email: email }, sent: false };
      var finish = function () {
        track('preorder_signup', { currency: 'EUR', value: order.total });
        store.set('modu-last-order', order);
        cart = {}; store.set('modu-cart', cart);
        location.href = 'thank-you.html';
      };
      if (!ORDER_ENDPOINT) { finish(); return; }
      placeBtn.disabled = true; orderNote.textContent = 'Saving your place…';
      var message = { email: email, kits: items.map(function (it) { return it.name + ' × ' + it.qty; }).join(', '), total: euro(order.total), date: order.date };
      fetch(ORDER_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(message) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); order.sent = true; finish(); })
        .catch(function () {
          placeBtn.disabled = false;
          orderNote.textContent = 'That did not go through, so your email was not saved. Check your connection and try again.';
        });
    });
  }

  /* ---------- thank you ---------- */
  var thanks = $('[data-thanks]');
  if (thanks) {
    var last = store.get('modu-last-order', null);
    $('[data-thanks-none]').hidden = !!last;
    thanks.hidden = !last;
    if (last) {
      var c = last.customer || {};
      $('[data-order-email]').textContent = c.email || 'your email address';
      renderLines($('[data-order-lines]'), last.items);
      $('[data-order-total]').textContent = euro(last.total);
      $('[data-thanks-saved]').hidden = !last.sent;
      $('[data-thanks-unsaved]').hidden = !!last.sent;
    }
  }

  /* ---------- contact email ---------- */
  if (CONTACT_EMAIL) {
    $$('[data-email-inline]').forEach(function (el) { el.textContent = ' at ' + CONTACT_EMAIL; });
    $$('[data-email-link]').forEach(function (el) { el.textContent = CONTACT_EMAIL; el.href = 'mailto:' + CONTACT_EMAIL; });
    $$('[data-email-row]').forEach(function (el) { el.hidden = false; });
  }

  renderCart();
})();
