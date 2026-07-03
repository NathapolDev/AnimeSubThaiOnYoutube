'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class Element {
  constructor(tagName, className = '') {
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.dataset = {};
    this.children = [];
    this.parent = null;
    this.attributes = {};
    this.hidden = false;
    this.style = {};
    this._textContent = '';
    this.nodeType = 1;
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  insertAdjacentElement(position, element) {
    assert.equal(position, 'afterend');
    const index = this.parent.children.indexOf(this);
    element.parent = this.parent;
    this.parent.children.splice(index + 1, 0, element);
    return element;
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }

  matches(selector) {
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  querySelectorAll(selector) {
    const results = [];
    const visit = node => {
      for (const child of node.children) {
        if (child.matches(selector)) results.push(child);
        visit(child);
      }
    };
    visit(this);
    return results;
  }

  set innerHTML(html) {
    this.children = [];
    this._textContent = '';
    if (html === '<i></i><span></span>') {
      this.appendChild(new Element('i'));
      this.appendChild(new Element('span'));
    } else {
      this._textContent = html;
    }
  }

  get textContent() {
    return this.children.length ? this.children.map(child => child.textContent).join('') : this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }
}

function buildCard(id, progressText = null) {
  const card = new Element('article', 'anime-card');
  card.dataset.id = id;
  const episodeRow = new Element('div', 'episode-row');
  card.appendChild(episodeRow);

  if (progressText !== null) {
    const progress = new Element('div', 'progress');
    progress.setAttribute('role', 'img');
    const bar = new Element('i');
    const label = new Element('span');
    label.textContent = progressText;
    progress.appendChild(bar);
    progress.appendChild(label);
    card.appendChild(progress);
  }

  return card;
}

function runProgressFix(data, cards) {
  const body = new Element('body');
  cards.forEach(card => body.appendChild(card));

  const document = {
    readyState: 'complete',
    body,
    createElement: tagName => new Element(tagName),
    querySelectorAll: selector => body.querySelectorAll(selector),
    addEventListener: () => {}
  };

  const source = fs.readFileSync(path.join(__dirname, '..', 'progress-fix.js'), 'utf8');
  vm.runInNewContext(source, {
    window: { ANIME_DATA: data },
    document,
    Node: { ELEMENT_NODE: 1 },
    requestAnimationFrame: callback => callback(),
    MutationObserver: class { observe() {} }
  });
}

test('progress bar uses detected YouTube episode count instead of latest episode number', () => {
  const card = buildCard('rezero', '77/19');
  runProgressFix([
    {
      id: 'rezero',
      episodes: 19,
      currentEpisode: 77,
      availableEpisodes: Array.from({ length: 15 }, (_, index) => ({ number: index + 1 }))
    }
  ], [card]);

  const progress = card.querySelector('.progress');
  assert.equal(progress.querySelector('span').textContent, '15/19');
  assert.equal(progress.querySelector('i').style.width, '79%');
  assert.equal(progress.getAttribute('aria-label'), 'พบตอนจาก YouTube 15 จาก 19 ตอน');
  assert.equal(progress.hidden, false);
});

test('progress bar caps detected YouTube episode count at season total', () => {
  const card = buildCard('cap', '77/19');
  runProgressFix([
    {
      id: 'cap',
      episodes: 19,
      currentEpisode: 77,
      availableEpisodes: Array.from({ length: 25 }, (_, index) => ({ number: index + 1 }))
    }
  ], [card]);

  const progress = card.querySelector('.progress');
  assert.equal(progress.querySelector('span').textContent, '19/19');
  assert.equal(progress.querySelector('i').style.width, '100%');
});

test('progress bar is created when YouTube episodes exist but app.js did not render one', () => {
  const card = buildCard('create');
  runProgressFix([
    {
      id: 'create',
      episodes: 12,
      currentEpisode: 0,
      availableEpisodes: Array.from({ length: 3 }, (_, index) => ({ number: index + 1 }))
    }
  ], [card]);

  const progress = card.querySelector('.progress');
  assert.ok(progress);
  assert.equal(progress.querySelector('span').textContent, '3/12');
  assert.equal(progress.querySelector('i').style.width, '25%');
});

test('progress bar is hidden when no YouTube episodes were detected', () => {
  const card = buildCard('empty', '5/12');
  runProgressFix([
    { id: 'empty', episodes: 12, currentEpisode: 5, availableEpisodes: [] }
  ], [card]);

  assert.equal(card.querySelector('.progress').hidden, true);
});
