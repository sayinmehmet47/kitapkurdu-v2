import { createFileRoute, Link } from "@tanstack/react-router";

// Linked from Google's sign-in consent screen; keep it in step with what the
// app actually stores (Better Auth user/session tables, books, ratings). The
// site is anonymous: no personal contact address here.

export const Route = createFileRoute("/gizlilik")({
	head: () => ({ meta: [{ title: "Gizlilik · KitapKurdu" }] }),
	component: Privacy,
});

function Privacy() {
	return (
		<main className="page-wrap pt-12 pb-16 sm:pt-20">
			<article className="max-w-2xl">
				<h1 className="text-4xl leading-none font-semibold sm:text-6xl">
					Gizlilik
				</h1>
				<p className="mt-4 text-sm text-muted-foreground">
					Son güncelleme: 13 Kasım 2026
				</p>
				<div className="mt-10 space-y-8 font-serif text-lg leading-relaxed">
					<section className="space-y-3">
						<h2 className="font-sans text-xl font-semibold">
							Hangi bilgiler alınır?
						</h2>
						<p>
							Google ile giriş yaptığında Google'dan yalnızca adın, e-posta
							adresin ve profil fotoğrafının bağlantısı alınır. E-posta ve
							şifreyle hesap açtığında adın ve e-posta adresin kaydedilir;
							şifren yalnızca geri çevrilemez biçimde (hash) saklanır.
						</p>
						<p>
							Giriş yaptığında tarayıcına bir oturum çerezi bırakılır. Kötüye
							kullanımı önlemek için oturumlarla birlikte IP adresi ve tarayıcı
							bilgisi de tutulur.
						</p>
						<p>
							Siteye eklediğin kitaplar, puanların, yorumların ve Raf Alanı
							mesajların hesabınla ilişkilendirilerek saklanır.
						</p>
					</section>
					<section className="space-y-3">
						<h2 className="font-sans text-xl font-semibold">
							Bilgiler ne için kullanılır?
						</h2>
						<p>
							Yalnızca hesabını açmak, giriş yapmanı sağlamak ve paylaştıklarını
							sana bağlamak için. Bilgilerin kimseyle paylaşılmaz, satılmaz ve
							reklam için kullanılmaz. Site, Cloudflare altyapısında çalışır ve
							veriler orada saklanır.
						</p>
					</section>
					<section className="space-y-3">
						<h2 className="font-sans text-xl font-semibold">Hesabını silmek</h2>
						<p>
							Giriş yaptıktan sonra{" "}
							<Link to="/sign-in">giriş sayfasındaki</Link> “Hesabımı sil”
							düğmesiyle hesabını istediğin zaman kendin silebilirsin. Hesabınla
							birlikte oturumların, puanların, yorumların ve Raf Alanı
							mesajların da silinir; eklediğin kitaplar kitaplıkta, kimin
							eklediği belli olmadan kalır.
						</p>
					</section>
				</div>
			</article>
		</main>
	);
}
