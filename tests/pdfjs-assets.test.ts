import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

const pkg = new URL("../node_modules/pdfjs-dist/", import.meta.url);
const vendored = new URL("../public/vendor/pdfjs/", import.meta.url);

test("vendored pdf.js decoders and fonts match the installed pdfjs-dist", async () => {
	const { version } = JSON.parse(
		await readFile(new URL("package.json", pkg), "utf8"),
	);
	assert.match(
		await readFile(new URL("VERSION.md", vendored), "utf8"),
		new RegExp(`pdfjs-dist@${version.replaceAll(".", "\\.")}\``),
		"Run `npm run vendor:pdfjs` after upgrading pdfjs-dist",
	);
	// Scanned books need these decoders; without them pages render blank.
	for (const file of ["jbig2.wasm", "openjpeg.wasm", "qcms_bg.wasm"]) {
		assert.ok((await readdir(new URL("wasm/", vendored))).includes(file), file);
	}
	for (const dir of ["wasm", "cmaps", "standard_fonts", "iccs"]) {
		const expected = (await readdir(new URL(`${dir}/`, pkg))).filter(
			(file) => !file.startsWith("quickjs-eval"),
		);
		const actual = await readdir(new URL(`${dir}/`, vendored));
		assert.deepEqual(actual.sort(), expected.sort(), dir);
		for (const file of expected) {
			assert.ok(
				(await readFile(new URL(`${dir}/${file}`, vendored))).equals(
					await readFile(new URL(`${dir}/${file}`, pkg)),
				),
				`${dir}/${file} differs; run npm run vendor:pdfjs`,
			);
		}
	}
});

test("the vendored pdf.js viewer matches pdfjs-dist and carries our settings", async () => {
	const viewer = new URL("../public/vendor/pdfjs-viewer/", import.meta.url);
	const { version } = JSON.parse(
		await readFile(new URL("package.json", pkg), "utf8"),
	);
	assert.match(
		await readFile(new URL("VERSION.md", viewer), "utf8"),
		new RegExp(`pdfjs-dist@${version.replaceAll(".", "\\.")}\``),
		"Run `npm run vendor:pdfjs-viewer` after upgrading pdfjs-dist",
	);
	const html = await readFile(new URL("web/viewer.html", viewer), "utf8");
	assert.ok(html.includes('<script src="kitapkurdu.js"></script>'));
	assert.ok(html.includes('href="kitapkurdu.css"'));
	assert.ok(html.includes("style-src 'self' 'unsafe-inline';"));
	for (const file of ["kitapkurdu.js", "kitapkurdu.css"]) {
		assert.ok(
			(await readFile(new URL(`web/${file}`, viewer))).equals(
				await readFile(
					new URL(`../scripts/pdfjs-viewer/${file}`, import.meta.url),
				),
			),
			`${file} differs; run npm run vendor:pdfjs-viewer`,
		);
	}
	// PDF scripting stays off.
	assert.match(
		await readFile(new URL("web/kitapkurdu.js", viewer), "utf8"),
		/enableScripting: false/,
	);
});
