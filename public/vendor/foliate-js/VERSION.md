# foliate-js (vendored)

- Source: npm `foliate-js@1.0.1` (https://github.com/johnfactotum/foliate-js), MIT, see `LICENSE`.
- Upstream recommends vendoring (API not stable), so the files are pinned here unchanged except:
  - `fixed-layout.js`: removed `import 'construct-style-sheets-polyfill'` (bare import; native support).
- Only the files needed to render EPUB are included. Served same-origin under a strict CSP
  (`public/_headers`); see `public/reader/frame.js`.
