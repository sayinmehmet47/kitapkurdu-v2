import type {
	PDFDocumentLoadingTask,
	PDFDocumentProxy,
	RenderTask,
} from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { loadPdfjs, pdfOptions } from "#/lib/pdfjs";

export default function PdfPreview({ bytes }: { bytes: Uint8Array }) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
	const [pageNumber, setPageNumber] = useState(1);
	const [busy, setBusy] = useState(true);
	const [error, setError] = useState("");
	const [text, setText] = useState("");

	useEffect(() => {
		let active = true;
		let task: PDFDocumentLoadingTask | undefined;
		async function load() {
			try {
				const lib = await loadPdfjs();
				if (!active) return;
				task = lib.getDocument({
					...pdfOptions(bytes.slice()),
					maxImageSize: 16_000_000,
					canvasMaxAreaInBytes: 32_000_000,
				});
				const document = await task.promise;
				if (active) setPdf(document);
			} catch {
				if (active) {
					setError(
						"Bu PDF önizlenemedi. Şifreli veya bozuk olabilir; dosyayı indirebilirsin.",
					);
					setBusy(false);
				}
			}
		}
		void load();
		return () => {
			active = false;
			void task?.destroy();
		};
	}, [bytes]);

	useEffect(() => {
		if (!pdf) return;
		let active = true;
		let rendering: RenderTask | undefined;
		setBusy(true);
		setText("");
		async function render() {
			try {
				const page = await pdf?.getPage(pageNumber);
				if (!active || !page || !canvas.current) return;
				const base = page.getViewport({ scale: 1 });
				const viewport = page.getViewport({
					scale: Math.min(1.5, 1200 / base.width, 1800 / base.height),
				});
				canvas.current.width = Math.ceil(viewport.width);
				canvas.current.height = Math.ceil(viewport.height);
				rendering = page.render({ canvas: canvas.current, viewport });
				const [, content] = await Promise.all([
					rendering.promise,
					page.getTextContent(),
				]);
				if (active) {
					setText(
						content.items
							.map((item) => ("str" in item ? item.str : ""))
							.join(" "),
					);
					setBusy(false);
				}
			} catch {
				if (active) {
					setError("PDF sayfası gösterilemedi; dosyayı indirebilirsin.");
					setBusy(false);
				}
			}
		}
		void render();
		return () => {
			active = false;
			rendering?.cancel();
		};
	}, [pdf, pageNumber]);

	return (
		<section aria-label="PDF önizlemesi" className="min-w-0">
			<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
				<Button
					variant="outline"
					disabled={!pdf || busy || pageNumber <= 1}
					onClick={() => setPageNumber((page) => page - 1)}
				>
					← Önceki sayfa
				</Button>
				<output className="text-sm text-muted-foreground">
					{pdf ? `Sayfa ${pageNumber} / ${pdf.numPages}` : "PDF hazırlanıyor…"}
				</output>
				<Button
					variant="outline"
					disabled={!pdf || busy || pageNumber >= pdf.numPages}
					onClick={() => setPageNumber((page) => page + 1)}
				>
					Sonraki sayfa →
				</Button>
			</div>
			{error ? (
				<p
					role="alert"
					className="rounded-md border border-border p-5 text-destructive"
				>
					{error}
				</p>
			) : (
				<div
					aria-busy={busy}
					className="rounded-md border border-border bg-muted/40 p-2 sm:p-5"
				>
					{busy ? (
						<p className="mb-3 text-sm text-muted-foreground">
							Sayfa yükleniyor…
						</p>
					) : null}
					<canvas
						ref={canvas}
						role="img"
						aria-label={`PDF sayfası ${pageNumber}`}
						className="mx-auto block h-auto max-w-full bg-white shadow-sm"
					/>
					<p className="sr-only" data-testid="pdf-page-text">
						{text}
					</p>
				</div>
			)}
		</section>
	);
}
