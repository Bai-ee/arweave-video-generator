// Deliberately minimal DOM stand-in for detectPageType/selectInitialTargets
// tests -- there is no jsdom in this repo and the policy+test phase may not
// install one. This is NOT a real selector engine: it supports exactly what
// the real markup in website/*.html needs -- an optional tag name, then any
// number of `.class` / `[attr]` / `[attr="value"]` parts (ANDed together),
// with `,` meaning "or" (e.g. "a[data-playlist], a[data-link]"). No
// descendant combinators -- every selector used against these fixtures is
// applied directly to a doc or a single element's subtree, which is all
// detectPageType/selectInitialTargets are expected to need.

function matchesOne(el, simple) {
  var tagMatch = /^[a-zA-Z][\w-]*/.exec(simple);
  if (tagMatch && el.tag !== tagMatch[0].toLowerCase()) return false;
  var rest = tagMatch ? simple.slice(tagMatch[0].length) : simple;
  var partRe = /\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g;
  var m;
  while ((m = partRe.exec(rest))) {
    if (m[1]) {
      var classes = (el.attrs['class'] || '').split(/\s+/);
      if (classes.indexOf(m[1]) === -1) return false;
    } else if (!(m[2] in el.attrs) || (m[3] !== undefined && el.attrs[m[2]] !== m[3])) {
      return false;
    }
  }
  return true;
}

function matches(el, selector) {
  return selector.split(',').some(function (s) { return matchesOne(el, s.trim()); });
}

function flatten(el, out) {
  out.push(el);
  el.children.forEach(function (c) { flatten(c, out); });
  return out;
}

function makeElement(desc, parent) {
  var el = {
    tag: (desc.tag || 'div').toLowerCase(),
    attrs: Object.assign({}, desc.attrs),
    parent: parent || null,
    children: []
  };
  el.children = (desc.children || []).map(function (c) { return makeElement(c, el); });
  el.getAttribute = function (name) { return name in el.attrs ? el.attrs[name] : null; };
  // dataset-ish accessor: data-featured-mix -> el.dataset.featuredMix, same
  // undefined-when-absent behavior as the real DOM's HTMLElement.dataset.
  el.dataset = new Proxy({}, {
    get: function (_t, key) {
      var attr = 'data-' + String(key).replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); });
      return el.attrs[attr];
    }
  });
  el.closest = function (selector) {
    for (var node = el; node; node = node.parent) {
      if (matches(node, selector)) return node;
    }
    return null;
  };
  el.querySelectorAll = function (selector) {
    return flatten(el, []).slice(1).filter(function (n) { return matches(n, selector); });
  };
  el.querySelector = function (selector) { return el.querySelectorAll(selector)[0] || null; };
  return el;
}

// desc: { children: [ { tag, attrs, children }, ... ] } describing one
// fixture page's DOM. Returns a doc-like root element (querySelector(All)
// only, no document.body/location -- detectPageType has no way to see a
// filename or URL through this helper, which is deliberate).
export function makeFakeDoc(desc) {
  return makeElement(Object.assign({ tag: 'document' }, desc), null);
}
