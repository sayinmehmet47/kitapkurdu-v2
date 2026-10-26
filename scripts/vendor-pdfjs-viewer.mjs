// Installs Mozilla's pdf.js viewer (the reader Firefox uses: zoom, pinch-zoom,
// scrolling, thumbnails, outline, search) into public/vendor/pdfjs-viewer,
// from the official release that matches the installed pdfjs-dist:
//   npm run vendor:pdfjs-viewer
// Only the viewer, its engine, images and the Turkish/English texts are kept;
// fonts, CMaps and decoders come from public/vendor/pdfjs (vendor:pdfjs).
// tests/pdfjs-assets.test.ts fails while the versions differ.
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";

const root = new URL("../", import.meta.url);
const target = new URL("public/vendor/pdfjs-viewer/", root);
const { version } = JSON.parse(
	await readFile(new URL("node_modules/pdfjs-dist/package.json", root), "utf8"),
);
const url = `https://github.com/mozilla/pdf.js/releases/download/v${version}/pdfjs-${version}-dist.zip`;
const response = await fetch(url);
if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
const zip = new Uint8Array(await response.arrayBuffer());
const sha256 = createHash("sha256").update(zip).digest("hex");
const files = unzipSync(zip);

const keep = (name) =>
	name === "LICENSE" ||
	name === "build/pdf.mjs" ||
	name === "build/pdf.worker.mjs" ||
	/^web\/(viewer\.(html|mjs|css)|images\/.+|locale\/(tr|en-US)\/.+)$/.test(
		name,
	);

// The settings script must run before viewer.mjs reads its options; the
// stylesheet hides controls that do not apply here.
const CONFIG_TAG = '<script src="kitapkurdu.js"></script>';
function patch(name, bytes) {
	if (name !== "web/viewer.html") return bytes;
	const html = strFromU8(bytes);
	const anchor = '<script src="../build/pdf.mjs" type="module"></script>';
	if (!html.includes(anchor)) throw new Error("viewer.html layout changed");
	// pdf.js builds per-page styles at runtime; WebKit (iPhone) refuses them
	// under the viewer's own "style-src 'self'" meta policy. public/_headers
	// sends the policy this site relies on.
	const policy = "style-src 'self';";
	if (!html.includes(policy)) throw new Error("viewer.html CSP changed");
	const css = '<link rel="stylesheet" href="viewer.css" />';
	if (!html.includes(css)) throw new Error("viewer.html layout changed");
	return new TextEncoder().encode(
		html
			.replace(policy, "style-src 'self' 'unsafe-inline';")
			.replace(anchor, `${CONFIG_TAG}\n${anchor}`)
			.replace(
				css,
				`${css}\n    <link rel="stylesheet" href="kitapkurdu.css" />`,
			),
	);
}

const config = await readFile(
	new URL("scripts/pdfjs-viewer/kitapkurdu.js", root),
).catch(() => null);
const style = await readFile(
	new URL("scripts/pdfjs-viewer/kitapkurdu.css", root),
).catch(() => null);
if (!config || !style) throw new Error("scripts/pdfjs-viewer/* is missing");

await rm(target, { recursive: true, force: true });
for (const [name, bytes] of Object.entries(files)) {
	if (name.endsWith("/") || !keep(name)) continue;
	const out = new URL(name, target);
	await mkdir(dirname(fileURLToPath(out)), { recursive: true });
	await writeFile(out, patch(name, bytes));
}
// Only the two shipped languages; anything else falls back to English.
await writeFile(
	new URL("web/locale/locale.json", target),
	JSON.stringify({ tr: "tr/viewer.ftl", "en-us": "en-US/viewer.ftl" }),
);
await writeFile(new URL("web/kitapkurdu.js", target), config);
await writeFile(new URL("web/kitapkurdu.css", target), style);
await writeFile(
	new URL("VERSION.md", target),
	`# pdf.js viewer (vendored)

- Source: ${url}
- SHA-256 of the release zip: \`${sha256}\`
- Mozilla pdf.js \`${version}\` (\`pdfjs-dist@${version}\`), Apache-2.0, see \`LICENSE\`.
- Installed by \`npm run vendor:pdfjs-viewer\`. Files are unchanged except
  \`web/viewer.html\`: it also loads \`kitapkurdu.js\` (settings) and
  \`kitapkurdu.css\` (both from \`scripts/pdfjs-viewer/\`), and its meta CSP
  allows inline styles, which WebKit needs for pdf.js's runtime page styles.
- Kept: viewer, engine (\`build/pdf.mjs\`, \`build/pdf.worker.mjs\`), images,
  Turkish and English texts. Fonts, CMaps and decoders: \`public/vendor/pdfjs\`.
`,
);
console.log(`Vendored pdf.js viewer ${version} (sha256 ${sha256}).`);
