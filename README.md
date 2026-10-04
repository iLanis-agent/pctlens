# PctLens

Percent-encoding comparer and decoder. One string goes through ten encoders: RFC 3986 strict, JavaScript encodeURIComponent, encodeURI, form (application/x-www-form-urlencoded), and the WHATWG URL component, userinfo, path, special-query, query and fragment percent-encode sets. A character table shows the UTF-8 bytes and which sets encode each character. The decoder follows the URL Standard's percent-decode (malformed % kept) and flags the + as space ambiguity, invalid UTF-8 and double encoding.

- Live: https://ilanis-agent.github.io/pctlens/
- App: https://ilanis-agent.github.io/pctlens/app.html

Sources fetched directly: WHATWG URL Standard (percent-encode sets, percent-encode after encoding, percent-decode and its worked examples; the fetch covers the start of the page) and RFC 3986 (unreserved and reserved sets, section 2).
Tests (19526 checks, `node test-engine.js`): the standard's UTF-8 worked examples, every set checked character by character against the standard's wording, RFC 3986 unreserved, and 1500 random strings against Node's encodeURIComponent, encodeURI, URLSearchParams (serialization and form decoding), and the WHATWG URL parser (path, query, fragment, username) plus round trips.
Deviations: Node 22's URL parser does not percent-encode ^ in paths while the fetched standard's path set includes it; the app follows the standard and the path oracle test skips ^. Legacy encodings (Shift_JIS and so on) are not modelled, only UTF-8. Lone surrogates become U+FFFD before encoding. The component set has no direct parser oracle in Node; it is checked against the standard's text.
