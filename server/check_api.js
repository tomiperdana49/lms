
// Native fetch is available in Node 24
async function check() {
    try {
        console.log("Fetching Quiz Reports...");
        const response = await fetch('http://localhost:3000/api/admin/quiz-reports');
        if (!response.ok) {
            console.error("HTTP Error:", response.status);
            return;
        }
        const data = await response.json();

        console.log(`Total Records: ${data.length}`);

        const budi = data.filter(r => r.student_name && r.student_name.toLowerCase().includes('budi'));

        if (budi.length > 0) {
            console.log("XXX FOUND BUDI RECORDS XXX");
            console.table(budi);
        } else {
            console.log("XXX BUDI NOT FOUND IN QUIZ REPORTS XXX");
            console.log("Sample records:", data.slice(0, 3));
        }

    } catch (e) {
        console.error("Fetch failed. Is server running?", e);
    }
}

check();
