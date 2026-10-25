import { env } from "cloudflare:workers";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download } from "lucide-react";
import { z } from "zod";
import { BookPreview } from "#/components/books/BookPreview";
import { EpubReader } from "#/components/reader/EpubReader";
import { buttonVariants } from "#/components/ui/button";
import { createDb } from "#/db";
import { storedBookFormat } from "#/lib/book-file-format";
import { getBookById } from "#/lib/books";

const getPreview = createServerFn({ method: "GET" })
	.validator(z.object({ id: z.string().min(1).max(64) }))
	.handler(async ({ data }) => {
		const item = await getBookById(createDb(env.DB), data.id);
		const format = storedBookFormat(item?.fileUrl ?? null);
		return item && format ? { id: item.id, name: item.name, format } : null;
	});

export const Route = createFileRoute("/read/$id")({
	loader: ({ params }) => getPreview({ data: { id: params.id } }),
	head: ({ loaderData }) => ({
		meta: [
			{ title: loaderData ? `${loaderData.name} · KitapKurdu` : "KitapKurdu" },
		],
	}),
	component: ReadPage,
});

function ReadPage() {
	const item = Route.useLoaderData();
	const { id } = Route.useParams();

	if (!item) {
		return (
			<main className="page-wrap py-24 text-center">
				<h1 className="text-3xl font-semibold">Kitap açılamadı</h1>
				<p className="mt-3 text-muted-foreground">
					Bu kitabın dosyası yok, kaldırılmış veya biçimi desteklenmiyor.
				</p>
				<Link
					to="/books/$id"
					params={{ id }}
					className={buttonVariants({ variant: "outline", className: "mt-8" })}
				>
					← Kitap detayına dön
				</Link>
			</main>
		);
	}

	if (item.format === "epub") {
		return <EpubReader key={item.id} id={item.id} title={item.name} />;
	}

	// PDF: pdf.js pages inside the same full-screen frame.
	return (
		<main className="fixed inset-0 flex flex-col bg-background">
			<header className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2">
				<Link
					to="/books/$id"
					params={{ id }}
					aria-label="Kitaba dön"
					className={buttonVariants({ variant: "ghost", size: "icon" })}
				>
					<ArrowLeft className="size-5" />
				</Link>
				<h1 className="min-w-0 flex-1 truncate text-center font-serif text-base font-semibold">
					{item.name}
				</h1>
				<a
					href={`/api/books/${encodeURIComponent(id)}/download?download=1`}
					aria-label="Dosyayı indir"
					className={buttonVariants({ variant: "ghost", size: "icon" })}
				>
					<Download className="size-5" />
				</a>
			</header>
			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
				<div className="mx-auto max-w-3xl">
					<BookPreview key={item.id} id={item.id} />
				</div>
			</div>
		</main>
	);
}
