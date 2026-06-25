export async function extractGForm(urlStr) {
    let url = urlStr;
    if (url.includes('/edit')) {
        url = url.replace(/\/edit.*?$/, '/viewform');
    }
    const res = await fetch(url);
    const data = await res.text();
    const match = data.match(/var FB_PUBLIC_LOAD_DATA_ = (\[.*?\]);\s*<\/script>/);
    if (match) {
        const parsed = JSON.parse(match[1]);
        const questions = parsed[1][1];
        const result = [];
        let idCounter = 1;
        questions.forEach(q => {
            const title = q[1];
            const type = q[3]; // 2=radio, 4=checkbox, 3=dropdown
            if (type === 2 || type === 3 || type === 4) {
                if (q[4] && q[4][0] && q[4][0][1]) {
                    const options = q[4][0][1].map(o => o[0]);
                    result.push({
                        id: idCounter++,
                        question: title,
                        options: options,
                        correctAnswer: 0 // default 0
                    });
                }
            }
        });
        return result;
    }
    throw new Error('No form data found');
}
