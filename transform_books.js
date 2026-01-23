const fs = require('fs');
const path = require('path');

// Adjust path as needed based on where we run this. Assuming root of workspace.
const filePath = path.join(process.cwd(), 'src/data/books.json');

try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(rawData);

    const transformed = data.map(item => ({
        title: item["Judul Buku"] || item.title, // Handle both just in case
        category: item["Kategori"] || item.category
    })).filter(item => item.title); // Filter out empty entries if any

    fs.writeFileSync(filePath, JSON.stringify(transformed, null, 2));
    console.log(`Successfully transformed ${transformed.length} books.`);
} catch (err) {
    console.error("Error transforming file:", err);
}
