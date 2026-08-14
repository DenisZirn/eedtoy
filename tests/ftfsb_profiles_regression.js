const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); console.log(`PASS: ${message}`); }
assert(source.includes('"A5-04-02-FTFSB"'), 'FTFSB A5-04-02 profile exists');
assert(source.includes('"A5-04-03-FTFSB"'), 'FTFSB A5-04-03 profile exists');
assert(source.includes('teach_in_telegram:"10-10-0D-87"'), 'FTFSB A5-04-02 teach-in is correct');
assert(source.includes('teach_in_telegram:"10-18-0D-80"'), 'FTFSB A5-04-03 teach-in is correct');
assert(source.includes('["A5-04-02-FTFSB", "A5-04-03-FTFSB"]'), 'existing authoritative databases receive FTFSB profiles once');
console.log('All FTFSB profile regression tests passed.');
