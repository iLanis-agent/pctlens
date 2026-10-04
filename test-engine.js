'use strict';
var P = require('./engine.js'), assert = require('assert'), n = 0, fails = 0;
function eq(a, b, m) { n++; try { assert.deepStrictEqual(a, b); } catch (e) { fails++; console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); } }
var E = P.ENCODERS.reduce(function (o, e) { o[e.id] = e.fn; return o; }, {});
function dec(s, plus) { return P.decode(s, plus); }
// WHATWG URL Standard worked examples (UTF-8 rows)
eq(E.userinfo('\u2261'), '%E2%89%A1', 'spec: userinfo U+2261'); eq(E.userinfo('\u203D'), '%E2%80%BD', 'spec: userinfo U+203D');
eq(E.userinfo('Say what\u203D'), 'Say%20what%E2%80%BD', 'spec: Say what');
eq(Array.from(dec('%25%s%1G').bytes), Array.from(new TextEncoder().encode('%%s%1G')), 'spec: percent-decode %25%s%1G');
eq(Array.from(dec('\u203D%25%2E').bytes), [0xE2, 0x80, 0xBD, 0x25, 0x2E], 'spec: percent-decode with ‽');
eq(E.form('1+1 \u2261 2%20'), '1%2B1+%E2%89%A1+2%2520', 'form: UTF-8 version of the spec Shift_JIS row');
// set membership straight from the spec text
function setOf(name) { var o = ''; for (var b = 0x20; b < 0x7f; b++) if (P.inSet(b, name)) o += String.fromCharCode(b); return o; }
eq(setOf('fragment'), ' "<>`', 'fragment set'); eq(setOf('query'), ' "#<>', 'query set'); eq(setOf('specialQuery'), ' "#\'<>', 'special-query set');
eq(setOf('path'), ' "#<>?^`{}', 'path set'); eq(setOf('userinfo'), ' "#/:;<=>?@[\\]^`{|}', 'userinfo set');
eq(setOf('component'), ' "#$%&+,/:;<=>?@[\\]^`{|}', 'component set');
eq(setOf('form'), ' !"#$%&\'()+,/:;<=>?@[\\]^`{|}~', 'form set is everything but alnum and *-._');
eq(P.inSet(0x1f, 'query') && P.inSet(0x7f, 'query') && P.inSet(0x80, 'fragment') && !P.inSet(0x7e, 'query'), true, 'C0 controls, DEL, non-ASCII in; ~ out');
// RFC 3986 grammar
var unres = ''; for (var b = 0x21; b < 0x7f; b++) { var c = String.fromCharCode(b); if (E.rfc3986(c) === c) unres += c; }
eq(unres, '-.0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~', 'RFC 3986 unreserved');
// seeded random strings vs Node oracles
var seed = 20261004; function rnd(k) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % k; }
var POOL = []; for (var i = 0x20; i < 0x7f; i++) POOL.push(String.fromCharCode(i)); POOL = POOL.concat(['\u00e9', '\u203d', '\u2261', '\u4e2d', '\u{1F600}', '\u00a0', '\u0001', '\u007f']);
function rs(len) { var s = ''; for (var k = 0; k < len; k++) s += POOL[rnd(POOL.length)]; return s; }
for (i = 0; i < 1500; i++) {
  var s = rs(1 + rnd(14));
  eq(E.jsComponent(s), encodeURIComponent(s), 'encodeURIComponent ' + JSON.stringify(s));
  eq(E.jsUri(s), encodeURI(s), 'encodeURI ' + JSON.stringify(s));
  eq(E.form(s), new URLSearchParams({ a: s }).toString().slice(2), 'URLSearchParams serialize ' + JSON.stringify(s));
  // round trips
  eq(dec(E.rfc3986(s)).text, s, 'rfc roundtrip'); eq(dec(E.component(s)).text, s, 'component roundtrip'); eq(dec(E.form(s), true).text, s, 'form roundtrip');
  eq(decodeURIComponent(E.rfc3986(s)), s, 'decodeURIComponent of rfc3986');
  // URL parser oracles (avoid characters the parser strips or treats as structure)
  var t = s.replace(/[\t\n\r\\\/?#.^]/g, 'x'); // ^ excluded: the spec text adds it to the path set, Node 22's URL parser does not yet
  eq(new URL('foo://h/' + t + 'x').pathname, '/' + E.path(t) + 'x', 'URL path ' + JSON.stringify(t));
  var q = s.replace(/[\t\n\r#]/g, 'x');
  eq(new URL('http://h/?' + q + 'x').search, '?' + E.specialQuery(q) + 'x', 'URL special query ' + JSON.stringify(q));
  eq(new URL('foo://h/?' + q + 'x').search, '?' + E.query(q) + 'x', 'URL non-special query ' + JSON.stringify(q));
  var f = s.replace(/[\t\n\r]/g, 'x');
  eq(new URL('http://h/#' + f + 'x').hash, '#' + E.fragment(f) + 'x', 'URL fragment ' + JSON.stringify(f));
  var u = new URL('http://h/'); u.username = s;
  eq(u.username, E.userinfo(s), 'URL username ' + JSON.stringify(s));
  // form decoding vs URLSearchParams (plus -> space, malformed % kept)
  var raw = ''; for (var k = 0; k < 1 + rnd(10); k++) raw += pick(['%', '+', 'a', '%41', '%zz', '%E2%80%BD', '%E2', '%2', ' ', '1', '%C3%A9']);
  var want = new URLSearchParams('k=' + raw).get('k'), got = dec(raw, true).text;
  eq(got, want, 'form decode ' + JSON.stringify(raw));
}
function pick(a) { return a[rnd(a.length)]; }
// flags
eq(dec('%25252F').stillEncoded, true, 'double-encoding flag'); eq(dec('a%2F').stillEncoded, false, 'no flag');
eq(dec('%E2%80').validUtf8, false, 'truncated UTF-8 flagged'); eq(dec('%FF').validUtf8, false, '0xFF flagged'); eq(dec('%C3%A9').validUtf8, true, 'valid UTF-8');
eq(dec('100%').malformed, 1, 'trailing % malformed'); eq(dec('%4').malformed, 1, '%4 malformed'); eq(dec('%41%4G').malformed, 1, 'one malformed');
eq(dec('a+b', true).text, 'a b', 'plus as space'); eq(dec('a+b', false).text, 'a+b', 'plus kept');
eq(P.chars('a\u00e9').map(function (c) { return c.bytes; }), ['%61', '%C3%A9'], 'char bytes');
console.log(n + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
