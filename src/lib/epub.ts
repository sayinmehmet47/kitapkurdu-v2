import {
	strFromU8,
	Unzip,
	type UnzipFileInfo,
	UnzipInflate,
	unzipSync,
} from "fflate";
import { SaxesParser } from "saxes";
import {
	type CoverType,
	detectCoverType,
	MAX_COVER_BYTES,
} from "#/lib/cover-image";
import { normalizeIsbn } from "#/lib/isbn";

// Preview is deliberately bounded, not a general-purpose archive extractor.
export const EPUB_LIMITS = {
	entries: 2048,
	expandedBytes: 64 * 1024 ** 2,
	entryBytes: 16 * 1024 ** 2,
	xmlBytes: 1024 ** 2,
	chapterBytes: 2 * 1024 ** 2,
	chapters: 512,
};

export class EpubError extends Error {
	constructor() {
		super("EPUB dosyası geçersiz, şifreli veya önizleme sınırlarını aşıyor.");
	}
}

type XmlNode = {
	name: string;
	attributes: Record<string, string>;
	children: XmlNode[];
	/** Direct text content, capped (metadata values, not chapter text). */
	text: string;
};

const MAX_NODE_TEXT = 20_000;

function parseXml(xml: string) {
	const parser = new SaxesParser({ xmlns: true });
	const document: XmlNode = {
		name: "document",
		attributes: {},
		children: [],
		text: "",
	};
	const stack = [document];
	let count = 0;
	parser.on("doctype", () => {
		throw new EpubError();
	});
	parser.on("error", () => {
		throw new EpubError();
	});
	parser.on("opentag", (tag) => {
		if (++count > 20_000 || stack.length > 64) throw new EpubError();
		const node: XmlNode = {
			name: tag.local,
			attributes: Object.fromEntries(
				Object.values(tag.attributes).map((attr) => [attr.name, attr.value]),
			),
			children: [],
			text: "",
		};
		stack[stack.length - 1].children.push(node);
		stack.push(node);
	});
	parser.on("closetag", () => {
		stack.pop();
	});
	parser.on("text", (text) => {
		const node = stack[stack.length - 1];
		if (node.text.length < MAX_NODE_TEXT)
			node.text = (node.text + text).slice(0, MAX_NODE_TEXT);
	});
	parser.write(xml).close();
	return document.children[0];
}

function hasControlCharacters(value: string) {
	return Array.from(value).some((char) => char.charCodeAt(0) < 32);
}

function validArchivePath(path: string) {
	return (
		path.length > 0 &&
		path.length <= 1024 &&
		!/[\\:]/.test(path) &&
		!hasControlCharacters(path) &&
		!path.startsWith("/") &&
		!path
			.split("/")
			.some((part) => part === ".." || part === "." || part === "__proto__")
	);
}

export function resolveEpubPath(packagePath: string, href: string) {
	const decoded = decodeURIComponent(href.split("#")[0]);
	if (
		!decoded ||
		/[\\:?]/.test(decoded) ||
		hasControlCharacters(decoded) ||
		decoded.startsWith("/")
	)
		throw new EpubError();
	const parts = packagePath.split("/").slice(0, -1);
	for (const part of decoded.split("/")) {
		if (part === ".") continue;
		if (part === "..") {
			if (parts.length === 0) throw new EpubError();
			parts.pop();
		} else {
			parts.push(part);
		}
	}
	const path = parts.join("/");
	if (!validArchivePath(path)) throw new EpubError();
	return path;
}

export type EpubChapter = { path: string; label: string };
export type EpubPackage = { chapters: EpubChapter[] };

function archiveIndex(bytes: Uint8Array) {
	// EPUB requires its first ZIP entry to be the uncompressed mimetype file.
	if (bytes.length < 58) throw new EpubError();
	const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (
		header.getUint32(0, true) !== 0x04034b50 ||
		(header.getUint16(6, true) & 1) !== 0 ||
		header.getUint16(8, true) !== 0 ||
		header.getUint16(26, true) !== 8 ||
		header.getUint16(28, true) !== 0 ||
		strFromU8(bytes.subarray(30, 38)) !== "mimetype" ||
		strFromU8(bytes.subarray(38, 58)) !== "application/epub+zip"
	)
		throw new EpubError();

	const entries = new Map<string, UnzipFileInfo>();
	let total = 0;
	unzipSync(bytes, {
		filter(file) {
			if (
				!validArchivePath(file.name) ||
				entries.has(file.name) ||
				entries.size >= EPUB_LIMITS.entries ||
				file.originalSize > EPUB_LIMITS.entryBytes ||
				(file.compression !== 0 && file.compression !== 8)
			)
				throw new EpubError();
			total += file.originalSize;
			if (total > EPUB_LIMITS.expandedBytes) throw new EpubError();
			entries.set(file.name, file);
			return false; // Inspect metadata without inflating archive images/fonts.
		},
	});
	if (entries.has("META-INF/encryption.xml")) throw new EpubError();
	return entries;
}

function extractBytes(
	bytes: Uint8Array,
	entries: Map<string, UnzipFileInfo>,
	path: string,
	maxBytes: number,
) {
	const entry = entries.get(path);
	if (!entry || entry.originalSize > maxBytes || entry.size > maxBytes)
		throw new EpubError();
	// ZIP sizes are untrusted. Inflate only this entry, feeding small compressed
	// chunks and bounding the ACTUAL output as well as the directory's sizes.
	// A forged tiny originalSize cannot cause unbounded zip-bomb expansion.
	const chunks: Uint8Array[] = [];
	let size = 0;
	let done = false;
	const stream = new Unzip((file) => {
		if (file.name !== path) return;
		file.ondata = (error, data, final) => {
			if (error) throw new EpubError();
			size += data.length;
			if (size > maxBytes || size > entry.originalSize) throw new EpubError();
			chunks.push(data);
			done = final;
		};
		file.start();
	});
	stream.register(UnzipInflate);
	for (let offset = 0; offset < bytes.length && !done; offset += 1024) {
		stream.push(
			bytes.subarray(offset, offset + 1024),
			offset + 1024 >= bytes.length,
		);
	}
	if (!done || size !== entry.originalSize) throw new EpubError();
	const result = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}

function extractText(
	bytes: Uint8Array,
	entries: Map<string, UnzipFileInfo>,
	path: string,
	maxBytes: number,
) {
	return strFromU8(extractBytes(bytes, entries, path, maxBytes));
}

function openPackage(bytes: Uint8Array) {
	const entries = archiveIndex(bytes);
	if (extractText(bytes, entries, "mimetype", 20) !== "application/epub+zip")
		throw new EpubError();
	const container = parseXml(
		extractText(bytes, entries, "META-INF/container.xml", EPUB_LIMITS.xmlBytes),
	);
	if (container?.name !== "container") throw new EpubError();
	const rootfiles = container.children.find(
		(node) => node.name === "rootfiles",
	);
	const rootfile = rootfiles?.children.find(
		(node) =>
			node.name === "rootfile" &&
			node.attributes["media-type"] === "application/oebps-package+xml",
	);
	const packagePath = resolveEpubPath(
		"",
		rootfile?.attributes["full-path"] ?? "",
	);
	const pkg = parseXml(
		extractText(bytes, entries, packagePath, EPUB_LIMITS.xmlBytes),
	);
	if (pkg?.name !== "package") throw new EpubError();
	return { entries, packagePath, pkg };
}

export function inspectEpub(bytes: Uint8Array): EpubPackage {
	try {
		const { entries, packagePath, pkg } = openPackage(bytes);
		const manifest = pkg.children.find((node) => node.name === "manifest");
		const spine = pkg.children.find((node) => node.name === "spine");
		if (!manifest || !spine) throw new EpubError();
		const chapters: EpubChapter[] = [];
		for (const ref of spine.children.filter(
			(node) => node.name === "itemref",
		)) {
			const item = manifest.children.find(
				(node) =>
					node.name === "item" && node.attributes.id === ref.attributes.idref,
			);
			if (!item || item.attributes["media-type"] !== "application/xhtml+xml")
				throw new EpubError();
			const path = resolveEpubPath(packagePath, item.attributes.href ?? "");
			const file = entries.get(path);
			if (!file || file.originalSize > EPUB_LIMITS.chapterBytes)
				throw new EpubError();
			chapters.push({ path, label: `Bölüm ${chapters.length + 1}` });
			if (chapters.length > EPUB_LIMITS.chapters) throw new EpubError();
		}
		if (chapters.length === 0) throw new EpubError();
		return { chapters };
	} catch {
		throw new EpubError();
	}
}

export function readEpubChapter(bytes: Uint8Array, chapter: EpubChapter) {
	return extractText(
		bytes,
		archiveIndex(bytes),
		chapter.path,
		EPUB_LIMITS.chapterBytes,
	);
}

export type EpubMetadata = {
	title?: string;
	author?: string;
	publisher?: string;
	language?: "turkish" | "english";
	isbn?: string;
	description?: string;
	categories?: string[];
	cover?: { bytes: Uint8Array; type: CoverType };
};

const clean = (value: string | undefined, max = 500) => {
	const text = (value ?? "").replace(/\s+/g, " ").trim();
	return text ? text.slice(0, max) : undefined;
};

/**
 * Book details from the EPUB's own package document, including its cover
 * image. Never throws: an unreadable EPUB simply yields no details.
 */
export function readEpubMetadata(bytes: Uint8Array): EpubMetadata {
	try {
		const { entries, packagePath, pkg } = openPackage(bytes);
		const metadata = pkg.children.find((node) => node.name === "metadata");
		const manifest = pkg.children.find((node) => node.name === "manifest");
		const fields = (name: string) =>
			(metadata?.children ?? []).filter((node) => node.name === name);
		const first = (name: string) => clean(fields(name)[0]?.text);

		const authors = fields("creator")
			.filter((node) => {
				const role = node.attributes.role ?? node.attributes["opf:role"];
				return !role || role === "aut";
			})
			.map((node) => clean(node.text))
			.filter(Boolean);
		const identifiers = fields("identifier").map((node) => node.text);
		const isbn = identifiers.map(normalizeIsbn).find(Boolean);
		const language = first("language")?.toLowerCase();
		// Descriptions often carry escaped HTML; keep only the text.
		const subjects = fields("subject")
			.map((node) => clean(node.text.replace(/<[^>]*>/g, " "), 5000))
			.filter((value): value is string => Boolean(value));
		// Some EPUBs put the blurb in <dc:subject>: a sentence is not a category,
		// but it makes a good description when there is none.
		const isCategory = (subject: string) =>
			subject.length <= 40 &&
			subject.split(" ").length <= 5 &&
			!/[.;!?]/.test(subject);
		const description = clean(
			fields("description")[0]?.text.replace(/<[^>]*>/g, " ") ??
				subjects.find((subject) => subject.length >= 80),
			5000,
		);
		const categories = [...new Set(subjects.filter(isCategory))].slice(0, 5);

		return {
			title: first("title"),
			author: authors.length > 0 ? authors.join(", ") : undefined,
			publisher: first("publisher"),
			language: language?.startsWith("tr")
				? "turkish"
				: language?.startsWith("en")
					? "english"
					: undefined,
			isbn,
			description,
			categories: categories.length > 0 ? categories : undefined,
			cover: readCover(bytes, entries, packagePath, metadata, manifest),
		};
	} catch {
		return {};
	}
}

function readCover(
	bytes: Uint8Array,
	entries: Map<string, UnzipFileInfo>,
	packagePath: string,
	metadata: XmlNode | undefined,
	manifest: XmlNode | undefined,
) {
	const items = (manifest?.children ?? []).filter(
		(node) => node.name === "item",
	);
	// EPUB 3 marks the cover in the manifest; EPUB 2 points at it from metadata.
	const coverId = metadata?.children.find(
		(node) => node.name === "meta" && node.attributes.name === "cover",
	)?.attributes.content;
	const isImage = (node: XmlNode) =>
		(node.attributes["media-type"] ?? "").startsWith("image/");
	const item =
		items.find((node) =>
			(node.attributes.properties ?? "").split(/\s+/).includes("cover-image"),
		) ??
		items.find((node) => coverId && node.attributes.id === coverId) ??
		// Many tools (e.g. Sigil) only name it: id="cover.jpg", Images/cover.jpg.
		items.find(
			(node) =>
				isImage(node) &&
				/cover/i.test(
					`${node.attributes.id ?? ""} ${(node.attributes.href ?? "").split("/").pop()}`,
				),
		);
	if (!item?.attributes.href) return undefined;
	try {
		const path = resolveEpubPath(packagePath, item.attributes.href);
		const image = extractBytes(bytes, entries, path, MAX_COVER_BYTES);
		const type = detectCoverType(image);
		return type ? { bytes: image, type } : undefined;
	} catch {
		return undefined;
	}
}
