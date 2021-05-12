// ==UserScript==
// @name         Beerizer Systembolaget export
// @namespace    https://github.com/Row/beerizer-export-systembolaget
// @version      0.6
// @description  Adds an Systembolaget export button to the top of the Beerizer.com cart.
//               The export result can be verifed in the Systembolaget.se cart.
// @author       Row
// @match        https://beerizer.com/*
// @match        https://www.systembolaget.se/*
// @grant        GM.setValue
// @grant        GM.getValue
// @run-at       document-body
// ==/UserScript==

const STATE_KEY     = 'STATE_KEY';
const STATE_UNDEF   = null;
const STATE_INIT    = 'INIT';
const STATE_PENDING = 'PENDING';
const STATE_DONE    = 'DONE';
const STATE_ERROR   = 'ERROR';
const STATE_CANCEL  = 'CANCEL';
const INITIAL_STATE = {
  state: STATE_UNDEF,
  index: 0,
  beers: [],
};

const PROGRESS_ID = 'beerizer-progress';

const makeTag = tag => parent => parent.appendChild(document.createElement(tag));

const a = makeTag('a');
const button = makeTag('button');
const div = makeTag('div');
const table = makeTag('table');
const td = makeTag('td');
const tr = makeTag('tr');
const aLink = (parent, { href, title }) => {
  let el;
  if (href) {
    el = a(parent);
    el.setAttribute('href', href);
  } else {
    el = parent;
  }
  el.innerText = title || 'Unknown';
  return el;
};
const tdr = parent =>  {
  const t = td(parent);
  t.style.padding = '0.3em';
  return t;
};

const cancelExport = async (state) => {
  const { index, beers } = state;
  for (let i = index; i < beers.length; i += 1) {
    beers[i].state = STATE_CANCEL;
    beers[i].error = 'cancelled';
  }
  doneSystemBolaget({ ...state, index: beers.length - 1 });
};

const renderProgress = (state) => {
  const overlay = div(document.body);
  overlay.id = PROGRESS_ID;
  overlay.style.cssText = `
    align-items: center;
    background: #FFF;
    display: flex;
    flex-flow: column;
    height: 100vh;
    justify-content: center;
    left: 0;
    position: fixed;
    top: 0;
    transition: height 0.3s;
    width: 100vw;
    z-index: 1337;
  `;
  const done = state.beers.filter(({ state }) => state !== STATE_INIT).length;
  const total = state.beers.length;
  const percent = (done / total) * 100;
  const bar = div(overlay);
  bar.style.cssText = `
    margin: 0 20em;
    background: lightgrey;
  `;
  const progress = div(bar);
  progress.style.cssText = `
    background: #fbd533;
    color: #fff;
    overflow: visible;
    padding: 1em;
    text-align: right;
    text-shadow: rgb(95 92 92) 1px 1px 2px;
    white-space: nowrap;
    width: ${percent}%;
  `;
  progress.innerText = `EXPORTING BEER ${done} OF ${total}`;
  const cancelButton = button(overlay);
  cancelButton.innerText = 'Cancel export';
  cancelButton.style.cssText = `
    background: white;
    border: 1px solid red;
    color: red;
    cursor: pointer;
    font-size: 0.7rem;
    margin-top: 1rem;
  `;
  cancelButton.addEventListener('click', () => cancelExport(state));
};

const renderResult = async (state) => {
  const div = document.createElement('div');
  const basket = `
    //div[
          text()="Varukorgen är tom."
          or (starts-with(text(), "Du har ") and contains(text(), "varor i korgen"))
    ]`;
  await waitForElement(basket);
  const insertPoint = await waitForElement('//h1[./span[text()="Varukorg"] or text()="Varukorg"]');
  insertPoint.after(div);
  div.innerHTML = `<h2>Beerizer exported ${state.beers.length} beers</h2>`;
  const exportTable = table(div);
  state.beers.map(({
    beerizerHref,
    beerizerTitle,
    error,
    state,
    systemBolagetHref,
    systemBolagetTitle,
  }, index) => {
    const row = tr(exportTable);
    tdr(row).innerText = index + 1;
    aLink(tdr(row), {
      href: beerizerHref,
      title: beerizerTitle,
    });
    tdr(row).innerText = '➜';
    aLink(tdr(row), {
      href: systemBolagetHref,
      title: systemBolagetTitle,
    });
    tdr(row).innerText = state === STATE_DONE ? '✅' : '⚠️';
    tdr(row).innerText = error ? error : state;
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

const waitForElement = (xpath, timeout = 5000, interval = 100, shouldInverse = false) => {
  const start = (new Date()).getTime();
  return new Promise((resolve, reject) => {
    const tryElement = () => {
      const element = getElementByXpath(xpath);
      if ((!!element) !== shouldInverse) {
        resolve(element);
        return;
      }
      if (((new Date()).getTime() - start) > timeout) {
        reject(xpath);
      }
      window.setTimeout(tryElement, interval);
    };
    tryElement();
  });
};

const doneSystemBolaget = async (state) => {
  GM.setValue(STATE_KEY, { ...state, state: STATE_DONE });
  window.location.href = 'https://www.systembolaget.se/varukorg';
};

const initSystemBolaget = async (state) => {
  if (state.beers.length === 0) {
    await doneSystemBolaget(state);
  } else {
    try {
      const CONFIRM_AGE = '//button[text()="Jag har fyllt 20 år"]';
      const btn = await waitForElement(CONFIRM_AGE, 2000);
      btn.click();
    } catch (e) {
      console.log('tried to accept age');
    }
    try {
      const CONFIRM_COOKIE = '//button[text()="SPARA & STÄNG"]';
      const btn = await waitForElement(CONFIRM_COOKIE, 2000);
      btn.click();
    } catch (e) {
      console.log('tried to accept cookie');
    }
    await GM.setValue(STATE_KEY, { ...state, state: STATE_PENDING });
    window.location.href = state.beers[0].href;
  }
};

const addBeerSystembolaget = async (state) => {
  const addToCartXpath = '//button[./div[text()="Lägg i varukorg"]]';
  const verifyXpath = '//button[./div[text()="Tillagd"]]';
  const { index, beers } = state;
  const beer = state.beers[index];
  beer.systemBolagetHref = window.location.href;
  try {
    const beerHeader = getElementByXpath('//h1[./span]');
    if (!beerHeader) {
      throw Error('Beer not found?');
    }
    beer.systemBolagetTitle = beerHeader.innerText;
    const cartBtn = await waitForElement(addToCartXpath);
    cartBtn.click();
    try {
      await waitForElement(verifyXpath, 2000, 100);
    } catch (e) {
      if (!getElementByXpath('//div[text()="Välj leveranssätt "]')) throw e;
      const progress = document.getElementById(PROGRESS_ID);
      progress.style.height = '100px';
      const closeModalButton = '//button[@id="initialTgmFocus"]';
      await waitForElement(closeModalButton, 1000 * 120, 100, true);
      const cartBtn = await waitForElement(addToCartXpath);
      cartBtn.click();
      await waitForElement(verifyXpath, 1000 * 120, 100);
      progress.style.height = '100vh';
    }
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
  if (state.beers.length > 0 && state.state !== STATE_DONE) {
    renderProgress(state);
  }
  if (state.state === STATE_INIT) {
    await initSystemBolaget(state);
  } else if (state.state === STATE_PENDING) {
    window.addEventListener('load', () => {
      addBeerSystembolaget(state);
    });
  }
  if (window.location.pathname === '/varukorg/') {
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
  const cl = getElementByXpath('//a[@class="cart-link" and ./span[text()="Share"]]');
  if (!cl) return;
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
(() => {
  'use strict';
  const hostname = window.location.hostname;
  if (hostname.includes('beerizer')) {
    window.addEventListener('load', () => {
      handleBeerizer();
    });
  }
  if (hostname.includes('systembolaget')) {
    handleSystembolaget();
  }
})();
