import DOMPurify from "dompurify";
import { createElement, type ReactNode, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { inspectEpub, readEpubChapter } from "#/lib/epub";

const TAGS = [
	"p",
	"div",
	"span",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"strong",
	"b",
	"em",
	"i",
	"u",
	"s",
	"sub",
	"sup",
	"blockquote",
	"ul",
	"ol",
	"li",
	"br",
	"hr",
	"pre",
	"code",
	"table",
	"thead",
	"tbody",
	"tr",
	"th",
	"td",
	"caption",
	"ruby",
	"rt",
	"rp",
];

function chapterContent(xml: string) {
	// Use the HTML sanitizer directly: legacy XHTML entities such as &nbsp;
	// work without resolving EPUB-provided DTDs or expanding XML entities.
	const clean = DOMPurify.sanitize(xml, {
		ALLOWED_TAGS: TAGS,
		ALLOWED_ATTR: [],
		ALLOW_ARIA_ATTR: false,
		ALLOW_DATA_ATTR: false,
		RETURN_DOM_FRAGMENT: true,
	});
	// Do not inject even sanitized HTML. Convert to an explicit allow-list of
	// ordinary React elements with NO attributes; React escapes every text node.
	// No srcdoc, dangerouslySetInnerHTML, URL sink, script, CSS, or event handler
	// from the book can ever enter the application's active document.
	let nodes = 0;
	function render(node: Node, key: number, depth: number): ReactNode {
		if (++nodes > 20_000 || depth > 64) throw new Error("Chapter too complex");
		if (node.nodeType === Node.TEXT_NODE) return node.textContent;
		if (!(node instanceof Element) || !TAGS.includes(node.localName))
			return null;
		const tag = node.localName === "h1" ? "h2" : node.localName;
		if (tag === "br" || tag === "hr") return createElement(tag, { key });
		return createElement(
			tag,
			{ key },
			Array.from(node.childNodes, (child, index) =>
				render(child, index, depth + 1),
			),
		);
	}
	return Array.from(clean.childNodes, (node, index) => render(node, index, 0));
}

export default function EpubPreview({ bytes }: { bytes: Uint8Array }) {
	const [chapter, setChapter] = useState(0);
	const contents = useMemo(() => {
		try {
			return inspectEpub(bytes);
		} catch {
			return null;
		}
	}, [bytes]);
	const content = useMemo(() => {
		try {
			return contents
				? chapterContent(readEpubChapter(bytes, contents.chapters[chapter]))
				: null;
		} catch {
			return null;
		}
	}, [bytes, contents, chapter]);

	if (!contents)
		return (
			<p role="alert" className="text-destructive">
				Bu EPUB önizlenemedi. Şifreli, bozuk veya önizleme sınırlarını aşıyor
				olabilir; dosyayı indirebilirsin.
			</p>
		);
	return (
		<section aria-label="EPUB önizlemesi" className="min-w-0">
			<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
				<Button
					variant="outline"
					disabled={chapter === 0}
					onClick={() => setChapter((value) => value - 1)}
				>
					← Önceki bölüm
				</Button>
				<output className="text-sm text-muted-foreground">
					Bölüm {chapter + 1} / {contents.chapters.length}
				</output>
				<Button
					variant="outline"
					disabled={chapter >= contents.chapters.length - 1}
					onClick={() => setChapter((value) => value + 1)}
				>
					Sonraki bölüm →
				</Button>
			</div>
			{content ? (
				<article
					key={chapter}
					aria-label="EPUB bölüm içeriği"
					className="h-[65vh] min-h-80 overflow-y-auto rounded-md border border-border bg-card p-5 sm:p-8"
				>
					<div className="prose prose-stone max-w-prose break-words font-serif dark:prose-invert [&_pre]:whitespace-pre-wrap">
						{content}
					</div>
				</article>
			) : (
				<p role="alert" className="text-destructive">
					Bu bölüm gösterilemedi; diğer bölümleri deneyebilir veya dosyayı
					indirebilirsin.
				</p>
			)}
			<p className="mt-3 text-sm text-muted-foreground">
				Güvenli metin önizlemesi: kitaptaki scriptler, resimler, bağlantılar ve
				özel stiller çalıştırılmaz.
			</p>
		</section>
	);
}
