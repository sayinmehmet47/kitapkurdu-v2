# pdf.js viewer (vendored)

- Source: https://github.com/mozilla/pdf.js/releases/download/v6.4.299/pdfjs-6.4.299-dist.zip
- SHA-256 of the release zip: `f2245eb7ef3f674c872fe568a177bfec15874f5c034613e55d8e307f93ebd86d`
- Mozilla pdf.js `6.4.299` (`pdfjs-dist@6.4.299`), Apache-2.0, see `LICENSE`.
- Installed by `npm run vendor:pdfjs-viewer`. Files are unchanged except
  `web/viewer.html`: it also loads `kitapkurdu.js` (settings) and
  `kitapkurdu.css` (both from `scripts/pdfjs-viewer/`), and its meta CSP
  allows inline styles, which WebKit needs for pdf.js's runtime page styles.
- Kept: viewer, engine (`build/pdf.mjs`, `build/pdf.worker.mjs`), images,
  Turkish and English texts. Fonts, CMaps and decoders: `public/vendor/pdfjs`.
