import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface HTMLTemplate {
    title: string;
    keywords: string[];
    content: string;
    theme: 'business' | 'portfolio' | 'blog' | 'ecommerce' | 'landing';
}

const templates = {
    business: {
        title: 'Business Solutions',
        structure: (title: string, keywords: string[], content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${keywords.join(', ')}">
    <meta name="keywords" content="${keywords.join(', ')}">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; text-align: center; }
        .nav { background: #2d3748; padding: 1rem; }
        .nav ul { list-style: none; display: flex; justify-content: center; gap: 2rem; }
        .nav a { color: white; text-decoration: none; }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        .section { margin: 3rem 0; }
        h1, h2 { color: #2d3748; margin-bottom: 1rem; }
        .content { background: #f7fafc; padding: 2rem; border-radius: 8px; margin: 1rem 0; }
        .footer { background: #2d3748; color: white; text-align: center; padding: 2rem; margin-top: 3rem; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${title}</h1>
        <p>Professional Business Solutions</p>
    </div>
    <nav class="nav">
        <ul>
            <li><a href="#home">Home</a></li>
            <li><a href="#services">Services</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#contact">Contact</a></li>
        </ul>
    </nav>
    <div class="container">
        <section class="section">
            <h2>Welcome to Our Business</h2>
            <div class="content">
                ${content}
            </div>
        </section>
        <section class="section">
            <h2>Our Services</h2>
            <div class="content">
                <p>We provide comprehensive business solutions including ${keywords.join(', ')}. Our team is dedicated to delivering excellence.</p>
            </div>
        </section>
    </div>
    <footer class="footer">
        <p>&copy; 2024 ${title}. All rights reserved.</p>
    </footer>
</body>
</html>`
    },
    portfolio: {
        title: 'Creative Portfolio',
        structure: (title: string, keywords: string[], content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${keywords.join(', ')}">
    <meta name="keywords" content="${keywords.join(', ')}">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Georgia', serif; line-height: 1.8; color: #2c3e50; background: #ecf0f1; }
        .hero { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 4rem 2rem; text-align: center; }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        .gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin: 2rem 0; }
        .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1, h2 { margin-bottom: 1rem; }
        .content { margin: 2rem 0; }
    </style>
</head>
<body>
    <div class="hero">
        <h1>${title}</h1>
        <p>Showcasing Creative Excellence</p>
    </div>
    <div class="container">
        <div class="content">
            ${content}
        </div>
        <h2>Featured Projects</h2>
        <div class="gallery">
            <div class="card">
                <h3>Project ${keywords[0] || 'One'}</h3>
                <p>Exploring ${keywords.join(' and ')} in creative design.</p>
            </div>
            <div class="card">
                <h3>Project ${keywords[1] || 'Two'}</h3>
                <p>Innovative solutions for modern challenges.</p>
            </div>
            <div class="card">
                <h3>Project ${keywords[2] || 'Three'}</h3>
                <p>Bringing ideas to life through design.</p>
            </div>
        </div>
    </div>
</body>
</html>`
    },
    blog: {
        title: 'Tech Blog',
        structure: (title: string, keywords: string[], content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${keywords.join(', ')}">
    <meta name="keywords" content="${keywords.join(', ')}">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; background: #fff; }
        .header { background: #1a202c; color: white; padding: 2rem; }
        .container { max-width: 900px; margin: 0 auto; padding: 2rem; }
        .post { background: white; padding: 2rem; margin: 2rem 0; border-left: 4px solid #4299e1; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1, h2 { color: #2d3748; margin-bottom: 1rem; }
        .meta { color: #718096; font-size: 0.9em; margin-bottom: 1rem; }
        .content { margin: 1rem 0; }
    </style>
</head>
<body>
    <header class="header">
        <h1>${title}</h1>
        <p>Latest Articles and Insights</p>
    </header>
    <div class="container">
        <article class="post">
            <h2>Understanding ${keywords[0] || 'Technology'}</h2>
            <div class="meta">Published: ${new Date().toLocaleDateString()}</div>
            <div class="content">
                ${content}
            </div>
        </article>
        <article class="post">
            <h2>The Future of ${keywords[1] || 'Innovation'}</h2>
            <div class="meta">Published: ${new Date().toLocaleDateString()}</div>
            <div class="content">
                <p>Exploring ${keywords.join(', ')} and their impact on modern technology. This article delves into the latest trends and developments.</p>
            </div>
        </article>
    </div>
</body>
</html>`
    },
    ecommerce: {
        title: 'Online Store',
        structure: (title: string, keywords: string[], content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${keywords.join(', ')}">
    <meta name="keywords" content="${keywords.join(', ')}">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Helvetica', sans-serif; line-height: 1.6; color: #333; }
        .header { background: #e53e3e; color: white; padding: 2rem; text-align: center; }
        .products { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; padding: 2rem; }
        .product { border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.5rem; text-align: center; background: white; }
        .product h3 { color: #2d3748; margin-bottom: 1rem; }
        .price { color: #e53e3e; font-size: 1.5em; font-weight: bold; margin: 1rem 0; }
        .container { max-width: 1200px; margin: 0 auto; }
        .content { padding: 2rem; background: #f7fafc; margin: 2rem; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${title}</h1>
        <p>Your One-Stop Shop</p>
    </div>
    <div class="container">
        <div class="content">
            ${content}
        </div>
        <div class="products">
            <div class="product">
                <h3>${keywords[0] || 'Product'} One</h3>
                <p>High quality ${keywords[0] || 'item'} for your needs.</p>
                <div class="price">$99.99</div>
            </div>
            <div class="product">
                <h3>${keywords[1] || 'Product'} Two</h3>
                <p>Premium ${keywords[1] || 'item'} with excellent features.</p>
                <div class="price">$149.99</div>
            </div>
            <div class="product">
                <h3>${keywords[2] || 'Product'} Three</h3>
                <p>Best value ${keywords[2] || 'item'} on the market.</p>
                <div class="price">$199.99</div>
            </div>
        </div>
    </div>
</body>
</html>`
    },
    landing: {
        title: 'Landing Page',
        structure: (title: string, keywords: string[], content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${keywords.join(', ')}">
    <meta name="keywords" content="${keywords.join(', ')}">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Verdana', sans-serif; line-height: 1.6; color: #333; }
        .hero { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 6rem 2rem; text-align: center; }
        .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; padding: 4rem 2rem; }
        .feature { text-align: center; padding: 2rem; }
        .feature h3 { color: #2d3748; margin-bottom: 1rem; }
        .cta { background: #48bb78; color: white; padding: 1rem 2rem; border: none; border-radius: 5px; font-size: 1.2em; cursor: pointer; margin: 2rem; }
        .content { max-width: 800px; margin: 0 auto; padding: 2rem; }
    </style>
</head>
<body>
    <div class="hero">
        <h1>${title}</h1>
        <p>Transform Your Business Today</p>
        <button class="cta">Get Started</button>
    </div>
    <div class="content">
        ${content}
    </div>
    <div class="features">
        <div class="feature">
            <h3>${keywords[0] || 'Feature'} One</h3>
            <p>Discover the power of ${keywords[0] || 'innovation'}.</p>
        </div>
        <div class="feature">
            <h3>${keywords[1] || 'Feature'} Two</h3>
            <p>Experience ${keywords[1] || 'excellence'} like never before.</p>
        </div>
        <div class="feature">
            <h3>${keywords[2] || 'Feature'} Three</h3>
            <p>Join thousands using ${keywords[2] || 'solutions'}.</p>
        </div>
    </div>
</body>
</html>`
    }
};

function generateContent(keywords: string[]): string {
    const sentences = [
        `Welcome to our platform featuring ${keywords.join(', ')}.`,
        `We specialize in ${keywords[0] || 'excellence'} and ${keywords[1] || 'innovation'}.`,
        `Our services include comprehensive solutions for ${keywords.join(' and ')}.`,
        `Discover how ${keywords[0] || 'technology'} can transform your business.`,
        `Join us in exploring ${keywords.join(', ')} and their applications.`,
        `We provide expert guidance on ${keywords.join(' and ')}.`,
        `Learn about the latest trends in ${keywords[0] || 'industry'}.`,
        `Our team is dedicated to ${keywords.join(' and ')} excellence.`
    ];
    
    return sentences.slice(0, 4).join(' ');
}

function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

function question(rl: readline.Interface, query: string): Promise<string> {
    return new Promise(resolve => rl.question(query, resolve));
}

async function collectHTMLInfo(count: number): Promise<HTMLTemplate[]> {
    const rl = createReadlineInterface();
    const templatesList: HTMLTemplate[] = [];
    const themeOptions = ['business', 'portfolio', 'blog', 'ecommerce', 'landing'];

    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== HTML Generator ===`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Toplam ${count} HTML dosyası oluşturulacak.\n`);

    for (let i = 0; i < count; i++) {
        console.log(`\n[${i + 1}/${count}] HTML Dosyası Bilgileri:`);
        
        let title = '';
        while (!title.trim()) {
            title = await question(rl, `  Başlık: `);
            if (!title.trim()) {
                console.log('  ⚠️  Başlık boş olamaz.');
            }
        }

        let keywordsInput = '';
        while (!keywordsInput.trim()) {
            keywordsInput = await question(rl, `  Keywords (virgülle ayırın): `);
            if (!keywordsInput.trim()) {
                console.log('  ⚠️  En az bir keyword girmelisiniz.');
            }
        }
        const keywords = keywordsInput.split(',').map(k => k.trim()).filter(k => k.length > 0);

        let theme = '';
        while (!themeOptions.includes(theme)) {
            theme = await (await question(rl, `  Tema (${themeOptions.join('/')}): `)).toLowerCase();
            if (!themeOptions.includes(theme)) {
                console.log(`  ⚠️  Lütfen ${themeOptions.join(', ')} temalarından birini seçin.`);
            }
        }

        const content = generateContent(keywords);
        
        templatesList.push({
            title: title.trim(),
            keywords,
            content,
            theme: theme as HTMLTemplate['theme']
        });

        console.log(`  ✓ Kaydedildi: ${title} (${theme})`);
    }

    rl.close();
    return templatesList;
}

function generateHTML(template: HTMLTemplate): string {
    const templateFunc = templates[template.theme];
    return templateFunc.structure(template.title, template.keywords, template.content);
}

async function generateHTMLFiles(
    count: number,
    outputDir: string = 'html_files'
): Promise<string[]> {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const templates = await collectHTMLInfo(count);
    const generatedFiles: string[] = [];
    const existingFiles = fs.readdirSync(outputDir)
        .filter(f => f.match(/^\d+\.html$/))
        .map(f => parseInt(f.replace('.html', '')))
        .filter(n => !isNaN(n));
    
    const startNumber = existingFiles.length > 0 ? Math.max(...existingFiles) + 1 : 1;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== HTML Dosyaları Oluşturuluyor ===`);
    console.log(`${'='.repeat(60)}\n`);

    for (let i = 0; i < templates.length; i++) {
        const template = templates[i];
        const fileNumber = startNumber + i;
        const fileName = `${fileNumber}.html`;
        const filePath = path.join(outputDir, fileName);

        const htmlContent = generateHTML(template);
        fs.writeFileSync(filePath, htmlContent, 'utf-8');

        generatedFiles.push(filePath);
        console.log(`✓ [${i + 1}/${templates.length}] ${fileName} oluşturuldu`);
        console.log(`  Başlık: ${template.title}`);
        console.log(`  Tema: ${template.theme}`);
        console.log(`  Keywords: ${template.keywords.join(', ')}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== Tamamlandı ===`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Toplam ${generatedFiles.length} HTML dosyası oluşturuldu.`);
    console.log(`Klasör: ${path.resolve(outputDir)}`);
    console.log(`${'='.repeat(60)}\n`);

    return generatedFiles;
}

const __filename_htmlGen = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && (
    process.argv[1].endsWith('htmlGenerator.ts') ||
    process.argv[1].endsWith('htmlGenerator.js') ||
    path.resolve(process.argv[1]) === path.resolve(__filename_htmlGen)
);

if (isMainModule) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('Usage: tsx src/htmlGenerator.ts <count> [output_dir]');
        console.log('');
        console.log('Example:');
        console.log('  tsx src/htmlGenerator.ts 5');
        console.log('  tsx src/htmlGenerator.ts 10 html_files');
        process.exit(1);
    }

    const count = parseInt(args[0]);
    if (isNaN(count) || count <= 0) {
        console.error('Hata: Geçerli bir sayı girmelisiniz.');
        process.exit(1);
    }

    const outputDir = args[1] || 'html_files';

    (async () => {
        try {
            await generateHTMLFiles(count, outputDir);
        } catch (error) {
            console.error('Hata:', (error as Error).message);
            process.exit(1);
        }
    })();
}

export { generateHTMLFiles, generateHTML, HTMLTemplate };