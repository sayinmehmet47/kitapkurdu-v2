// EPUB reading surface. Runs in its own same-origin document so a strict CSP
// (public/_headers) can block every script except this app's own, including
// any script inside a book. The parent page (src/routes/read/$id.tsx) owns the
// toolbar, settings, and table of contents and talks to this frame through
// postMessage.
import { makeBook } from "/vendor/foliate-js/view.js";
import { sanitizeBookData, stripHandlerAttributes } from "./sanitize.js";

// foliate-js parses every book document with DOMParser; strip inline handlers
// from book markup first so nothing in this frame ever sees them.
const parseFromString = DOMParser.prototype.parseFromString;
DOMParser.prototype.parseFromString = function (markup, type) {
	const strip = typeof markup === "string" && /html|xml|svg/i.test(type);
	return parseFromString.call(
		this,
		strip ? stripHandlerAttributes(markup) : markup,
		type,
	);
};

const THEMES = {
	light: { background: "#f9f6f0", color: "#241e1a", link: "#872c2a" },
	sepia: { background: "#f3e9d2", color: "#4a3826", link: "#8a4220" },
	dark: { background: "#1a1512", color: "#e2dbd1", link: "#e69186" },
};
const FONTS = {
	serif: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
	sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

const id = new URLSearchParams(location.search).get("id") ?? "";
const positionKey = `kitapkurdu:reader:position:${id}`;
const status = document.getElementById("status");
let view;
// Replayed on "hello": the parent page may hydrate after this frame has loaded.
let readyMessage;
let lastRelocate;
let settings = {
	fontSize: 100,
	lineHeight: 1.6,
	theme: "light",
	font: "serif",
	flow: "paginated",
};

const post = (message) => parent.postMessage(message, location.origin);

function storage(action, value) {
	try {
		if (action === "get") return localStorage.getItem(positionKey);
		localStorage.setItem(positionKey, value);
	} catch {
		// Storage can be unavailable (private mode); reading still works.
	}
	return null;
}

function bookCss() {
	const theme = THEMES[settings.theme] ?? THEMES.light;
	const font = FONTS[settings.font];
	return `
		@namespace epub "http://www.idpf.org/2007/ops";
		html {
			color-scheme: ${settings.theme === "dark" ? "dark" : "light"};
			font-size: ${settings.fontSize}% !important;
		}
		html, body {
			background: transparent !important;
			color: ${theme.color} !important;
		}
		${font ? `body, p, li, blockquote, dd, div, span { font-family: ${font} !important; }` : ""}
		p, li, blockquote, dd {
			line-height: ${settings.lineHeight} !important;
			text-align: justify;
			hyphens: auto;
			widows: 2;
			orphans: 2;
		}
		a:link, a:visited { color: ${theme.link} !important; }
		img, svg { max-width: 100%; height: auto; }
		pre { white-space: pre-wrap !important; }
		aside[epub|type~="footnote"], aside[epub|type~="endnote"],
		aside[epub|type~="note"], aside[epub|type~="rearnote"] { display: none; }
	`;
}

function applySettings() {
	const theme = THEMES[settings.theme] ?? THEMES.light;
	// Match the book iframes' color-scheme, or browsers paint them an opaque
	// default canvas instead of letting this background show through.
	for (const element of [document.documentElement, document.body]) {
		element.style.colorScheme = settings.theme === "dark" ? "dark" : "light";
		element.style.background = theme.background;
		element.style.color = theme.color;
	}
	if (!view?.renderer) return;
	view.renderer.setAttribute("flow", settings.flow);
	// Pages slide into place after a swipe or tap, like a printed book, unless
	// the reader asked the system for reduced motion.
	if (matchMedia("(prefers-reduced-motion: reduce)").matches)
		view.renderer.removeAttribute("animated");
	else view.renderer.setAttribute("animated", "");
	view.renderer.setAttribute("max-inline-size", "680px");
	view.renderer.setAttribute("margin", "40px");
	view.renderer.setAttribute("gap", "6%");
	view.renderer.setStyles?.(bookCss());
}

function tocItems(items, depth = 0) {
	if (!Array.isArray(items) || depth > 4) return [];
	return items.slice(0, 500).map((item) => ({
		label: String(item?.label ?? "").trim() || "Bölüm",
		href: String(item?.href ?? ""),
		subitems: tocItems(item?.subitems, depth + 1),
	}));
}

// Tap the outer thirds to turn pages, the middle to show or hide the toolbar.
function handleTap(event) {
	if (event.defaultPrevented || event.target.closest?.("a[href]")) return;
	if (event.view.getSelection()?.toString()) return;
	const frame = event.view.frameElement;
	const x = (frame?.getBoundingClientRect().left ?? 0) + event.clientX;
	const zone = x / window.innerWidth;
	if (settings.flow === "paginated" && zone < 0.3) view.goLeft();
	else if (settings.flow === "paginated" && zone > 0.7) view.goRight();
	else post({ type: "toggle-chrome" });
}

function handleKey(event) {
	if (event.key === "ArrowLeft") view?.goLeft();
	else if (event.key === "ArrowRight") view?.goRight();
	else if (event.key === "Escape") post({ type: "escape" });
}

async function open() {
	const response = await fetch(`/api/books/${encodeURIComponent(id)}/download`);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const blob = await response.blob();
	const file = new File([blob], "book.epub", { type: "application/epub+zip" });

	// Build the book first so the sanitizer is attached before any section
	// (including the first one) is loaded.
	const book = await makeBook(file);
	book.transformTarget?.addEventListener("data", ({ detail }) => {
		const type = detail.type;
		detail.data = Promise.resolve(detail.data)
			.then((data) => sanitizeBookData(data, type))
			.catch(() => "");
	});
	view = document.createElement("foliate-view");
	document.body.append(view);
	await view.open(book);
	// Never navigate away from the reader; in-book links still work.
	view.addEventListener("external-link", (event) => event.preventDefault());
	view.addEventListener("load", ({ detail: { doc } }) => {
		doc.addEventListener("click", handleTap);
		doc.addEventListener("keydown", handleKey);
	});
	view.addEventListener("relocate", ({ detail }) => {
		const message = {
			type: "relocate",
			fraction: detail.fraction ?? 0,
			label: String(detail.tocItem?.label ?? "").trim(),
		};
		if (
			message.fraction === lastRelocate?.fraction &&
			message.label === lastRelocate?.label
		)
			return;
		if (detail.cfi) storage("set", detail.cfi);
		lastRelocate = message;
		post(message);
	});
	applySettings();
	await view.init({ lastLocation: storage("get"), showTextStart: true });
	status.remove();
	readyMessage = { type: "ready", toc: tocItems(view.book.toc) };
	post(readyMessage);
}

window.addEventListener("keydown", handleKey);
window.addEventListener("message", (event) => {
	if (event.origin !== location.origin || event.source !== parent) return;
	const message = event.data ?? {};
	if (message.type === "hello") {
		post({ type: "frame-loaded" });
		if (readyMessage) post(readyMessage);
		if (lastRelocate) post(lastRelocate);
	} else if (message.type === "settings") {
		settings = { ...settings, ...message.settings };
		applySettings();
	} else if (message.type === "next") view?.goRight();
	else if (message.type === "prev") view?.goLeft();
	else if (message.type === "goto-href" && typeof message.href === "string")
		view?.goTo(message.href);
	else if (
		message.type === "goto-fraction" &&
		Number.isFinite(message.fraction)
	)
		view?.goToFraction(Math.min(1, Math.max(0, message.fraction)));
});

open().catch(() => {
	status.textContent = "Bu kitap açılamadı.";
	post({ type: "error" });
});
post({ type: "frame-loaded" });
