# pdf.js viewer (vendored)

- Source: https://github.com/mozilla/pdf.js/releases/download/v6.4.299/pdfjs-6.4.299-legacy-dist.zip
- SHA-256 of the release zip: `c894bce53b2f4c3e13141e088c89cc051a1f7118ba4a2c02ec058798ae1303d1`
- Mozilla pdf.js `6.4.299` legacy build (`pdfjs-dist@6.4.299`), Apache-2.0,
  see `LICENSE`. Legacy because the modern build needs the very latest
  browsers; older iPhones could not run it.
- Installed by `npm run vendor:pdfjs-viewer`. Files are unchanged except
  `web/viewer.html`: it also loads `kitapkurdu.js` (settings) and
  `kitapkurdu.css` (both from `scripts/pdfjs-viewer/`), and its meta CSP
  allows inline styles, which WebKit needs for pdf.js's runtime page styles.
- Kept: viewer, engine (`build/pdf.mjs`, `build/pdf.worker.mjs`), images,
  Turkish and English texts. Fonts, CMaps and decoders: `public/vendor/pdfjs`.
