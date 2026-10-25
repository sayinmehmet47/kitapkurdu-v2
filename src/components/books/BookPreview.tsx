import { lazy, Suspense, useEffect, useState } from "react";
import { MAX_BOOK_FILE_BYTES } from "#/lib/book-file-format";

// The PDF engine is only fetched on the reading page, never on the catalog.
// EPUBs use the reader frame instead (src/components/reader/EpubReader.tsx).
const PdfPreview = lazy(() => import("./PdfPreview"));

export function BookPreview({ id }: { id: string }) {
	const [bytes, setBytes] = useState<Uint8Array | null>(null);
	const [error, setError] = useState("");
	useEffect(() => {
		const controller = new AbortController();
		async function load() {
			try {
				const response = await fetch(
					`/api/books/${encodeURIComponent(id)}/download`,
					{ signal: controller.signal },
				);
				if (
					!response.ok ||
					Number(response.headers.get("content-length")) > MAX_BOOK_FILE_BYTES
				)
					throw new Error("File unavailable");
				const data = new Uint8Array(await response.arrayBuffer());
				if (data.length > MAX_BOOK_FILE_BYTES)
					throw new Error("File too large");
				if (!controller.signal.aborted) setBytes(data);
			} catch {
				if (!controller.signal.aborted)
					setError(
						"Dosya önizleme için alınamadı. Tekrar deneyebilir veya dosyayı indirebilirsin.",
					);
			}
		}
		void load();
		return () => controller.abort();
	}, [id]);
	if (error)
		return (
			<p role="alert" className="text-destructive">
				{error}
			</p>
		);
	if (!bytes)
		return (
			<output className="block text-muted-foreground">Kitap yükleniyor…</output>
		);
	return (
		<Suspense
			fallback={
				<output className="block text-muted-foreground">
					Önizleme hazırlanıyor…
				</output>
			}
		>
			<PdfPreview bytes={bytes} />
		</Suspense>
	);
}
