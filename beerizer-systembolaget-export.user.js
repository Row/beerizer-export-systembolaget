// ==UserScript==
// @name         Beerizer Systembolaget export
// @namespace    https://github.com/Row/beerizer-export-systembolaget
// @version      0.2
// @description  Adds an Systembolaget export button to top of the Beerizer.com cart.
//               The result of the export can be verifed in the Systembolaget.se cart.
// @author       Row
// @match        https://beerizer.com/*
// @match        https://www.systembolaget.se/*
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==

const STATE_KEY     = 'STATE_KEY';
const STATE_UNDEF   = null;
const STATE_INIT    = 'INIT';
const STATE_PENDING = 'PENDING';
const STATE_DONE    = 'DONE';
const STATE_ERROR   = 'ERROR';
const INITIAL_STATE = {
  state: STATE_UNDEF,
  index: 0,
  beers: [],
};

const makeTag = tag => parent => parent.appendChild(document.createElement(tag));

const tr = makeTag('tr');
const td = makeTag('td');
const div = makeTag('div');
const a = makeTag('a');
const table = makeTag('table');

const aLink = (parent, { href, title }) => {
  const el = a(parent);
  el.setAttribute('href', href);
  el.innerText = title;
  return el;
};

const tdr = parent =>  {
  const t = td(parent);
  t.style.padding = '0.3em';
  return t;
};

const renderProgress = (state) => {
  const overlay = div(document.body);
  overlay.style.cssText = `
    top: 0;
    left: 0;
    position: fixed;
    height: 100vh;
    width: 100vw;
    background: #FFF;
    z-index: 1337;
  `;
  const done = state.beers.filter(({ state }) => state !== STATE_INIT).length;
  const total = state.beers.length;
  const percent = (done / total) * 100;
  const bar = div(overlay);
  bar.style.cssText = `
    margin: 20em;
    background: lightgrey;
  `;
  const progress = div(bar);
  progress.style.cssText = `
    width: ${percent}%;
    background: #fbd533;
    color: #fff;
    padding: 1em;
    text-align: right;
    overflow: visible;
    white-space: nowrap;
    text-shadow: rgb(95 92 92) 1px 1px 2px;
  `;
  progress.innerText = `EXPORTING BEER ${done} OF ${total}`;
};

const renderResult = (state) => {
  const div = document.createElement('div');
  div.className = 'total';
  const insertPoint = document.querySelector('.page-heading>h1');
  insertPoint.parentNode.after(div);
  div.innerHTML = `<h2>Beerizer export ${state.beers.length} beers</h2>`;
  const exportTable = table(div);
  state.beers.map(({
    error,
    state,
    systemBolagetHref,
    systemBolagetTitle,
    beerizerHref,
    beerizerTitle,
  }, index) => {
    const row = tr(exportTable);
    tdr(row).innerText = index + 1;
    aLink(tdr(row), {
      href: beerizerHref,
      title: `Beerizer: ${beerizerTitle}`,
    });
    tdr(row).innerText = '➜';
    aLink(tdr(row), {
      href: systemBolagetHref,
      title: `Systembolaget: ${systemBolagetTitle}`,
    });
    tdr(row).innerText = state === STATE_DONE ? '✅' : '⚠️';
    tdr(row).innerText = error ? error : 'Success';
  });
};

const getElementByXpath = (xpath) =>
  document.evaluate(
    xpath,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  ).singleNodeValue;

const doneSystemBolaget = async (state) => {
  GM.setValue(STATE_KEY, { ...state, state: STATE_DONE });
  window.location.href = 'https://www.systembolaget.se/varukorg';
};

const initSystemBolaget = async (state) => {
  if (state.beers.length === 0) {
    await doneSystemBolaget(state);
  } else {
    renderProgress(state);
    await GM.setValue(STATE_KEY, { ...state, state: STATE_PENDING });
    window.location.href = state.beers[0].href;
  }
};

const addBeerSystembolaget = async (state) => {
  renderProgress(state);
  const addToCartXpath = '//span[contains(text(),"Lägg i varukorgen")]';
  const { index, beers } = state;
  const beer = state.beers[index];
  beer.systemBolagetHref = window.location.href;
  try {
    beer.systemBolagetTitle = document.querySelector('.product-header .name').innerText;
    const cartBtn = getElementByXpath(addToCartXpath);
    cartBtn.click();
    // TODO post condition?
    beer.state = STATE_DONE;
  } catch (error) {
    beer.state = STATE_ERROR;
    beer.error = error.message;
  }
  const nextIndex = index + 1;
  if (beers.length <= nextIndex) {
    await doneSystemBolaget(state);
  } else {
    await GM.setValue(STATE_KEY, { ...state, index: nextIndex });
    window.location.href = beers[nextIndex].href;
  }
};

const handleSystembolaget = async () => {
  const state = await GM.getValue(STATE_KEY, INITIAL_STATE);
  if (state.state === STATE_INIT) {
    await initSystemBolaget(state);
  } else if (state.state === STATE_PENDING) {
    await addBeerSystembolaget(state);
  }
  if (window.location.pathname === '/varukorg') {
    renderResult(state);
  }
};

// Beerizer parts
const exportCart = async () => {
  const links = 'a[title="To Systembolaget"]';
  const titleLinks = '.CartProductTable td.name>a';
  const titles = [...document.querySelectorAll(titleLinks)].map(l => ({
    beerizerHref: l.href,
    beerizerTitle: l.innerText,
  }));
  const hrefs = [...document.querySelectorAll(links)].map(l => l.href);
  const beers = [...new Set(hrefs)].map((href, i) => ({
    ...titles[i],
    href,
    state: STATE_INIT,
  }));
  const state = {
    ...INITIAL_STATE,
    state: STATE_INIT,
    beers,
  };
  await GM.setValue(STATE_KEY, state);
  const w = window.open('', 'systembolaget');
  w.location = 'https://www.systembolaget.se';
};

const renderButton = () => {
  const cl = document.querySelector('.cart-link');
  const e = cl.cloneNode(2);
  cl.after(e);
  e.querySelector('span').innerText = 'Export Systembolaget';
  e.addEventListener('click', exportCart);
};

const handleBeerizer = () => {
  const btn = 'div.cart-wrapper.collapsed>div.summary';
  const btnEl = document.querySelector(btn);
  btnEl.addEventListener('click', () => {
    window.setTimeout(renderButton, 100);
  });
};

// initialize
(function() {
  'use strict';
  const hostname = window.location.hostname;
  if (hostname.includes('beerizer')) {
    handleBeerizer();
  }
  if (hostname.includes('systembolaget')) {
    handleSystembolaget();
  }
})();
