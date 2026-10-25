// Details read from a chosen book file in the browser, before upload: the
// EPUB's own package metadata and cover, a PDF's document info, and as a
// last resort the file name ("Title -- Author -- (source).epub").
import type { EpubMetadata } from "#/lib/epub";
import { normalizeIsbn } from "#/lib/isbn";

export type FileMetadata = EpubMetadata;

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
		return { title: plausible(info?.Title), author: plausible(info?.Author) };
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
		if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
			const { readEpubMetadata } = await import("#/lib/epub");
			return merge(readEpubMetadata(bytes), fromName);
		}
		if (new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-") {
			return merge(await pdfMetadata(bytes), fromName);
		}
	} catch {
		// Fall through to the file name.
	}
	return fromName;
}
