(function (root) {
  'use strict';
  // Percent-encode sets from the WHATWG URL Standard (https://url.spec.whatwg.org/#percent-encoded-bytes)
  // Each set is: C0 controls (0x00-0x1F) and everything above 0x7E, plus the listed ASCII characters.
  var EXTRA = {};
  EXTRA.c0 = '';
  EXTRA.fragment = ' "<>`';
  EXTRA.query = ' "#<>';
  EXTRA.specialQuery = EXTRA.query + "'";
  EXTRA.path = EXTRA.query + '?^`{}';
  EXTRA.userinfo = EXTRA.path + '/:;=@[\\]|';
  EXTRA.component = EXTRA.userinfo + '$%&+,';
  // application/x-www-form-urlencoded: everything except ASCII alphanumerics and * - . _
  var FORM_KEEP = '*-._';
  var UNRESERVED = '-._~'; // RFC 3986 unreserved besides ALPHA / DIGIT
  var JS_COMPONENT_KEEP = "-_.!~*'()";
  var JS_URI_KEEP = JS_COMPONENT_KEEP + ';/?:@&=+$,#';
  var HEX = '0123456789ABCDEF';

  function isAlnum(b) { return (b >= 48 && b <= 57) || (b >= 65 && b <= 90) || (b >= 97 && b <= 122); }
  function utf8(str) { return new TextEncoder().encode(str.toWellFormed ? str.toWellFormed() : str); }
  function pct(b) { return '%' + HEX[b >> 4] + HEX[b & 15]; }
  function inSet(b, name) { // percent-encode set membership for a byte
    if (name === 'form') return !(isAlnum(b) || FORM_KEEP.indexOf(String.fromCharCode(b)) >= 0);
    if (b < 0x20 || b > 0x7e) return true;
    return EXTRA[name].indexOf(String.fromCharCode(b)) >= 0;
  }
  function encodeWith(str, keepFn, spaceAsPlus) {
    var out = '', bytes = utf8(str);
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if (spaceAsPlus && b === 0x20) out += '+';
      else if (keepFn(b)) out += String.fromCharCode(b);
      else out += pct(b);
    }
    return out;
  }
  var ENCODERS = [
    { id: 'rfc3986', name: 'RFC 3986 strict', note: 'Keeps only unreserved: letters, digits and - . _ ~. Safe for any single URI component.', fn: function (s) { return encodeWith(s, function (b) { return isAlnum(b) || UNRESERVED.indexOf(String.fromCharCode(b)) >= 0; }); } },
    { id: 'jsComponent', name: 'JavaScript encodeURIComponent', note: "Also keeps ! * ' ( ) unescaped.", fn: function (s) { return encodeWith(s, function (b) { return isAlnum(b) || JS_COMPONENT_KEEP.indexOf(String.fromCharCode(b)) >= 0; }); } },
    { id: 'jsUri', name: 'JavaScript encodeURI', note: 'Also keeps ; / ? : @ & = + $ , # so a whole URL keeps its shape. Wrong for a value.', fn: function (s) { return encodeWith(s, function (b) { return isAlnum(b) || JS_URI_KEEP.indexOf(String.fromCharCode(b)) >= 0; }); } },
    { id: 'form', name: 'Form (application/x-www-form-urlencoded)', note: 'Space becomes +. Keeps only letters, digits and * - . _', fn: function (s) { return encodeWith(s, function (b) { return !inSet(b, 'form'); }, true); } },
    { id: 'component', name: 'WHATWG component set', note: 'What URL parsing treats as a full component. Keeps ! \' ( ) * - . _ ~ and letters, digits.', fn: function (s) { return encodeWith(s, function (b) { return !inSet(b, 'component'); }); } },
    { id: 'userinfo', name: 'WHATWG userinfo set', note: 'Used for the username and password in a URL.', fn: function (s) { return encodeWith(s, function (b) { return !inSet(b, 'userinfo'); }); } },
    { id: 'path', name: 'WHATWG path set', note: 'What the URL parser does to a path. Leaves / : @ & = + $ , ; alone and does not touch %.', fn: function (s) { return encodeWith(s, function (b) { return !inSet(b, 'path'); }); } },
    { id: 'specialQuery', name: 'WHATWG query set (http, https)', note: "Query of a special scheme. Also encodes ' but leaves & = + / ? alone and does not touch %.", fn: function (s) { return encodeWith(s, function (b) { return !inSet(b, 'specialQuery'); }); } },
    { id: 'query', name: 'WHATWG query set (other schemes)', note: 'Query of a non-special scheme.', fn: function (s) { return encodeWith(s, function (b) { return !inSet(b, 'query'); }); } },
    { id: 'fragment', name: 'WHATWG fragment set', note: 'What follows #. Encodes space " < > ` and non-ASCII.', fn: function (s) { return encodeWith(s, function (b) { return !inSet(b, 'fragment'); }); } }
  ];
  function encodeAll(str) { var o = {}; ENCODERS.forEach(function (e) { o[e.id] = e.fn(str); }); return o; }

  // WHATWG "percent-decode": malformed % sequences are left as they are.
  function hexv(c) { return c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1; }
  function decode(str, plusAsSpace) {
    var inp = new TextEncoder().encode(str), out = [], malformed = 0, decoded = 0;
    for (var i = 0; i < inp.length; i++) {
      var b = inp[i];
      if (plusAsSpace && b === 0x2b) { out.push(0x20); continue; }
      if (b !== 0x25) { out.push(b); continue; }
      var h = i + 2 <= inp.length - 1 ? hexv(inp[i + 1]) : -1, l = i + 2 <= inp.length - 1 ? hexv(inp[i + 2]) : -1;
      if (h < 0 || l < 0) { out.push(b); malformed++; continue; }
      out.push(h * 16 + l); decoded++; i += 2;
    }
    var bytes = Uint8Array.from(out), valid = true, text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { valid = false; text = new TextDecoder('utf-8').decode(bytes); }
    return { text: text, bytes: bytes, validUtf8: valid, malformed: malformed, decodedCount: decoded, stillEncoded: /%[0-9A-Fa-f]{2}/.test(text) };
  }
  function hasPlus(str) { return str.indexOf('+') >= 0; }
  function chars(str) {
    var out = [], s = str.toWellFormed ? str.toWellFormed() : str;
    Array.from(s).forEach(function (ch) {
      var cp = ch.codePointAt(0), by = Array.from(utf8(ch)), inSets = [];
      ['fragment', 'query', 'path', 'userinfo', 'component', 'form'].forEach(function (n) { if (by.some(function (b) { return inSet(b, n); })) inSets.push(n); });
      out.push({ ch: ch, cp: cp, bytes: by.map(function (b) { return pct(b); }).join(''), encodedIn: inSets, reserved: ':/?#[]@!$&\'()*+,;='.indexOf(ch) >= 0, unreserved: /^[A-Za-z0-9\-._~]$/.test(ch) });
    });
    return out;
  }
  var api = { ENCODERS: ENCODERS, encodeAll: encodeAll, decode: decode, chars: chars, inSet: inSet, hasPlus: hasPlus, utf8: utf8 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PctLens = api;
})(typeof window !== 'undefined' ? window : this);
