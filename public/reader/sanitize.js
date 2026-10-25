// Defense in depth next to the reader CSP (public/_headers): strip active and
// remote content from book documents and stylesheets before foliate-js
// renders them. foliate-js has already rewritten in-book resources to blob:
// URLs when this runs, so anything else that loads is remote.

const ACTIVE_ELEMENTS = [
	"script",
	"iframe",
	"frame",
	"frameset",
	"object",
	"embed",
	"applet",
	"base",
	"form",
	"input",
	"button",
	"textarea",
	"select",
	"noscript",
	"meta[http-equiv]",
].join(",");

const URL_ATTRIBUTES = new Set([
	"src",
	"href",
	"poster",
	"data",
	"action",
	"formaction",
	"background",
	"srcset",
	"cite",
	"longdesc",
]);

const SCHEME = /^[a-z][a-z\d+.-]*:/i;

// on…= attributes in raw markup (the DOM pass below removes any that remain).
const HANDLER_ATTRIBUTE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * Removes inline event handler attributes from book markup before it is
 * parsed. Parsed documents never run scripts, but parsing handlers inside
 * this CSP-protected frame makes Chrome report a (blocked) violation.
 */
export function stripHandlerAttributes(markup) {
	return markup.replace(HANDLER_ATTRIBUTE, "");
}

function allowedUrl(value, element) {
	const url = value.trim();
	if (url === "" || url.startsWith("#")) return true;
	if (/^blob:/i.test(url) || /^data:image\//i.test(url)) return true;
	// In-book links stay relative; foliate-js resolves them on click.
	return element === "a" && !SCHEME.test(url) && !url.startsWith("//");
}

export function sanitizeCss(css) {
	return css
		.replace(/@import[^;]*;?/gi, "")
		.replace(/url\(\s*(["']?)(?!blob:|data:image\/|#)[^)]*?\1\s*\)/gi, "none");
}

function sanitizeDocument(doc) {
	for (const element of doc.querySelectorAll(ACTIVE_ELEMENTS)) element.remove();
	for (const element of doc.querySelectorAll("*")) {
		for (const attribute of [...element.attributes]) {
			const name = attribute.localName.toLowerCase();
			if (name.startsWith("on")) element.removeAttributeNode(attribute);
			else if (
				URL_ATTRIBUTES.has(name) &&
				!allowedUrl(attribute.value, element.localName.toLowerCase())
			)
				element.removeAttributeNode(attribute);
			else if (name === "style") attribute.value = sanitizeCss(attribute.value);
		}
	}
	for (const style of doc.querySelectorAll("style"))
		style.textContent = sanitizeCss(style.textContent ?? "");
	for (const link of doc.querySelectorAll("link:not([href])")) link.remove();
}

/** Hooked into foliate-js's loader "data" event for every book resource. */
export function sanitizeBookData(data, type) {
	if (typeof data !== "string") return data; // images and fonts (Blobs)
	if (/(?:x?html|svg)/i.test(type)) {
		const doc = new DOMParser().parseFromString(data, type);
		if (doc.querySelector("parsererror")) return "";
		sanitizeDocument(doc);
		return new XMLSerializer().serializeToString(doc);
	}
	if (/css/i.test(type)) return sanitizeCss(data);
	return data;
}
