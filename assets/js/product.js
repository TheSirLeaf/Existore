// product.js — simple product detail renderer
(async function(){
  const PRODUCTS_JSON = 'assets/data/products.json';
  const RATES_CACHE_KEY = 'lojaTechRates';
  const COUNTRY_KEY = 'lojaTechCountry';

  function getCachedRates() {
    try {
      const raw = localStorage.getItem(RATES_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.timestamp || !parsed.rates) return null;
      return parsed.rates;
    } catch(e){ return null; }
  }
  function carregarPais() { try { return localStorage.getItem(COUNTRY_KEY) || 'br'; } catch { return 'br'; } }

  const DEFAULT_CURRENCY = {
    br: { code: 'BRL', locale: 'pt-BR', symbol: 'R$', rate: 1 },
    us: { code: 'USD', locale: 'en-US', symbol: '$', rate: 0.20 },
    eu: { code: 'EUR', locale: 'de-DE', symbol: '€', rate: 0.18 }
  };

  function buildRates() {
    const cached = getCachedRates();
    const cur = Object.assign({}, DEFAULT_CURRENCY);
    if (cached) {
      if (typeof cached.USD === 'number') cur.us.rate = cached.USD;
      if (typeof cached.EUR === 'number') cur.eu.rate = cached.EUR;
    }
    return cur;
  }

  function formatCurrencyFromBRL(amountBRL) {
    const country = carregarPais();
    const s = buildRates()[country] || DEFAULT_CURRENCY.br;
    const converted = amountBRL * s.rate;
    const formatted = new Intl.NumberFormat(s.locale, { minimumFractionDigits:2, maximumFractionDigits:2 }).format(converted);
    return { symbol: s.symbol, formatted, locale: s.locale, code: s.code };
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getIdFromQuery() {
    const qp = new URLSearchParams(window.location.search);
    const v = qp.get('id');
    if (!v) return null;
    const n = parseInt(v,10);
    return Number.isFinite(n) ? n : v;
  }

  async function loadProducts() {
    try {
      const res = await fetch(PRODUCTS_JSON, { cache: 'no-cache' });
      if (!res.ok) throw new Error('network');
      return await res.json();
    } catch(e) { console.error('Failed to load products', e); return []; }
  }

  function renderNotFound(container) {
    container.innerHTML = '<div class="about-card">Produto não encontrado. <a href="index.html">Voltar</a></div>';
  }

  function renderProduct(container, p) {
    container.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'product-detail';
    if (p.desconto && p.desconto > 0) wrap.classList.add('has-discount');

    // Create wrapper and inner media to match CSS selectors (.pd-image .product-media)
    const mediaWrap = document.createElement('div'); mediaWrap.className = 'pd-image';
    const media = document.createElement('div'); media.className = 'product-media';
    if (p.imagem && !(/placeholder\.com/.test(p.imagem) || /\?text=/.test(p.imagem))) {
      const img = document.createElement('img'); img.src = p.imagem; img.alt = p.nome; media.appendChild(img);
    } else {
      media.classList.add('placeholder');
      // Use a laptop-style placeholder icon (accessible alt) when no product image is provided
      const pc = document.createElement('img'); pc.className = 'pc-icon'; pc.alt = 'Ícone de laptop'; pc.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="12" rx="1.2" ry="1.2" fill="%23a6b0c2"/><rect x="0.5" y="16.2" width="23" height="1.6" fill="%23a6b0c2"/></svg>';
      media.appendChild(pc);
      const cat = document.createElement('div'); cat.className = 'category-badge'; cat.textContent = p.categoria; media.appendChild(cat);
    }
    mediaWrap.appendChild(media);

    // Build a two-column layout: left = image + name/type, right = prices + discount + action
    const leftCol = document.createElement('div'); leftCol.className = 'pd-left';
    const rightCol = document.createElement('div'); rightCol.className = 'pd-right';
    const title = document.createElement('h1'); title.className = 'pd-title'; title.textContent = p.nome;
    const meta = document.createElement('div'); meta.className = 'product-meta'; meta.textContent = p.categoria;

    const priceBox = document.createElement('div'); priceBox.className = 'pd-price price';
    // helper to build final-price span with separated currency and amount
    function buildFinalPriceNode(amountBRL) {
      const f = formatCurrencyFromBRL(amountBRL);
      const fp = document.createElement('div'); fp.className = 'final-price';
      const cur = document.createElement('span'); cur.className = 'currency'; cur.textContent = f.symbol;
      const amt = document.createElement('span'); amt.className = 'amount gradient'; amt.textContent = ' ' + f.formatted;
      fp.appendChild(cur); fp.appendChild(amt);
      return fp;
    }

    if (p.desconto && p.desconto > 0) {
      priceBox.classList.add('has-discount');
      const old = document.createElement('div'); old.className = 'old-price small'; const oldf = formatCurrencyFromBRL(p.preco); old.textContent = oldf.symbol + ' ' + oldf.formatted;
      const discounted = buildFinalPriceNode(p.preco * (1 - p.desconto));
      priceBox.appendChild(old); priceBox.appendChild(discounted);
    } else {
      const normal = buildFinalPriceNode(p.preco);
      priceBox.appendChild(normal);
    }

    const desc = document.createElement('div'); desc.className = 'product-body'; const dtxt = p.descricao || p.resumo || ''; desc.innerText = dtxt;

    // Specifications section: gather likely spec keys not already shown
    const specKeysPreferred = [
      'marca','modelo','chipset','memoria','memória','capacidade','tamanho','velocidade','frequencia','frequência','interface','conexao','conexão','socket','consumo','tdp','cor','peso','dimensoes','dimensões','largura','altura','profundidade','garantia'
    ];
    const reservedKeys = new Set(['id','nome','categoria','preco','desconto','imagem','descricao','descrição','resumo']);
    const specs = [];
    for (const k in p) {
      if (!Object.prototype.hasOwnProperty.call(p,k)) continue;
      if (reservedKeys.has(k)) continue;
      const v = p[k];
      if (v == null || v === '' || typeof v === 'object') continue;
      specs.push({ key: k, value: v, priority: specKeysPreferred.includes(k.toLowerCase()) ? 1 : 2 });
    }
    specs.sort((a,b)=> a.priority - b.priority || a.key.localeCompare(b.key));
    let specsBlock = null;
    specsBlock = document.createElement('section'); specsBlock.className = 'product-specs';
    const h = document.createElement('h2'); h.textContent = 'Especificações'; specsBlock.appendChild(h);
    if (specs.length) {
      const list = document.createElement('dl'); list.className = 'specs-list';
      for (const s of specs) {
        const dt = document.createElement('dt'); dt.textContent = s.key.replace(/_/g,' ').replace(/\b\w/g, m=> m.toUpperCase());
        const dd = document.createElement('dd'); dd.textContent = String(s.value);
        list.appendChild(dt); list.appendChild(dd);
      }
      specsBlock.appendChild(list);
    } else {
      const pEmpty = document.createElement('p'); pEmpty.className = 'text-dim'; pEmpty.textContent = 'Sem especificações disponíveis.';
      specsBlock.appendChild(pEmpty);
    }

    const add = document.createElement('button'); add.className = 'btn-primary add-btn'; add.textContent = 'Adicionar';
    add.addEventListener('click', () => {
      // reuse localStorage cart structure
      try {
        const CART_KEY = 'lojaTechCarrinho';
        const carrinho = JSON.parse(localStorage.getItem(CART_KEY)) || [];
        const item = carrinho.find(x => x.id === p.id);
        if (item) item.qtd += 1; else carrinho.push({ id: p.id, nome: p.nome, preco: p.preco, desconto: p.desconto || 0, imagem: p.imagem, qtd: 1 });
        localStorage.setItem(CART_KEY, JSON.stringify(carrinho));
        // give visual feedback
        add.textContent = 'Adicionado'; setTimeout(()=> add.textContent = 'Adicionar', 1100);
      } catch(e){ console.error(e); }
    });

    // Discount meta row (percentage + optional duration)
    let discountRow = null;
    if (p.desconto && p.desconto > 0) {
      discountRow = document.createElement('div'); discountRow.className = 'pd-discount';
      // use the same parallelogram badge used on product cards for visual consistency
      // keep only the `discount-badge` class so the parallelogram styles are applied
      const pct = document.createElement('span'); pct.className = 'discount-badge';
      const pctText = document.createElement('span'); pctText.className = 'discount-badge-text';
      pctText.textContent = '-' + Math.round(p.desconto * 100) + '%';
      pct.appendChild(pctText);
      discountRow.appendChild(pct);
      // try to find a duration field if provided in product JSON
      const durationKeys = ['descontoDuracao','desconto_duracao','descontoDuracão','descontoDuration','desconto_validade','descontoValidade','desconto_valid_until','descontoUntil','desconto_ate'];
      let durText = null;
      for (const k of durationKeys) { if (p[k]) { durText = p[k]; break; } }
      if (durText) {
        const dur = document.createElement('div'); dur.className = 'discount-duration'; dur.textContent = String(durText);
        discountRow.appendChild(dur);
      }
    }

    // left column: image + name/type directly under the image
    leftCol.appendChild(mediaWrap);
    const titleWrap = document.createElement('div'); titleWrap.className = 'pd-title-wrap';
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    leftCol.appendChild(titleWrap);

    // right column: prices, discount pct and add button
    rightCol.appendChild(priceBox);
    if (discountRow) rightCol.appendChild(discountRow);
    rightCol.appendChild(add);

    // description row spans full width below
    const descRow = document.createElement('div'); descRow.className = 'pd-desc-row';
    descRow.appendChild(desc);
    if (specsBlock) descRow.appendChild(specsBlock);

    wrap.appendChild(leftCol);
    wrap.appendChild(rightCol);
    wrap.appendChild(descRow);
    container.appendChild(wrap);
  }

  // run
  const id = getIdFromQuery();
  const container = document.getElementById('productDetail');
  if (!container) return;
  const products = await loadProducts();
  if (!id) { renderNotFound(container); return; }
  const product = products.find(p => p.id == id);
  if (!product) { renderNotFound(container); return; }
  renderProduct(container, product);
})();
