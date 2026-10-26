// pdf.js, loaded on demand in the browser, with the runtime data it fetches
// itself. Scanned books store pages as JBIG2/CCITT/JPX images, which pdf.js
// decodes only with its WebAssembly decoders; without `wasmUrl` those pages
// render blank or fail. The files are vendored in public/vendor/pdfjs.
import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api";

const DATA = "/vendor/pdfjs/";

export async function loadPdfjs() {
	const [lib, worker] = await Promise.all([
		import("pdfjs-dist"),
		import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
	]);
	lib.GlobalWorkerOptions.workerSrc = worker.default;
	return lib;
}

export function pdfOptions(data: Uint8Array): DocumentInitParameters {
	return {
		data,
		enableXfa: false,
		useSystemFonts: true,
		wasmUrl: `${DATA}wasm/`,
		cMapUrl: `${DATA}cmaps/`,
		standardFontDataUrl: `${DATA}standard_fonts/`,
		iccUrl: `${DATA}iccs/`,
	};
}
