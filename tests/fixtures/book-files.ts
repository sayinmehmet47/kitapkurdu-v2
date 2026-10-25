import { strToU8, type Zippable, zipSync } from "fflate";

// Small, real documents; never upload a user's book or personal file in tests.
export function samplePdf() {
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 560] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
		pdfStream("KitapKurdu PDF page 1"),
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 560] /Resources << /Font << /F1 3 0 R >> >> /Contents 7 0 R >>",
		pdfStream("KitapKurdu PDF page 2"),
	];
	let result = "%PDF-1.7\n";
	const offsets = [0];
	objects.forEach((object, index) => {
		offsets.push(result.length);
		result += `${index + 1} 0 obj\n${object}\nendobj\n`;
	});
	const xref = result.length;
	result += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
	for (const offset of offsets.slice(1)) {
		result += `${String(offset).padStart(10, "0")} 00000 n \n`;
	}
	result += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return strToU8(result);
}

function pdfStream(text: string) {
	const content = `BT /F1 18 Tf 36 480 Td (${text}) Tj ET`;
	return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
}

export function sampleEpub(
	overrides: Record<string, string | Uint8Array> = {},
) {
	const files: Record<string, string | Uint8Array> = {
		mimetype: "application/epub+zip",
		"META-INF/container.xml": `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles>
<rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
</rootfiles></container>`,
		"EPUB/package.opf": `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">synthetic-book</dc:identifier><dc:title>Örnek EPUB</dc:title><dc:language>tr</dc:language></metadata>
<manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="one"/><itemref idref="two"/></spine></package>`,
		"EPUB/one.xhtml": `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Birinci bölüm</title></head><body><h1>Birinci bölüm</h1><p>Kitaplar yeni dünyalara açılan kapılardır.</p></body></html>`,
		"EPUB/two.xhtml": `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>İkinci bölüm</title></head><body><h1>İkinci bölüm</h1><p>Okumaya ikinci bölümden devam ediyoruz.</p></body></html>`,
		...overrides,
	};
	const archive: Zippable = {};
	for (const [name, content] of Object.entries(files)) {
		const bytes = typeof content === "string" ? strToU8(content) : content;
		archive[name] = name === "mimetype" ? [bytes, { level: 0 }] : bytes;
	}
	return zipSync(archive);
}
