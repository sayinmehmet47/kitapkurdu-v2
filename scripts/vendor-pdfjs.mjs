// Copies the pdf.js decoder and font data the PDF preview loads at runtime
// (scanned-page image decoders, CMaps, standard fonts) into public/, so they
// are served from this site. Run after upgrading pdfjs-dist:
//   npm run vendor:pdfjs
// tests/pdfjs-assets.test.ts fails while the copy and the package differ.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const source = new URL("../node_modules/pdfjs-dist/", import.meta.url);
const target = new URL("../public/vendor/pdfjs/", import.meta.url);
// quickjs-eval is for PDF scripting, which the preview never enables.
const skip = /quickjs-eval/;

const { version } = JSON.parse(
	await readFile(new URL("package.json", source), "utf8"),
);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const dir of ["wasm", "cmaps", "standard_fonts", "iccs"]) {
	await cp(new URL(`${dir}/`, source), new URL(`${dir}/`, target), {
		recursive: true,
		filter: (path) => !skip.test(path),
	});
}
await writeFile(
	new URL("VERSION.md", target),
	`# pdf.js runtime data (vendored)

- Source: npm \`pdfjs-dist@${version}\`, unchanged; licenses are next to the files.
- Copied by \`npm run vendor:pdfjs\`; \`quickjs-eval\` (PDF scripting) is left out.
- Used by \`src/lib/pdfjs.ts\` (\`wasmUrl\`, \`cMapUrl\`, \`standardFontDataUrl\`,
  \`iccUrl\`). Without the decoders, scanned pages (JBIG2/CCITT/JPX) stay blank.
`,
);
console.log(
	`Vendored pdfjs-dist@${version} runtime data into public/vendor/pdfjs.`,
);
