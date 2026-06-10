const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'Multi-Category Schedule 2.csv');
const jsonPath = path.join(__dirname, '..', 'element_links.json');

const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/);

const elements = {};

// Skip row 0 (title), row 1 (headers), row 2 (empty)
for (let i = 3; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split into parts — IfcGUID is always last, Level second-to-last, Category first
    // Family and Type may theoretically contain commas, so take the middle slice
    const parts = line.split(',');
    if (parts.length < 4) continue;

    const category     = parts[0].trim();
    const ifcGUID      = parts[parts.length - 1].trim();
    const level        = parts[parts.length - 2].trim();
    const familyAndType = parts.slice(1, parts.length - 2).join(',').trim();

    if (!ifcGUID) continue;

    elements[ifcGUID] = { category, familyAndType, level };
}

fs.writeFileSync(jsonPath, JSON.stringify(elements, null, 2));
console.log(`Written ${Object.keys(elements).length} elements to element_links.json`);
