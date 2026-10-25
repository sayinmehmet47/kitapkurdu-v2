import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
	component: About,
});

function About() {
	return (
		<main className="page-wrap pt-12 sm:pt-20">
			<article className="max-w-2xl">
				<h1 className="text-4xl leading-none font-semibold sm:text-6xl">
					KitapKurdu hakkında
				</h1>
				<div className="mt-10 space-y-6 font-serif text-xl leading-relaxed">
					<p>
						KitapKurdu, okurların kitap paylaştığı ve birbirinin okuduklarını
						keşfettiği küçük bir kitaplık. Amacımız basit: iyi bir kitabı bir
						sonraki okura ulaştırmak.
					</p>
					<p>
						<Link to="/books" search={{ page: 1 }}>
							Kitaplıkta
						</Link>{" "}
						başlık, yazar ya da ISBN ile arama yapabilir, kitapların künyesine
						bakabilir, okuduklarını puanlayıp yorumlayabilirsin.{" "}
						<Link to="/shelf">Raf Alanı</Link> ise okurların birbirine öneri,
						alıntı ya da soru bıraktığı ortak bir pano.
					</p>
				</div>
			</article>
		</main>
	);
}
