import { env } from "cloudflare:workers";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BookPreview } from "#/components/books/BookPreview";
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
	component: PreviewPage,
});

function PreviewPage() {
	const item = Route.useLoaderData();
	const { id } = Route.useParams();
	return (
		<main className="page-wrap min-h-[60vh] pt-8 pb-8 sm:pt-10">
			<Link
				to="/books/$id"
				params={{ id }}
				className="text-sm text-muted-foreground"
			>
				← Kitap detayına dön
			</Link>
			{item ? (
				<>
					<header className="my-7 flex flex-wrap items-end justify-between gap-5 border-b border-border pb-6">
						<div className="min-w-0">
							<p className="mb-2 text-sm text-primary">
								{item.format.toUpperCase()} önizlemesi
							</p>
							<h1 className="break-words text-3xl font-semibold sm:text-4xl">
								{item.name}
							</h1>
						</div>
						<a
							href={`/api/books/${encodeURIComponent(id)}/download?download=1`}
							className={buttonVariants({ variant: "outline" })}
						>
							Dosyayı indir
						</a>
					</header>
					<BookPreview key={item.id} id={item.id} format={item.format} />
				</>
			) : (
				<section className="py-20 text-center">
					<h1 className="text-3xl font-semibold">Önizleme bulunamadı</h1>
					<p className="mt-3 text-muted-foreground">
						Bu kitabın dosyası yok, kaldırılmış veya biçimi desteklenmiyor.
					</p>
				</section>
			)}
		</main>
	);
}
