const fs = require('fs');
const content = fs.readFileSync('/Users/tomi/wardix/lms/src/components/TrainingInternalList.tsx', 'utf8');

const returnStart = content.indexOf('return (');
const returnEnd = content.lastIndexOf(');');
const returnBlock = content.substring(returnStart, returnEnd);

let openDivs = 0;
let closeDivs = 0;

// Simple regex to count <div> and </div>
// This is naive but might help
const openMatches = returnBlock.match(/<div/g) || [];
const closeMatches = returnBlock.match(/<\/div>/g) || [];

console.log('Open <div:', openMatches.length);
console.log('Close </div>:', closeMatches.length);

// Also look for { ... } blocks that might contain returns
