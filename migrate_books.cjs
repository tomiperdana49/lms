const fs = require('fs');
const path = require('path');

const booksPath = path.join(__dirname, 'src/data/books.json');
const dbPath = path.join(__dirname, 'server/data.json');

try {
    const books = JSON.parse(fs.readFileSync(booksPath, 'utf8'));
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

    if (!db.books) {
        db.books = [];
    }

    // Append books if they don't exist (check by title)
    let count = 0;
    books.forEach(book => {
        if (!db.books.find(b => b.title === book.title)) {
            // Normalize data
            const newBook = {
                id: Date.now() + Math.floor(Math.random() * 10000), // simplistic ID
                title: book.title,
                category: book.category,
                location: book.location
            };
            db.books.push(newBook);
            count++;
        }
    });

    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    console.log(`Successfully migrated ${count} books to server/data.json`);

} catch (err) {
    console.error('Migration failed:', err);
}
