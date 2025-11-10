// ===================== Produtos (carregados de JSON) =====================
// agora carregamos `assets/data/products.json` em tempo de execução
let produtos = [];

// ===================== Carrinho (LocalStorage) =====================
const CART_KEY = 'lojaTechCarrinho';
const THEME_KEY = 'lojaTechTheme';
const ITEMS_PER_PAGE = 10; // reduced by 2 as requested
let paginaAtual = 1;
// tempo (ms) até o qual cliques no document não fecham o painel (usado para evitar flicker)
let suppressPanelCloseUntil = 0;
// Ícone de PC (fallback) sem texto, como data URI
const PC_ICON_DATA_URI = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2" ry="2" fill="%23a6b0c2"/><rect x="9.5" y="18" width="5" height="1.6" fill="%23a6b0c2"/></svg>';
const COUNTRY_KEY = 'lojaTechCountry';

// Currency settings: rates are relative to BRL (base). Multiply BRL * rate => target currency
const CURRENCY_SETTINGS = {
  br: { code: 'BRL', locale: 'pt-BR', symbol: 'R$', rate: 1 },
  us: { code: 'USD', locale: 'en-US', symbol: '$', rate: 0.20 },
  eu: { code: 'EUR', locale: 'de-DE', symbol: '€', rate: 0.18 }
};

// Exchange rates cache (localStorage)
const RATES_CACHE_KEY = 'lojaTechRates';
const RATES_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function getCachedRates() {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.timestamp || !parsed.rates) return null;
    if (Date.now() - parsed.timestamp > RATES_TTL_MS) return null;
    return parsed.rates;
  } catch (e) { return null; }
}

// Carrega produtos de um arquivo JSON estático. Em caso de erro, deixa
// `produtos` como array vazio para que a UI mostre estado adequado.
async function loadProducts() {
  try {
    const res = await fetch('assets/data/products.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Network response not ok');
    const json = await res.json();
    if (Array.isArray(json)) produtos = json;
    else produtos = [];
  } catch (err) {
    console.error('Falha ao carregar produtos.json, usando lista vazia.', err);
    produtos = [];
  }
}

function saveCachedRates(rates) {
  try { localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), rates })); } catch (e) {}
}

async function fetchExchangeRates() {
  // if cached, use that
  const cached = getCachedRates();
  if (cached && typeof cached.USD === 'number' && typeof cached.EUR === 'number') {
    CURRENCY_SETTINGS.us.rate = cached.USD;
    CURRENCY_SETTINGS.eu.rate = cached.EUR;
    return;
  }
  try {
    const res = await fetch('https://api.exchangerate.host/latest?base=BRL&symbols=USD,EUR');
    if (!res.ok) throw new Error('Network response not ok');
    const json = await res.json();
    // expected json.rates = { USD: x, EUR: y }
    if (json && json.rates) {
      if (typeof json.rates.USD === 'number') CURRENCY_SETTINGS.us.rate = json.rates.USD;
      if (typeof json.rates.EUR === 'number') CURRENCY_SETTINGS.eu.rate = json.rates.EUR;
      saveCachedRates({ USD: json.rates.USD, EUR: json.rates.EUR });
    }
  } catch (err) {
    // fallback: keep default static rates
    console.warn('Exchange rate fetch failed, using cached/default rates.', err);
  }
}

// Small helper to escape text inserted into innerHTML
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function carregarPais() {
  try { return localStorage.getItem(COUNTRY_KEY) || 'br'; } catch { return 'br'; }
}
function salvarPais(c) { try { localStorage.setItem(COUNTRY_KEY, c); } catch {} }

/* Floating tooltip helpers: we create a single tooltip node appended to body
   and position it near the hovered/focused product title. This avoids the
   clipping that happens when using pseudo-elements inside cards with
   overflow:hidden. On touch devices the tooltip is disabled. */
let _floatingTooltipEl = null;
function _ensureFloatingTooltip() {
  if (_floatingTooltipEl) return _floatingTooltipEl;
  const el = document.createElement('div');
  el.className = 'floating-tooltip';
  el.style.display = 'none';
  document.body.appendChild(el);
  _floatingTooltipEl = el;
  return el;
}
function showFloatingTooltipForLink(link) {
  try {
    if (!link || ('ontouchstart' in window)) return;
    const text = link.dataset.fullname || link.getAttribute('aria-label') || link.textContent || '';
    if (!text) return;
    const el = _ensureFloatingTooltip();
    el.textContent = text;
    el.style.display = 'block';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';

    // initial left/top; we will adjust after measuring
    el.style.left = '0px';
    el.style.top = '0px';

    // measure and compute position
    const rect = link.getBoundingClientRect();
    const ttRect = el.getBoundingClientRect();
    const gap = 10;
    let left = rect.left + (rect.width / 2) - (ttRect.width / 2);
    const pad = 8;
    left = Math.max(pad, Math.min(window.innerWidth - ttRect.width - pad, left));
    let top = rect.top - ttRect.height - gap;
    if (top < pad) {
      // not enough room above, position below the link
      top = rect.bottom + gap;
    }
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';

    // animate in
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  } catch (e) { /* non-fatal */ }
}
function hideFloatingTooltip() {
  try {
    const el = _floatingTooltipEl;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => { if (el) el.style.display = 'none'; }, 160);
  } catch (e) {}
}

function formatCurrencyFromBRL(amountBRL) {
  const country = carregarPais();
  const s = CURRENCY_SETTINGS[country] || CURRENCY_SETTINGS.br;
  const converted = amountBRL * s.rate;
  const formatted = new Intl.NumberFormat(s.locale, { minimumFractionDigits:2, maximumFractionDigits:2 }).format(converted);
  return { symbol: s.symbol, formatted, locale: s.locale, code: s.code };
}
function obterCarrinho() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}
function salvarCarrinho(itens) { localStorage.setItem(CART_KEY, JSON.stringify(itens)); }

function adicionarAoCarrinho(produtoId) {
  const carrinho = obterCarrinho();
  const item = carrinho.find(p => p.id === produtoId);
  if (item) { item.qtd += 1; }
  else {
    const produto = produtos.find(p => p.id === produtoId);
    if (!produto) return;
    // store original price and discount in the cart item so totals use the discounted price
    carrinho.push({ id: produto.id, nome: produto.nome, preco: produto.preco, desconto: produto.desconto || 0, imagem: produto.imagem, qtd: 1 });
  }
  salvarCarrinho(carrinho);
  atualizarUICarrinho();
  atualizarPerfilCarrinho();
  // Abrir o painel após o evento de clique atual terminar para evitar
  // que o listener global de document (que fecha ao clicar fora) feche
  // imediatamente o painel quando o usuário clica em "Adicionar".
  // Suprimir temporariamente o fechamento por clique fora para evitar
  // que um listener no document remova a classe do toggle durante a
  // transição (causando flicker). O tempo de 300ms é suficiente.
  suppressPanelCloseUntil = Date.now() + 300;
  // Abrir o painel programaticamente e atrasar a troca do ícone para X
  // até que o painel esteja visível (evita X aparecendo antes da animação)
  setTimeout(() => abrirCarrinho({ delayToggle: true }), 50);
}

function removerDoCarrinho(produtoId) {
  // Animate the DOM node, but update totals immediately so the UI responds quickly.
  const listaEl = document.getElementById('cartItems');
  const li = listaEl ? listaEl.querySelector(`li[data-id="${produtoId}"]`) : null;

  // Update storage first so totals reflect the removal immediately
  let carrinho = obterCarrinho();
  const newCarrinho = carrinho.filter(p => p.id !== produtoId);
  salvarCarrinho(newCarrinho);

  // Update badge and total immediately from newCarrinho
  const countEl = document.getElementById('cartCount');
  if (countEl) countEl.textContent = newCarrinho.reduce((acc, i) => acc + i.qtd, 0);
  const totalEl = document.getElementById('cartTotal');
  if (totalEl) {
    const newTotal = newCarrinho.reduce((acc, i) => acc + (i.preco * (1 - (i.desconto || 0))) * i.qtd, 0);
    const ft = formatCurrencyFromBRL(newTotal);
    totalEl.textContent = ft.symbol + ' ' + ft.formatted;
  }

  if (li) {
    // Animate visual removal, then re-render to ensure DOM / event handlers are consistent
    animateThenRemove(li, () => {
      atualizarUICarrinho();
      atualizarPerfilCarrinho();
    });
    return;
  }

  // Fallback: if no DOM node found, just re-render
  atualizarUICarrinho();
  atualizarPerfilCarrinho();
}

function alterarQuantidade(produtoId, delta) {
  const carrinho = obterCarrinho();
  const item = carrinho.find(p => p.id === produtoId);
  if (!item) return;
  item.qtd += delta;
  if (item.qtd <= 0) {
    // Pre-update storage and totals so the UI shows the new total quickly
    const listaEl = document.getElementById('cartItems');
    const li = listaEl ? listaEl.querySelector(`li[data-id="${produtoId}"]`) : null;
    const newCarrinho = carrinho.filter(p => p.id !== produtoId);
    salvarCarrinho(newCarrinho);
    const countEl = document.getElementById('cartCount');
    if (countEl) countEl.textContent = newCarrinho.reduce((acc, i) => acc + i.qtd, 0);
    const totalEl = document.getElementById('cartTotal');
    if (totalEl) {
      const newTotal = newCarrinho.reduce((acc, i) => acc + (i.preco * (1 - (i.desconto || 0))) * i.qtd, 0);
      const ft = formatCurrencyFromBRL(newTotal);
      totalEl.textContent = ft.symbol + ' ' + ft.formatted;
    }
    if (li) {
      animateThenRemove(li, () => {
        atualizarUICarrinho();
        atualizarPerfilCarrinho();
      });
      return;
    }
  }
  salvarCarrinho(carrinho);
  atualizarUICarrinho();
  atualizarPerfilCarrinho();
}

function atualizarUICarrinho() {
  const carrinho = obterCarrinho();
  const countEl = document.getElementById('cartCount');
  if (countEl) countEl.textContent = carrinho.reduce((acc, i) => acc + i.qtd, 0);
  const lista = document.getElementById('cartItems');
  const totalEl = document.getElementById('cartTotal');
  if (!lista || !totalEl) return;
  lista.innerHTML = '';
  // If cart is empty, show friendly empty state and a zero total
  if (!carrinho || carrinho.length === 0) {
    // Use a richer empty-state with CTA back to the store
    lista.innerHTML = `
      <li class="cart-empty" role="status" aria-live="polite">
        <div class="empty-wrap">
          <p class="empty-icon" aria-hidden="true">🛒</p>
          <p class="empty-title">Seu carrinho está vazio</p>
          <p class="empty-sub">Adicione produtos na loja para começar.</p>
          <a href="index.html" class="btn continue-shopping" aria-label="Voltar à loja">Voltar à loja</a>
        </div>
      </li>`;
    const ft0 = formatCurrencyFromBRL(0);
    totalEl.textContent = ft0.symbol + ' ' + ft0.formatted;
    totalEl.classList.remove('gradient');
    return;
  }
  let total = 0;
  carrinho.forEach(item => {
    // attach data-id for animation targeting
    const unitBRL = item.preco * (1 - (item.desconto || 0));
    total += unitBRL * item.qtd;
    const li = document.createElement('li');
    li.className = 'cart-item';
    li.setAttribute('data-id', item.id);

    // Determina se existe imagem "real". Muitos produtos usam via.placeholder.com
    // com texto; nesses casos consideramos que não há imagem e mostramos o ícone de PC.
    const hasRealImage = item.imagem && !(/placeholder\.com/.test(item.imagem) || /\?text=/.test(item.imagem));
    const imgEl = document.createElement('img');
    imgEl.className = 'cart-thumb';
    imgEl.alt = item.nome;
    if (hasRealImage) {
      imgEl.src = item.imagem;
    } else {
      imgEl.src = PC_ICON_DATA_URI;
      imgEl.classList.add('fallback');
      imgEl.setAttribute('aria-hidden', 'true');
    }

    const info = document.createElement('div');
    info.className = 'cart-info';

    const name = document.createElement('span');
    name.className = 'cart-name';
    name.title = item.nome;
    name.textContent = item.nome;

    const controls = document.createElement('div');
    controls.className = 'cart-controls';
    const btnMinus = document.createElement('button');
    btnMinus.className = 'qtd-btn minus';
    btnMinus.setAttribute('data-id', item.id);
    btnMinus.setAttribute('aria-label', 'Diminuir quantidade');
    btnMinus.textContent = '-';
    const spanQtd = document.createElement('span');
    spanQtd.className = 'qtd';
    spanQtd.textContent = item.qtd;
    const btnPlus = document.createElement('button');
    btnPlus.className = 'qtd-btn plus';
    btnPlus.setAttribute('data-id', item.id);
    btnPlus.setAttribute('aria-label', 'Aumentar quantidade');
    btnPlus.textContent = '+';
    controls.appendChild(btnMinus);
    controls.appendChild(spanQtd);
    controls.appendChild(btnPlus);

    const priceWrap = document.createElement('div');
    priceWrap.className = 'cart-price-wrap';
    const itemUnitBRL = item.preco * (1 - (item.desconto || 0));
    const itemTotalBRL = itemUnitBRL * item.qtd;
    if (item.desconto && item.desconto > 0) {
      const oldPrice = document.createElement('span');
      oldPrice.className = 'cart-price-old';
      const fo = formatCurrencyFromBRL(item.preco);
      oldPrice.textContent = fo.symbol + ' ' + fo.formatted;
      priceWrap.appendChild(oldPrice);
    }
    const price = document.createElement('span');
    price.className = 'cart-price';
    const fp = formatCurrencyFromBRL(itemTotalBRL);
    price.textContent = fp.symbol + ' ' + fp.formatted;
    price.classList.add('gradient');
    priceWrap.appendChild(price);

    info.appendChild(name);
    info.appendChild(controls);
    info.appendChild(priceWrap);

    li.appendChild(imgEl);
    li.appendChild(info);
    lista.appendChild(li);
  });
  const ft = formatCurrencyFromBRL(total);
  totalEl.textContent = ft.symbol + ' ' + ft.formatted;
  // profile total styling
  totalEl.classList.add('gradient');
}

// Helper: add collapse animation to node, then call callback when animation ends
function animateThenRemove(node, callback) {
  if (!node) return callback && callback();
  const parent = node.parentElement;
  if (!parent) {
    // nothing to animate
    return callback && callback();
  }

  // FLIP: First, capture initial positions of all children
  const children = Array.from(parent.children);
  const firstRects = new Map();
  children.forEach(ch => firstRects.set(ch, ch.getBoundingClientRect()));

  // Play collapse on the removed node (visual black hole)
  node.classList.remove('collapse-out');
  // trigger reflow
  void node.offsetWidth;
  node.classList.add('collapse-out');

  // After a short delay (allow collapse to start), remove the node from DOM
  // then animate the remaining elements from their previous positions to new positions
    const collapseDuration = 240; // match CSS .collapse-out duration (ms)
    const slideDuration = 120; // ms used for siblings sliding
    const removeDelay = collapseDuration; // wait full collapse before removing
  setTimeout(() => {
    // remove node from DOM to compute final layout
    const idx = children.indexOf(node);
    if (idx !== -1) parent.removeChild(node);

    // capture final rects
    const remaining = Array.from(parent.children);
    const lastRects = new Map();
    remaining.forEach(ch => lastRects.set(ch, ch.getBoundingClientRect()));

    // apply invert transform to remaining nodes
    remaining.forEach(ch => {
      const first = firstRects.get(ch);
      const last = lastRects.get(ch);
      if (!first || !last) return;
      const dy = first.top - last.top;
      if (dy === 0) return;
      ch.style.transform = `translateY(${dy}px)`;
      ch.style.transition = 'transform 360ms cubic-bezier(.2,.9,.2,1)';
      // force reflow
      void ch.offsetWidth;
      // animate to natural position
      ch.style.transform = '';
    });

    // cleanup after animations finish
      const cleanupTimeout = collapseDuration + slideDuration + 80; // ensure both collapse and slide complete
    setTimeout(() => {
      remaining.forEach(ch => {
        ch.style.transition = '';
        ch.style.transform = '';
      });
      // finally call the callback so storage & totals update
      callback && callback();
    }, cleanupTimeout);
  }, removeDelay);
}

function atualizarPerfilCarrinho() {
  const list = document.getElementById('profileCartList');
  const totalEl = document.getElementById('profileCartTotal');
  if (!list || !totalEl) return; // Só na página de perfil
  const carrinho = obterCarrinho();
  list.innerHTML = '';
  let total = 0;
  carrinho.forEach(item => {
    const unit = item.preco * (1 - (item.desconto || 0));
    total += unit * item.qtd;
    const li = document.createElement('li');
    li.textContent = `${item.nome} x${item.qtd} — ${formatCurrencyFromBRL(unit).symbol} ${formatCurrencyFromBRL(unit).formatted}`;
    list.appendChild(li);
  });
  const ft = formatCurrencyFromBRL(total);
  totalEl.textContent = ft.symbol + ' ' + ft.formatted;
}

// ===================== Filtros e Renderização =====================
function inicializarFiltros() {
  const select = document.getElementById('categorySelect');
  if (!select) return;
  const categorias = ['Todas'].concat([...new Set(produtos.map(p => p.categoria))]);
  categorias.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat; select.appendChild(opt);
  });
}

function filtrarProdutos() {
  const termo = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const categoria = document.getElementById('categorySelect')?.value || 'Todas';
  const min = parseFloat(document.getElementById('minPrice')?.value || '0');
  const maxRaw = document.getElementById('maxPrice')?.value || '';
  const max = maxRaw === '' ? Infinity : parseFloat(maxRaw);

  return produtos.filter(p => {
    const nomeMatch = p.nome.toLowerCase().includes(termo);
    const catMatch = categoria === 'Todas' || p.categoria === categoria;
    const precoMatch = p.preco >= min && p.preco <= max;
    return nomeMatch && catMatch && precoMatch;
  });
}

function renderizarProdutos() {
  const container = document.getElementById('productsGrid');
  if (!container) return;
  container.innerHTML = '';
  const lista = filtrarProdutos();
  const total = lista.length;
  // atualizar contador de produtos no topo
  const countEl = document.getElementById('productsCount');
  if (countEl) {
    countEl.textContent = total === 1 ? '1 produto encontrado' : `${total} produtos encontrados`;
  }
  const inicio = (paginaAtual - 1) * ITEMS_PER_PAGE;
  const fim = Math.min(inicio + ITEMS_PER_PAGE, total);
  const pagina = lista.slice(inicio, fim);
  if (lista.length === 0) {
    container.innerHTML = '<p>Nenhum produto encontrado com os filtros atuais.</p>';
    renderizarPaginacao(0, 0);
    return;
  }
  pagina.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';
    // mark the card so we can style discounted products specially
    if (p.desconto && p.desconto > 0) card.classList.add('has-discount');

    // media wrapper (image or placeholder)
    const media = document.createElement('div');
    media.className = 'product-media';

    const hasRealImage = p.imagem && !(/placeholder\.com/.test(p.imagem) || /\?text=/.test(p.imagem));
    if (hasRealImage) {
      const img = document.createElement('img');
      img.src = p.imagem;
      img.alt = `Imagem de ${p.nome}`;
      img.loading = 'lazy';
      // link image to product detail
      const a = document.createElement('a'); a.href = `product.html?id=${encodeURIComponent(p.id)}`; a.className = 'product-link';
      a.appendChild(img);
      media.appendChild(a);
    } else {
      media.classList.add('placeholder');
      // PC icon in top-left
      const pc = document.createElement('img');
      pc.className = 'pc-icon';
      pc.src = PC_ICON_DATA_URI;
      pc.alt = '';
      pc.setAttribute('aria-hidden', 'true');
      media.appendChild(pc);
      // centered category badge
      const cat = document.createElement('div');
      cat.className = 'category-badge';
      cat.textContent = p.categoria;
      media.appendChild(cat);
    }

    const meta = document.createElement('div');
    meta.className = 'product-meta';
    meta.textContent = p.categoria;

    const title = document.createElement('h3');
    // title should link to product detail page
    const link = document.createElement('a'); link.href = `product.html?id=${encodeURIComponent(p.id)}`; link.className = 'product-link';
    // store the full name in a data attribute for the custom tooltip and for
    // accessibility via aria-label. We intentionally avoid setting `title`
    // so the native browser tooltip does not conflict with our styled popup.
    link.dataset.fullname = p.nome;
    link.setAttribute('aria-label', p.nome);
    link.textContent = p.nome;
    // show floating tooltip on hover/focus (disabled on touch devices)
    if (!('ontouchstart' in window)) {
      link.addEventListener('mouseenter', () => showFloatingTooltipForLink(link));
      link.addEventListener('mouseleave', hideFloatingTooltip);
      link.addEventListener('focus', () => showFloatingTooltipForLink(link));
      link.addEventListener('blur', hideFloatingTooltip);
    }
    title.appendChild(link);

    const price = document.createElement('div');
    price.className = 'price';
    // if product has discount, mark the price container so CSS can switch to column layout
    if (p.desconto && p.desconto > 0) price.classList.add('has-discount');
    // if product has discount, show original price small & struck then discounted price
    if (p.desconto && p.desconto > 0) {
      const old = document.createElement('span'); old.className = 'old-price';
      const fo = formatCurrencyFromBRL(p.preco);
      old.textContent = fo.symbol + ' ' + fo.formatted;
      price.appendChild(old);
      const discounted = p.preco * (1 - p.desconto);
      const f = formatCurrencyFromBRL(discounted);
      // wrap currency and amount so the symbol stays beside the amount even when
      // the price container is laid out in column for discounts
      const finalWrap = document.createElement('span'); finalWrap.className = 'final-price';
      const spanCur = document.createElement('span'); spanCur.className = 'currency'; spanCur.textContent = f.symbol;
      const spanAmt = document.createElement('span'); spanAmt.className = 'amount'; spanAmt.textContent = f.formatted; spanAmt.classList.add('gradient');
      finalWrap.appendChild(spanCur);
      finalWrap.appendChild(spanAmt);
      price.appendChild(finalWrap);
      // add small discount badge next to final price when applicable
      if (p.desconto && p.desconto > 0) {
        const pct = Math.round(p.desconto * 100);
        const badge = document.createElement('span');
        badge.className = 'discount-badge';
        badge.setAttribute('aria-hidden', 'false');
        badge.setAttribute('role', 'note');
        badge.setAttribute('aria-label', `Desconto ${pct} porcento`);
        const bText = document.createElement('span');
        bText.className = 'discount-badge-text';
        bText.textContent = `-${pct}%`;
        badge.appendChild(bText);
        // place badge directly after the final price so it sits inline with the amount
        finalWrap.appendChild(badge);
      }
    } else {
      const f = formatCurrencyFromBRL(p.preco);
      const finalWrap = document.createElement('span'); finalWrap.className = 'final-price';
      const spanCur = document.createElement('span'); spanCur.className = 'currency'; spanCur.textContent = f.symbol;
      const spanAmt = document.createElement('span'); spanAmt.className = 'amount'; spanAmt.textContent = f.formatted; spanAmt.classList.add('gradient');
      finalWrap.appendChild(spanCur);
      finalWrap.appendChild(spanAmt);
      price.appendChild(finalWrap);
      // no badge for full-price items
    }

    const btn = document.createElement('button');
    btn.className = 'btn-primary add-btn';
    btn.setAttribute('data-id', p.id);
    btn.textContent = 'Adicionar';

    card.appendChild(media);
    card.appendChild(meta);
    card.appendChild(title);
    card.appendChild(price);
    card.appendChild(btn);
    container.appendChild(card);
  });
  renderizarPaginacao(total, Math.ceil(total / ITEMS_PER_PAGE));
}

function limparFiltros() {
  const search = document.getElementById('searchInput');
  const cat = document.getElementById('categorySelect');
  const min = document.getElementById('minPrice');
  const max = document.getElementById('maxPrice');
  if (search) search.value = '';
  if (cat) cat.value = 'Todas';
  if (min) min.value = '';
  if (max) max.value = '';
  paginaAtual = 1;
  renderizarProdutos();
}

function renderizarPaginacao(total, totalPaginas) {
  const pag = document.getElementById('pagination');
  if (!pag) return;
  pag.innerHTML = '';
  if (totalPaginas <= 1) return;
  const addBtn = (label, page, active=false, disabled=false) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (active) b.classList.add('active');
    if (disabled) b.disabled = true;
    b.addEventListener('click', () => { paginaAtual = page; renderizarProdutos(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    pag.appendChild(b);
  };
  addBtn('«', Math.max(1, paginaAtual - 1), false, paginaAtual === 1);
  const start = Math.max(1, paginaAtual - 2);
  const end = Math.min(totalPaginas, start + 4);
  for (let i = start; i <= end; i++) addBtn(String(i), i, i === paginaAtual);
  addBtn('»', Math.min(totalPaginas, paginaAtual + 1), false, paginaAtual === totalPaginas);
}

// ===================== Eventos Globais =====================
function configurarEventosGlobais() {
  document.body.addEventListener('click', e => {
    if (e.target.matches('.add-btn')) {
      const id = parseInt(e.target.getAttribute('data-id')); adicionarAoCarrinho(id);
      e.target.textContent = 'Adicionado';
      e.target.classList.add('btn-press');
      e.target.addEventListener('animationend', () => e.target.classList.remove('btn-press'), { once: true });
      setTimeout(() => e.target.textContent = 'Adicionar', 1200);
    }
    if (e.target.matches('.remove-item')) {
      const id = parseInt(e.target.getAttribute('data-id')); removerDoCarrinho(id);
    }
    if (e.target.matches('.qtd-btn.plus')) {
      const id = parseInt(e.target.getAttribute('data-id')); alterarQuantidade(id, 1);
    }
    if (e.target.matches('.qtd-btn.minus')) {
      const id = parseInt(e.target.getAttribute('data-id')); alterarQuantidade(id, -1);
    }
    if (e.target.matches('#clearFilters')) {
      limparFiltros();
    }
  });

  // Filtros dinâmicos
  ['searchInput','categorySelect','minPrice','maxPrice'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { paginaAtual = 1; renderizarProdutos(); });
  });

  // Toggle carrinho
  const toggle = document.getElementById('cartToggle');
  const panel = document.getElementById('cartPanel');
  const badge = document.getElementById('cartCount');
  if (toggle && panel) {
    const fecharCarrinho = () => {
      // ao fechar, remover a classe do botão imediatamente (inicia animação do ícone)
      toggle.classList.remove('open');
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden','true');
    };
    const abrirPanel = (opts = {}) => {
      // opts.delayToggle: se true, atrasar a aparição do X para sincronizar com a
      // animação do painel (usado quando abrimos programaticamente após Add)
      panel.classList.add('open');
      panel.setAttribute('aria-hidden','false');
      const lista = document.getElementById('cartItems');
      // rolar no final após painel expandir um pouco
      const doScroll = () => { if (lista) lista.scrollTop = lista.scrollHeight; };
      // se quisermos atrasar a troca do ícone (para evitar X aparecendo antes do painel)
      if (opts.delayToggle) {
        // mantemos o painel abrindo; adicionamos a classe do toggle depois de 180ms
        setTimeout(() => { toggle.classList.add('open'); doScroll(); }, 180);
      } else {
        toggle.classList.add('open');
        // pequeno timeout para garantir conteúdo renderizado
        setTimeout(doScroll, 120);
      }
    };
    // Toggle ao clicar no botão
    toggle.addEventListener('click', (e) => { e.preventDefault(); if (panel.classList.contains('open')) fecharCarrinho(); else abrirPanel(); });
    // Garantir que clicar no ícone SVG também atue como toggle (alguns navegadores
    // direcionam o clique ao <svg> interno em vez do botão)
    const svgIcon = toggle.querySelector('.cart-icon');
    if (svgIcon) svgIcon.addEventListener('click', (e) => { e.preventDefault(); if (panel.classList.contains('open')) fecharCarrinho(); else abrirPanel(); e.stopPropagation(); });
    const svgClose = toggle.querySelector('.cart-icon-close');
    if (svgClose) svgClose.addEventListener('click', (e) => { e.preventDefault(); fecharCarrinho(); e.stopPropagation(); });
    if (badge) badge.addEventListener('click', (e) => { e.preventDefault(); abrirPanel(); });
    // Delegação específica dentro do painel (mantém painel aberto)
    panel.addEventListener('click', ev => {
      const t = ev.target;
      if (t.matches('.qtd-btn.plus')) {
        const id = parseInt(t.getAttribute('data-id')); alterarQuantidade(id, 1);
      } else if (t.matches('.qtd-btn.minus')) {
        const id = parseInt(t.getAttribute('data-id')); alterarQuantidade(id, -1);
      }
      // Não deixa o clique chegar no document e fechar o painel
      ev.stopPropagation();
    });

    document.addEventListener('click', ev => {
      // se estivermos suprimindo o fechamento (ex.: acabamos de adicionar um item),
      // ignoramos cliques fora por um curto período para evitar flicker
      if (Date.now() < suppressPanelCloseUntil) return;
      if (!panel.contains(ev.target) && ev.target !== toggle && ev.target !== badge) {
        // fechar por clique fora
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
        toggle.classList.remove('open');
      }
    });
  }

  // Menu expansível (hamburger) que contém o seletor de tema
  const menuToggle = document.getElementById('menuToggle');
  const menuPanel = document.getElementById('menuPanel');
  if (menuToggle && menuPanel) {
    const openMenu = () => { menuPanel.classList.add('open'); menuPanel.setAttribute('aria-hidden','false'); menuToggle.setAttribute('aria-expanded','true'); };
    const closeMenu = () => { menuPanel.classList.remove('open'); menuPanel.setAttribute('aria-hidden','true'); menuToggle.setAttribute('aria-expanded','false'); };
    menuToggle.addEventListener('click', (e) => { e.preventDefault(); if (menuPanel.classList.contains('open')) closeMenu(); else openMenu(); e.stopPropagation(); });
    menuPanel.addEventListener('click', ev => ev.stopPropagation());
    document.addEventListener('click', ev => {
      if (!menuPanel.contains(ev.target) && ev.target !== menuToggle) closeMenu();
    });
  }

  // Checkout exemplos
  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) checkoutBtn.addEventListener('click', () => {
    alert('Fluxo de checkout futuro.');
  });
  const profileCheckout = document.getElementById('profileCheckout');
  if (profileCheckout) profileCheckout.addEventListener('click', () => {
    alert('Checkout (Página de Perfil) - Em desenvolvimento.');
  });
}

// ===== Custom select replacement for menu (keeps original select in DOM)
function initCustomSelects() {
  try {
    const panel = document.querySelector('.menu-panel');
    if (!panel) return;
    const selects = Array.from(panel.querySelectorAll('select'));
    if (!selects.length) return;
    // mark panel so original selects can be hidden via CSS
    panel.classList.add('select-replaced');

    // close any open custom select when clicking outside (keep aria-expanded in sync)
    document.addEventListener('click', (e) => {
      selects.forEach(s => {
        const wrapper = s.previousElementSibling; // custom wrapper inserted before select
        if (wrapper && wrapper.classList && wrapper.classList.contains('custom-select')) {
          if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
            const cur = wrapper.querySelector('.custom-select-current'); if (cur) cur.setAttribute('aria-expanded','false');
          }
        }
      });
    });

    selects.forEach(s => {
      if (s.dataset.custom === '1') return; // already replaced
      s.dataset.custom = '1';
      const wrapper = document.createElement('div'); wrapper.className = 'custom-select';
      const current = document.createElement('button'); current.type = 'button'; current.className = 'custom-select-current'; current.setAttribute('aria-haspopup', 'listbox');
      const list = document.createElement('ul'); list.className = 'custom-select-list'; list.setAttribute('role','listbox');

      // populate
      Array.from(s.options).forEach((opt, idx) => {
        const li = document.createElement('li'); li.setAttribute('role','option'); li.setAttribute('data-value', opt.value);
        li.textContent = opt.text;
        if (opt.disabled) li.setAttribute('aria-disabled','true');
        if (opt.selected) li.setAttribute('aria-selected','true');
        li.addEventListener('click', (ev) => {
          if (opt.disabled) return;
          // update original select
          s.value = opt.value;
          // reflect selection visually
          list.querySelectorAll('li').forEach(x => x.setAttribute('aria-selected','false'));
          li.setAttribute('aria-selected','true');
          current.innerHTML = '<span class="custom-select-value">' + escapeHtml(opt.text) + '</span>';
          // dispatch change so existing handlers run
          s.dispatchEvent(new Event('change', { bubbles:true }));
          wrapper.classList.remove('open');
        });
        list.appendChild(li);
      });

      // initial current text + aria
      const selectedOpt = s.options[s.selectedIndex];
      current.innerHTML = '<span class="custom-select-value">' + escapeHtml(selectedOpt ? selectedOpt.text : '') + '</span>';
      current.setAttribute('aria-expanded','false');

      // toggle (keep aria-expanded in sync)
      current.addEventListener('click', (e) => { e.stopPropagation(); const willOpen = !wrapper.classList.contains('open'); wrapper.classList.toggle('open'); current.setAttribute('aria-expanded', willOpen ? 'true' : 'false'); });

      // clicking inside the list should not propagate to document (which closes selects)
      list.addEventListener('click', (e) => { e.stopPropagation(); });

      // ensure wrapper starts closed
      wrapper.classList.remove('open');
      current.setAttribute('aria-expanded','false');

      // close on Escape when focused inside list
      list.addEventListener('keydown', (e) => { if (e.key === 'Escape') { wrapper.classList.remove('open'); current.setAttribute('aria-expanded','false'); current.focus(); } });

      // keyboard navigation
      current.addEventListener('keydown', (e) => {
        const open = wrapper.classList.contains('open');
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); wrapper.classList.add('open');
          const items = Array.from(list.querySelectorAll('li:not([aria-disabled="true"])'));
          if (items.length) items[0].focus();
        } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wrapper.classList.toggle('open'); }
        else if (e.key === 'Escape') wrapper.classList.remove('open');
      });

      // simple focus handling for list items
      list.addEventListener('keydown', (e) => {
        const items = Array.from(list.querySelectorAll('li:not([aria-disabled="true"])'));
        const idx = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); const next = items[Math.min(items.length-1, Math.max(0, idx+1))]; if (next) next.focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); const prev = items[Math.max(0, idx-1)]; if (prev) prev.focus(); }
        else if (e.key === 'Enter' && document.activeElement.tagName === 'LI') { document.activeElement.click(); }
        else if (e.key === 'Escape') { wrapper.classList.remove('open'); current.focus(); }
      });

      // make list items focusable
      list.querySelectorAll('li').forEach(li => li.tabIndex = 0);

      // insert wrapper before select and move select after wrapper
      s.parentNode.insertBefore(wrapper, s);
      wrapper.appendChild(current);
      wrapper.appendChild(list);

      // ensure the original select is not focusable (we rely on the hidden select for value)
      s.tabIndex = -1;
    });
  } catch (err) {
    console.warn('initCustomSelects failed', err);
  }
}

function abrirCarrinho(opts = {}) {
  // opts.delayToggle: if true, delay adding the 'open' class to the toggle icon
  const panel = document.getElementById('cartPanel');
  if (panel && !panel.classList.contains('open')) {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    const toggle = document.getElementById('cartToggle');
    const lista = document.getElementById('cartItems');
    const doScroll = () => { if (lista) lista.scrollTop = lista.scrollHeight; };
    if (opts.delayToggle) {
      // delay toggling the icon until panel animation progresses to avoid the X
      // appearing before the panel fully opens (prevents flicker/perceived jump)
      setTimeout(() => { if (toggle) toggle.classList.add('open'); doScroll(); }, 180);
    } else {
      if (toggle) toggle.classList.add('open');
      setTimeout(doScroll, 120);
    }
  }
}

// ===================== Tema =====================
function aplicarTema(theme) {
  const root = document.documentElement;
  if (theme) root.setAttribute('data-theme', theme);
  const select = document.getElementById('themeSelect');
  if (select) select.value = theme;
}

function carregarTema() {
  try { return localStorage.getItem(THEME_KEY) || 'roxo'; } catch { return 'roxo'; }
}

function salvarTema(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

// ===================== Inicialização =====================
async function init() {
  // fetch exchange rates first (cached)
  await fetchExchangeRates();

  // Tema
  const tema = carregarTema();
  aplicarTema(tema);
  const themeSelect = document.getElementById('themeSelect');
  const countrySelect = document.getElementById('countrySelect');
  // set current country in select
  const currentCountry = carregarPais();
  if (countrySelect) {
    countrySelect.value = currentCountry;
    countrySelect.addEventListener('change', (e) => {
      const c = e.target.value; salvarPais(c);
      // re-render prices in current page and cart
      renderizarProdutos();
      atualizarUICarrinho();
      atualizarPerfilCarrinho();
    });
  }
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      const t = e.target.value; salvarTema(t); aplicarTema(t);
      // anima o seletor visualmente quando o tema muda
      const sel = e.target;
      sel.classList.remove('theme-anim');
      // forçar reflow para reiniciar a animação se necessário
      void sel.offsetWidth;
      sel.classList.add('theme-anim');
      sel.addEventListener('animationend', () => sel.classList.remove('theme-anim'), { once: true });
    });
  }

  await loadProducts();
  inicializarFiltros();
  renderizarProdutos();
  atualizarUICarrinho();
  atualizarPerfilCarrinho();
  configurarEventosGlobais();
  // initialize custom selects in the menu (if present)
  initCustomSelects();
  // create promo strip under header (shows discounted items)
  try { createPromoStrip(); } catch (e) { console.warn('createPromoStrip failed', e); }
  // Dispara a animação da barrinha do header (preenchimento left->right)
  // adicionando a classe `anim-start` com pequeno delay para que a transição seja visível
  setTimeout(() => { try { const nav = document.querySelector('.main-nav'); if (nav) nav.classList.add('anim-start'); } catch (e) {} }, 90);
}

document.addEventListener('DOMContentLoaded', () => { init().catch(err => console.error('Init error', err)); });

/* Promo carousel builder: creates a full-width strip under the header that
   continuously scrolls discounted products without flicking. Uses a duplicated
   sequence + CSS keyframes so the animation is pure CSS after initial measurement.
   Behavior: clones the inner sequence, measures width, sets --promo-scroll-distance
   and --promo-duration on the track. Pauses on hover/focus. Hidden on small screens. */
function createPromoStrip() {
  // avoid creating twice
  if (document.querySelector('.promo-strip')) return;
  try {
    const discounted = (produtos || []).filter(p => p.desconto && p.desconto > 0);
    if (!discounted || discounted.length === 0) return;

    const header = document.querySelector('.site-header');
    if (!header) return;

    // build structure
    const strip = document.createElement('div'); strip.className = 'promo-strip'; strip.setAttribute('role','region'); strip.setAttribute('aria-label','Ofertas do dia');
    const track = document.createElement('div'); track.className = 'promo-track';
    const inner = document.createElement('div'); inner.className = 'promo-inner';

    // populate items
    discounted.forEach(p => {
      const item = document.createElement('div'); item.className = 'promo-item'; item.tabIndex = -1;
      // Make the name an accessible link so keyboard users can tab to it
      const name = document.createElement('a'); name.className = 'promo-name product-link';
      name.href = `product.html?id=${encodeURIComponent(p.id)}`;
      name.dataset.fullname = p.nome;
      name.setAttribute('aria-label', p.nome);
      name.tabIndex = 0;
      name.textContent = p.nome;
      const priceWrap = document.createElement('div'); priceWrap.className = 'promo-price';
      const f = formatCurrencyFromBRL(p.preco * (1 - (p.desconto || 0)));
      const cur = document.createElement('span'); cur.className = 'currency'; cur.textContent = f.symbol;
      const amt = document.createElement('span'); amt.className = 'amount'; amt.textContent = f.formatted;
      priceWrap.appendChild(cur); priceWrap.appendChild(amt);
      item.appendChild(name);
      item.appendChild(priceWrap);
      // discount badge (reuse existing class)
      const pct = Math.round(p.desconto * 100);
      const badge = document.createElement('span'); badge.className = 'discount-badge'; badge.setAttribute('aria-hidden','true');
      const bt = document.createElement('span'); bt.className = 'discount-badge-text'; bt.textContent = `-${pct}%`; badge.appendChild(bt);
      item.appendChild(badge);
      inner.appendChild(item);
    });

    // duplicate sequence for seamless scroll
    const clone = inner.cloneNode(true);
    track.appendChild(inner);
    track.appendChild(clone);
    strip.appendChild(track);

    // We'll attach tooltip listeners after we possibly add more clones in setup,
    // so leave initial attachment to the setup phase to ensure all clones get handlers.

    // insert after header
    header.parentNode.insertBefore(strip, header.nextSibling);

    // animation state (moved to outer scope so pointer handlers can access)
    let seqWidth = 0;
    let durationSec = 0;
    let pxPerSecond = 80; // default, may be adjusted after measurement
    let jsAnim = { running: false, offset: 0, lastTs: 0, rafId: null };

    function startPromoLoop() {
      if (jsAnim.running) return;
      jsAnim.running = true;
      jsAnim.lastTs = performance.now();
      // disable CSS animation to avoid conflicts
      track.style.animation = 'none';
      const tick = (ts) => {
        if (!jsAnim.running) return;
        const dt = (ts - jsAnim.lastTs) / 1000;
        jsAnim.lastTs = ts;
        // move left
        jsAnim.offset -= pxPerSecond * dt;
        // wrap offset to keep it bounded (so numbers don't grow unbounded)
        // keep offset in range (-seqWidth, 0]
        if (jsAnim.offset <= -seqWidth) jsAnim.offset += seqWidth;
        if (jsAnim.offset > 0) jsAnim.offset -= seqWidth;
        track.style.transform = `translateX(${jsAnim.offset}px)`;
        jsAnim.rafId = requestAnimationFrame(tick);
      };
      jsAnim.rafId = requestAnimationFrame(tick);
    }

    function stopPromoLoop() {
      if (!jsAnim.running) return;
      jsAnim.running = false;
      if (jsAnim.rafId) cancelAnimationFrame(jsAnim.rafId);
      jsAnim.rafId = null;
    }

    // measure widths after layout stabilizes
    const setup = () => {
      // measure width of a single inner sequence
      const firstInner = track.querySelector('.promo-inner');
      if (!firstInner) return;
      seqWidth = Math.ceil(firstInner.getBoundingClientRect().width) + 2; // safety pad
      // speed: px per second
      pxPerSecond = 80; // adjust for readable speed
      durationSec = Math.max(12, Math.round(seqWidth / pxPerSecond));
      // set CSS vars (kept for reference) and store values
      track.style.setProperty('--promo-scroll-distance', `-${seqWidth}px`);
      track.style.setProperty('--promo-duration', `${durationSec}s`);
      track.dataset.seqWidth = String(seqWidth);
      track.dataset.duration = String(durationSec);

      // Ensure track contains enough repetitions so dragging never exposes empty gaps.
      try {
        const minCover = window.innerWidth + seqWidth;
        let tries = 0;
        while (track.getBoundingClientRect().width < minCover && tries < 8) {
          const more = inner.cloneNode(true);
          track.appendChild(more);
          tries++;
        }
      } catch (e) { /* non-fatal */ }

      // Attach tooltip listeners to all promo-name elements (including newly cloned ones)
      Array.from(track.querySelectorAll('.promo-name')).forEach(el => {
        try {
          if (el.dataset.ttAttached) return;
          if (!el.dataset.fullname) el.dataset.fullname = el.textContent || el.getAttribute('aria-label') || '';
          if (!('ontouchstart' in window)) {
            el.addEventListener('mouseenter', () => showFloatingTooltipForLink(el));
            el.addEventListener('mouseleave', hideFloatingTooltip);
            el.addEventListener('focus', () => showFloatingTooltipForLink(el));
            el.addEventListener('blur', hideFloatingTooltip);
          }
          el.dataset.ttAttached = '1';
        } catch (e) {}
      });

      // initialize animation baseline and start the JS-driven loop
      jsAnim.offset = 0;
      startPromoLoop();
      // pause/resume on hover/focus for accessibility
      strip.addEventListener('mouseenter', () => { stopPromoLoop(); });
      strip.addEventListener('mouseleave', () => { startPromoLoop(); });
      strip.addEventListener('focusin', () => { stopPromoLoop(); });
      strip.addEventListener('focusout', () => { startPromoLoop(); });

      // update sticky filters offset: header height + strip height
      try {
        const headerHeight = header.getBoundingClientRect().height;
        const stripHeight = strip.getBoundingClientRect().height;
        const offset = Math.round(headerHeight + stripHeight + 4); // small gap
        document.documentElement.style.setProperty('--header-offset', offset + 'px');
      } catch (e) {}
    };

    // Wait a frame and a small timeout to allow fonts/images to layout
    requestAnimationFrame(() => setTimeout(setup, 80));
    // re-setup on resize
    let resizeTimer = null;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { try { setup(); } catch(e){} }, 120); });
    
    // --- Drag-to-pull support (pointer-based) --------------------------------
    // Allows user to click+drag the strip to pan horizontally while pausing the
    // CSS animation. On release we resume the CSS animation seamlessly using
    // a negative animation-delay calculated from the dragged position.
    let isDragging = false;
    let dragStartX = 0;
    let dragStartTranslate = 0; // px
    let currentTranslate = 0;

    function getComputedTranslateX(el) {
      const st = window.getComputedStyle(el);
      const tr = st.transform || st.webkitTransform || 'none';
      if (tr === 'none') return 0;
      // matrix(a, b, c, d, tx, ty) -> tx is index 4
      const m = tr.match(/matrix\(([^)]+)\)/);
      if (m) {
        const parts = m[1].split(',').map(s => parseFloat(s.trim()));
        if (parts.length === 6) return parts[4];
      }
      const m3d = tr.match(/matrix3d\(([^)]+)\)/);
      if (m3d) {
        const parts = m3d[1].split(',').map(s => parseFloat(s.trim()));
        if (parts.length === 16) return parts[12];
      }
      return 0;
    }

    // Drag handling with threshold so clicks still work when there's no movement
    let pointerActive = false;
    let dragTarget = null;
    const DRAG_THRESHOLD = 6; // px
    let suppressPromoClickUntil = 0;

    // Capture-phase click handler to suppress navigation when a drag just occurred.
    document.addEventListener('click', (ev) => {
      try {
        if (Date.now() < suppressPromoClickUntil) {
          // if the click originated inside the promo strip, prevent it
          if (ev.target && ev.target.closest && ev.target.closest('.promo-strip')) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
          }
        }
      } catch (e) {}
    }, true);

    strip.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      if (ev.pointerType === 'touch') return; // keep touch behavior native
      pointerActive = true;
      dragTarget = ev.target;
      dragStartX = ev.clientX;
      // baseline translate (use jsAnim offset if available)
      dragStartTranslate = (jsAnim && typeof jsAnim.offset === 'number') ? jsAnim.offset : getComputedTranslateX(track);
      currentTranslate = dragStartTranslate;
      // capture pointer so we get move/up outside the element
      try { strip.setPointerCapture && strip.setPointerCapture(ev.pointerId); } catch (e) {}
    });

    strip.addEventListener('pointermove', (ev) => {
      if (!pointerActive) return;
      const dx = ev.clientX - dragStartX;
      // start actual dragging only after threshold exceeded
      if (!isDragging && Math.abs(dx) > DRAG_THRESHOLD) {
        // begin dragging
        isDragging = true;
        stopPromoLoop();
        strip.classList.add('dragging');
        // re-base dragStartTranslate to current animated offset
        dragStartTranslate = (jsAnim && typeof jsAnim.offset === 'number') ? jsAnim.offset : getComputedTranslateX(track);
        currentTranslate = dragStartTranslate + (ev.clientX - dragStartX);
      }
      if (!isDragging) return; // nothing else until drag starts
      ev.preventDefault();
      const dx2 = ev.clientX - dragStartX;
      currentTranslate = dragStartTranslate + dx2;
      // wrap to keep numbers reasonable
      if (currentTranslate <= -seqWidth) currentTranslate += seqWidth * Math.ceil(Math.abs(currentTranslate / seqWidth));
      if (currentTranslate > 0) currentTranslate -= seqWidth * Math.floor(currentTranslate / seqWidth + 1);
      track.style.transform = `translateX(${currentTranslate}px)`;
    });

    function endDrag(ev) {
      // if pointer was active but no drag started, it's a click/tap -- do nothing
      if (!pointerActive) return;
      pointerActive = false;
      // release capture
      try { strip.releasePointerCapture && strip.releasePointerCapture(ev.pointerId); } catch (e) {}
      if (!isDragging) {
        // let click happen normally
        dragTarget = null;
        return;
      }
      // finish drag
      isDragging = false;
      strip.classList.remove('dragging');
      jsAnim.offset = currentTranslate;
      if (jsAnim.offset <= -seqWidth) jsAnim.offset += seqWidth * Math.ceil(Math.abs(jsAnim.offset / seqWidth));
      if (jsAnim.offset > 0) jsAnim.offset -= seqWidth * Math.floor(jsAnim.offset / seqWidth + 1);
      // suppress the next click if drag happened on the strip (prevents navigation)
      suppressPromoClickUntil = Date.now() + 350;
      dragTarget = null;
      // resume the loop
      startPromoLoop();
    }

    strip.addEventListener('pointerup', endDrag);
    strip.addEventListener('pointercancel', endDrag);
    window.addEventListener('pointerup', endDrag);
  } catch (err) {
    console.warn('Promo strip creation failed', err);
  }
}
