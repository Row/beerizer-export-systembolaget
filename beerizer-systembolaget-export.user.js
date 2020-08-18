// ==UserScript==
// @name         Beerizer Systembolaget export
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to drink all the beer!
// @author       Row
// @match        https://beerizer.com/*
// @match        https://www.systembolaget.se/*
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==

const STATE_KEY = 'STATE_KEY';

// state
const STATE_UNDEF = null;
const STATE_INIT = 'INIT';
const STATE_PENDING = 'PENDING';
const STATE_DONE = 'DONE';
const STATE_ERROR = 'ERROR';

const INITIAL_STATE = {
    state: STATE_UNDEF,
    index: 0,
    beers: []
}

const log = o => {
    console.log(JSON.stringify(o, undefined, 4));
}

const poll = (fn, timeout, interval) => {
  var endTime = Number(new Date()) + (timeout || 2000);
  interval = interval || 100;

  return new Promise(function(resolve, reject) {
    (function p() {
      if (fn()) {
        resolve();
      }
      else if (Number(new Date()) < endTime) {
        setTimeout(p, interval);
      }
      else {
        reject('timed out for ' + fn + ': ' + arguments);
      }
    })();
  });
}

const renderState = (state) => {
    const div = document.createElement('div');
    div.className = 'total';
    const insertPoint = document.querySelector('.page-heading>h1');
    insertPoint.parentNode.after(div);
    div.innerHTML = '<h2>Beerizer export '+state.beers.length+' beers</h2><table>' +
        state.beers.map(({href, state, systemBolagetHref, systemBolagetTitle}, index) =>
            '<tr><td>'+( index + 1 )+'</td><td><a href="'+systemBolagetHref+'">'+systemBolagetTitle+'</a><td>'+state+'</td></td></tr>'
        ).join('') + '</table>';
}

const getElementByXpath = (xpath) =>
    document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

const doneSystemBolaget = async (state) => {
    GM.setValue(STATE_KEY, {...state, state: STATE_DONE})
    window.location.href = 'https://www.systembolaget.se/varukorg';
}

const initSystemBolaget = async (state) => {
    if (state.beers.length === 0) {
        await doneSystemBolaget(state);
    } else {
        await GM.setValue(STATE_KEY, {...state, state: STATE_PENDING})
        window.location.href = state.beers[0].href;
    }
}

const addBeerSystembolaget = async (state) => {
    const addToCartXpath = '//span[contains(text(),"Lägg i varukorgen")]';
    const {index, beers} = state;
    const beer = state.beers[index];
    beer.systemBolagetHref = window.location.href;
    try {
        beer.systemBolagetTitle = document.querySelector('.product-header .name').innerText;
        const cartBtn = getElementByXpath(addToCartXpath);
        cartBtn.click()
        //post condition?
        beer.state = STATE_DONE;
    } catch (error) {
        beer.state = STATE_ERROR;
        beer.error = error.message;
    }
    const nextIndex = index + 1;
    if (beers.length <= nextIndex) {
        await doneSystemBolaget(state);
    } else {
        await GM.setValue(STATE_KEY, {...state, index: nextIndex})
        window.location.href = beers[nextIndex].href;
    }
}

const handleSystembolaget = async () => {
    const state = await GM.getValue(STATE_KEY, INITIAL_STATE);
    console.log({state})
    if (state.state === STATE_INIT) {
        await initSystemBolaget(state);
    } else if (state.state === STATE_PENDING) {
        await addBeerSystembolaget(state);
    }
    if (window.location.pathname === '/varukorg') {
        renderState(state);
    }
}

const handleBeerizer = () => {
    const links = 'a[title="To Systembolaget"]';
    const cart = '.CartProductTable';
    const btn = 'cart-wrapper';
    const btnEl = document.getElementById(btn);
    console.log(btnEl);
    btnEl.addEventListener('click', async () => {
        console.log(document.querySelectorAll(links));
        const hrefs = [...document.querySelectorAll(links)].map(l => l.href);
        const beers = [...new Set(hrefs)].map(href => ({
            href,
            state: STATE_INIT
         }));
        const state = {
            ...INITIAL_STATE,
            state: STATE_INIT,
            beers
        }
        await GM.setValue(STATE_KEY, state)
        log({state})
    })
}

(function() {
    'use strict';
    const hostname = window.location.hostname;
    if (hostname.includes('beerizer')) {
        handleBeerizer()
    }
    if (hostname.includes('systembolaget')) {
        handleSystembolaget();
    }
})();
