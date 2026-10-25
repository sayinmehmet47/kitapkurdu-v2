import {
	strFromU8,
	Unzip,
	type UnzipFileInfo,
	UnzipInflate,
	unzipSync,
} from "fflate";
import { SaxesParser } from "saxes";

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
};

function parseXml(xml: string) {
	const parser = new SaxesParser({ xmlns: true });
	const document: XmlNode = { name: "document", attributes: {}, children: [] };
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
		};
		stack[stack.length - 1].children.push(node);
		stack.push(node);
	});
	parser.on("closetag", () => {
		stack.pop();
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

function extractText(
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
	return strFromU8(result);
}

export function inspectEpub(bytes: Uint8Array): EpubPackage {
	try {
		const entries = archiveIndex(bytes);
		if (extractText(bytes, entries, "mimetype", 20) !== "application/epub+zip")
			throw new EpubError();
		const container = parseXml(
			extractText(
				bytes,
				entries,
				"META-INF/container.xml",
				EPUB_LIMITS.xmlBytes,
			),
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
