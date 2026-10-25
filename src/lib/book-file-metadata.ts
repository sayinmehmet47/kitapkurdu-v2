// Details read from a chosen book file in the browser, before upload: the
// EPUB's own package metadata and cover, a PDF's document info, and as a
// last resort the file name ("Title -- Author -- (source).epub").
import type { EpubMetadata } from "#/lib/epub";
import { findIsbn, normalizeIsbn } from "#/lib/isbn";

export type FileMetadata = EpubMetadata & {
	/** The title is only a guess from the file name; a found title may replace it. */
	titleFromFileName?: boolean;
};

// Download-site tags such as "( WeLib.org )", "(z-lib.org)" or "[Anna's Archive]".
const SOURCE_TAG = /\([^)]*\)|\[[^\]]*\]/g;

/** "Alexandre Dumas Dumas Alexandre" (name + reversed duplicate) → "Alexandre Dumas". */
function collapseRepeatedName(name: string) {
	const words = name.split(" ");
	const half = words.length / 2;
	if (!Number.isInteger(half) || half === 0) return name;
	const first = words.slice(0, half);
	const second = words.slice(half);
	const same = (a: string[], b: string[]) =>
		a.every(
			(word, index) =>
				word.toLocaleLowerCase("tr") === b[index]?.toLocaleLowerCase("tr"),
		);
	return same(first, second) || same(first, [...second].reverse())
		? first.join(" ")
		: name;
}

export function metadataFromFileName(fileName: string): FileMetadata {
	const base = fileName
		.replace(/\.(?:pdf|epub)$/i, "")
		.replace(SOURCE_TAG, " ")
		.replace(/_/g, " ");
	const parts = base
		.split(/\s+--\s+/)
		.map((part) => part.replace(/\s+/g, " ").trim())
		.filter(Boolean);
	const isbn = parts.map(normalizeIsbn).find(Boolean);
	const words = parts.filter((part) => !normalizeIsbn(part));
	return {
		title: words[0],
		author: words[1] ? collapseRepeatedName(words[1]) : undefined,
		isbn,
	};
}

// PDF info is often tool noise ("Microsoft Word - draft.docx", "Untitled").
function plausible(value: unknown) {
	const text =
		typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
	if (text.length < 2 || text.length > 200) return undefined;
	if (
		/^(?:untitled|document|microsoft word\b.*|.*\.(?:docx?|pdf|odt|rtf))$/i.test(
			text,
		)
	)
		return undefined;
	return text;
}

// The copyright page is near the front; some books print the ISBN on the back.
const FIRST_PAGES = 8;
const LAST_PAGES = 3;

async function pdfMetadata(bytes: Uint8Array): Promise<FileMetadata> {
	const [lib, worker] = await Promise.all([
		import("pdfjs-dist"),
		import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
	]);
	lib.GlobalWorkerOptions.workerSrc = worker.default;
	const task = lib.getDocument({
		data: bytes.slice(),
		enableXfa: false,
		useWasm: false,
		useSystemFonts: true,
	});
	try {
		const document = await task.promise;
		const { info } = (await document.getMetadata()) as {
			info?: Record<string, unknown>;
		};
		const pages = new Set<number>();
		for (let page = 1; page <= Math.min(FIRST_PAGES, document.numPages); page++)
			pages.add(page);
		for (
			let page = Math.max(1, document.numPages - LAST_PAGES + 1);
			page <= document.numPages;
			page++
		)
			pages.add(page);
		let isbn: string | undefined;
		for (const number of pages) {
			try {
				const page = await document.getPage(number);
				const content = await page.getTextContent();
				isbn = findIsbn(
					content.items
						.map((item) => ("str" in item ? item.str : ""))
						.join(" "),
				);
			} catch {
				// A page without readable text has no ISBN.
			}
			if (isbn) break;
		}
		return {
			title: plausible(info?.Title),
			author: plausible(info?.Author),
			isbn,
		};
	} finally {
		await task.destroy();
	}
}

/** Merge, keeping the first source's value for each field. */
function merge(...sources: FileMetadata[]): FileMetadata {
	const result: FileMetadata = {};
	for (const source of sources) {
		for (const [key, value] of Object.entries(source) as [
			keyof FileMetadata,
			FileMetadata[keyof FileMetadata],
		][]) {
			if (value !== undefined && result[key] === undefined)
				Object.assign(result, { [key]: value });
		}
	}
	return result;
}

/** Never throws; unreadable files fall back to what the name says. */
export async function readFileMetadata(file: File): Promise<FileMetadata> {
	const fromName = metadataFromFileName(file.name);
	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		let fromFile: FileMetadata | undefined;
		if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
			const { readEpubMetadata } = await import("#/lib/epub");
			fromFile = readEpubMetadata(bytes, { scanText: true });
		} else if (new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-") {
			fromFile = await pdfMetadata(bytes);
		}
		if (fromFile) {
			return {
				...merge(fromFile, fromName),
				titleFromFileName: !fromFile.title && Boolean(fromName.title),
			};
		}
	} catch {
		// Fall through to the file name.
	}
	return { ...fromName, titleFromFileName: Boolean(fromName.title) };
}
