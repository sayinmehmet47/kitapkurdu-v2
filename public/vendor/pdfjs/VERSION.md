# pdf.js runtime data (vendored)

- Source: npm `pdfjs-dist@6.4.299`, unchanged; licenses are next to the files.
- Copied by `npm run vendor:pdfjs`; `quickjs-eval` (PDF scripting) is left out.
- Used by `src/lib/pdfjs.ts` (`wasmUrl`, `cMapUrl`, `standardFontDataUrl`,
  `iccUrl`). Without the decoders, scanned pages (JBIG2/CCITT/JPX) stay blank.
