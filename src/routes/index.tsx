import { env } from "cloudflare:workers";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { BookCard } from "#/components/books/BookCard";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { createDb } from "#/db";
import { listBooks } from "#/lib/books";
import { listMessages } from "#/lib/messages";

const getHome = createServerFn({ method: "GET" }).handler(async () => {
	const db = createDb(env.DB);
	const [recent, notes] = await Promise.all([
		listBooks(db, { page: 1, limit: 6 }),
		listMessages(db, 3),
	]);
	return { books: recent.results, total: recent.total, notes };
});

export const Route = createFileRoute("/")({
	loader: async () => getHome(),
	component: HomePage,
});

const moreLink =
	"text-sm font-medium whitespace-nowrap text-foreground no-underline hover:text-primary";

function HomePage() {
	const { books, total, notes } = Route.useLoaderData();
	const navigate = useNavigate();

	return (
		<main className="page-wrap pt-12 sm:pt-20">
			<section className="max-w-3xl">
				<h1 className="text-5xl leading-[0.98] font-semibold tracking-tight sm:text-7xl">
					Bugün ne okusak?
				</h1>
				<p className="mt-6 max-w-xl font-serif text-xl leading-relaxed text-muted-foreground">
					Okurların paylaştığı {total} kitap arasında ara, künyesine bak,
					okuduklarını değerlendir.
				</p>
				<search className="mt-8 max-w-xl">
					<form
						onSubmit={(event) => {
							event.preventDefault();
							const q = String(
								new FormData(event.currentTarget).get("q") ?? "",
							).trim();
							navigate({
								to: "/books",
								search: q ? { page: 1, q } : { page: 1 },
							});
						}}
						className="flex gap-2"
					>
						<Input
							type="search"
							name="q"
							aria-label="Kitaplıkta ara"
							placeholder="Başlık, yazar ya da ISBN"
							className="h-12 bg-card px-4 md:text-base"
						/>
						<Button type="submit" size="lg" className="h-12 px-6">
							Ara
						</Button>
					</form>
				</search>
			</section>

			<section
				aria-labelledby="recent-heading"
				className="mt-20 border-t border-border pt-8 sm:mt-24"
			>
				<div className="flex items-baseline justify-between gap-4">
					<h2 id="recent-heading" className="text-3xl font-semibold">
						Son eklenenler
					</h2>
					<Link to="/books" search={{ page: 1 }} className={moreLink}>
						Tüm kitaplar →
					</Link>
				</div>
				{books.length > 0 ? (
					<ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 sm:gap-x-8 lg:grid-cols-6">
						{books.map((item, index) => (
							<li key={item.id}>
								<BookCard book={item} titleAs="h3" priority={index < 2} />
							</li>
						))}
					</ul>
				) : (
					<p className="mt-6 font-serif text-lg text-muted-foreground italic">
						Kitaplık henüz boş.
					</p>
				)}
			</section>

			<section
				aria-labelledby="notes-heading"
				className="mt-20 grid gap-8 border-t border-border pt-8 sm:mt-24 md:grid-cols-[minmax(0,280px)_1fr] md:gap-14"
			>
				<div>
					<h2 id="notes-heading" className="text-3xl font-semibold">
						Raftan notlar
					</h2>
					<p className="mt-2 text-muted-foreground">
						Okurların Raf Alanı'na bıraktığı son notlar.
					</p>
					<Link to="/shelf" className={`${moreLink} mt-4 inline-block`}>
						Raf Alanı'na git →
					</Link>
				</div>
				{notes.length > 0 ? (
					<ul className="divide-y divide-border border-y border-border">
						{notes.map((note) => (
							<li key={note.id} className="py-5">
								<p className="max-w-prose font-serif text-xl leading-relaxed">
									{note.text}
								</p>
								<p className="mt-2 text-sm text-muted-foreground">
									{note.username}
								</p>
							</li>
						))}
					</ul>
				) : (
					<p className="font-serif text-lg text-muted-foreground italic">
						Henüz not yok. İlk notu sen bırak.
					</p>
				)}
			</section>
		</main>
	);
}
