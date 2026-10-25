import { Link } from "@tanstack/react-router";

export default function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer className="mt-24 border-t border-border">
			<div className="page-wrap flex flex-col gap-6 py-10 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="m-0 font-serif text-xl font-semibold">KitapKurdu</p>
					<p className="m-0 mt-1 font-serif text-muted-foreground italic">
						Okurlardan okurlara, paylaşılan bir kitaplık.
					</p>
				</div>
				<nav aria-label="Alt menü" className="flex gap-6 text-sm">
					<Link
						to="/books"
						className="text-foreground no-underline hover:text-primary"
					>
						Kitaplar
					</Link>
				</nav>
			</div>
			<div className="page-wrap border-t border-border py-5 text-sm text-muted-foreground">
				&copy; {year} KitapKurdu
			</div>
		</footer>
	);
}
