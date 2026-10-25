import { lazy, Suspense } from "react";

// Load the PDF.js engine only on a reading page. PDF.js fetches ranged chunks
// directly from the download URL rather than waiting for the whole book in RAM.
const PdfPreview = lazy(() => import("./PdfPreview"));

export function BookPreview({ id }: { id: string }) {
	return (
		<Suspense
			fallback={
				<output className="block text-muted-foreground">
					Önizleme hazırlanıyor…
				</output>
			}
		>
			<PdfPreview url={`/api/books/${encodeURIComponent(id)}/download`} />
		</Suspense>
	);
}
