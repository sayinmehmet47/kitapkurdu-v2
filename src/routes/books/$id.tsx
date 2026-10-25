import { env } from "cloudflare:workers";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createDb } from "#/db";
import { getBookById } from "#/lib/books";

const getBook = createServerFn({ method: "GET" })
	.validator(z.object({ id: z.string().min(1).max(64) }))
	.handler(async ({ data }) => getBookById(createDb(env.DB), data.id));

export const Route = createFileRoute("/books/$id")({
	loader: async ({ params }) => getBook({ data: { id: params.id } }),
	component: BookDetailPage,
});

function formatBytes(size: number | null) {
	if (size === null || size === undefined) return null;
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function BookDetailPage() {
	const item = Route.useLoaderData();
	const { id } = Route.useParams();

	if (!item) {
		return (
			<main className="demo-page demo-center">
				<section className="demo-panel w-full max-w-2xl text-center">
					<h1 className="demo-title">Kitap bulunamadı</h1>
					<p className="demo-muted mt-2">
						“{id}” kimliğine sahip bir kitap yok veya kaldırılmış.
					</p>
					<Link to="/books" className="demo-button mt-6 inline-block">
						← Kitaplara dön
					</Link>
				</section>
			</main>
		);
	}

	const language = item.language === "english" ? "English" : "Türkçe";

	return (
		<main className="demo-page">
			<section className="mx-auto w-full max-w-4xl px-4 py-10">
				<Link to="/books" className="demo-muted text-sm hover:underline">
					← Kitaplara dön
				</Link>

				<div className="mt-6 flex flex-col gap-8 sm:flex-row">
					<div className="w-full max-w-xs shrink-0">
						{item.coverThumbnail ? (
							<img
								src={item.coverThumbnail}
								alt={`${item.name} kapağı`}
								className="aspect-[2/3] w-full rounded-md object-cover"
							/>
						) : (
							<div className="flex aspect-[2/3] w-full items-center justify-center rounded-md bg-muted text-6xl">
								📖
							</div>
						)}
					</div>

					<div className="min-w-0 flex-1">
						<p className="island-kicker mb-2">Kitap</p>
						<h1 className="demo-title">{item.name}</h1>
						{item.author ? (
							<p className="demo-muted mt-2 text-lg">{item.author}</p>
						) : null}

						<dl className="mt-6 space-y-2 text-sm">
							{item.publisher ? (
								<div className="flex gap-2">
									<dt className="w-28 shrink-0 font-semibold">Yayınevi</dt>
									<dd>{item.publisher}</dd>
								</div>
							) : null}
							{item.isbn ? (
								<div className="flex gap-2">
									<dt className="w-28 shrink-0 font-semibold">ISBN</dt>
									<dd>{item.isbn}</dd>
								</div>
							) : null}
							<div className="flex gap-2">
								<dt className="w-28 shrink-0 font-semibold">Dil</dt>
								<dd>{language}</dd>
							</div>
							{item.size !== null && item.size !== undefined ? (
								<div className="flex gap-2">
									<dt className="w-28 shrink-0 font-semibold">Boyut</dt>
									<dd>{formatBytes(item.size)}</dd>
								</div>
							) : null}
						</dl>

						{(item.category ?? []).length > 0 ? (
							<ul className="mt-4 flex flex-wrap gap-1">
								{(item.category ?? []).map((category) => (
									<li
										key={category}
										className="rounded-full bg-muted px-2 py-0.5 text-xs"
									>
										{category}
									</li>
								))}
							</ul>
						) : null}

						{item.description ? (
							<p className="demo-muted mt-6 leading-relaxed">
								{item.description}
							</p>
						) : null}

						{item.fileUrl ? (
							<a
								href={item.fileUrl}
								target="_blank"
								rel="noreferrer"
								className="demo-button mt-6 inline-block"
							>
								Kitabı aç
							</a>
						) : (
							<p className="demo-muted mt-6 text-sm">
								Bu kitap için dosya henüz eklenmemiş.
							</p>
						)}
					</div>
				</div>
			</section>
		</main>
	);
}
