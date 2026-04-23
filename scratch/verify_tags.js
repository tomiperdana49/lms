const fs = require('fs');
const content = fs.readFileSync('/Users/tomi/wardix/lms/src/components/TrainingInternalList.tsx', 'utf8');

let depth = 0;
let lines = content.split('\n');
let insideReturn = false;

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.includes('return (')) insideReturn = true;
    if (insideReturn) {
        let opens = (line.match(/<[a-zA-Z][^>]*[^\/]>|<[a-zA-Z]>/g) || []).length;
        let closes = (line.match(/<\/[a-zA-Z][^>]*>/g) || []).length;
        depth += opens;
        depth -= closes;
        if (depth < 0) {
            console.log(`ERROR: Extra closing tag at line ${i + 1}: ${line}`);
            depth = 0; // Reset to continue
        }
    }
    if (line.includes(');')) insideReturn = false;
}
console.log('Final depth:', depth);
