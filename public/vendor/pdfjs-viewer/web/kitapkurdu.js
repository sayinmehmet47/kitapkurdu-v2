// KitapKurdu settings for the vendored pdf.js viewer (not part of pdf.js).
// viewer.html loads this before viewer.mjs, which announces itself with a
// "webviewerloaded" event on the parent page's document (same origin).
(() => {
	let target = document;
	try {
		target = parent.document;
	} catch {
		// Opened on its own: the viewer then dispatches on this document.
	}
	target.addEventListener("webviewerloaded", (event) => {
		if (event.detail?.source !== window) return;
		const options = window.PDFViewerApplicationOptions;
		const data = "/vendor/pdfjs/";
		for (const [name, value] of Object.entries({
			// No sample document when no file is given.
			defaultUrl: "",
			// Never run JavaScript embedded in a PDF.
			enableScripting: false,
			// A reading app: no annotation, signature or comment tools.
			annotationEditorMode: -1,
			enableSignatureEditor: false,
			enableComment: false,
			// Settings come from here, not from earlier visits' storage.
			disablePreferences: true,
			localeProperties: { lang: "tr" },
			// Fonts, CMaps and image decoders (scanned books) are shared with
			// the upload page; see public/vendor/pdfjs.
			cMapUrl: `${data}cmaps/`,
			standardFontDataUrl: `${data}standard_fonts/`,
			wasmUrl: `${data}wasm/`,
			iccUrl: `${data}iccs/`,
		}))
			options.set(name, value);

		// The viewer only logs a file it cannot open; say so on the page.
		window.PDFViewerApplication.initializedPromise.then(() => {
			window.PDFViewerApplication.eventBus.on("documenterror", (event) => {
				const box = document.createElement("div");
				box.id = "kitapkurdu-error";
				box.setAttribute("role", "alert");
				const title = document.createElement("p");
				title.textContent = event.message;
				const hint = document.createElement("p");
				hint.textContent =
					"Dosyayı indirip bir PDF uygulamasıyla açmayı deneyebilirsin.";
				box.append(title, hint);
				document.getElementById("kitapkurdu-error")?.remove();
				document.body.append(box);
			});
		});
	});
})();
