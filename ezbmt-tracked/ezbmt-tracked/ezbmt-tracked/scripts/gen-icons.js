/* scripts/gen-icons.js */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.resolve(__dirname, '../assets/appicon.svg');

// iOS AppIcon 尺寸（pt × scale）
const ios = [
{ size: 20,  scales: [2,3] },
{ size: 29,  scales: [2,3] },
{ size: 40,  scales: [2,3] },
{ size: 60,  scales: [2,3] },
{ size: 1024, scales: [1], marketing: true },
];

// Android mipmap（px）
const android = [
{ dir: 'mipmap-mdpi',    size: 48 },
{ dir: 'mipmap-hdpi',    size: 72 },
{ dir: 'mipmap-xhdpi',   size: 96 },
{ dir: 'mipmap-xxhdpi',  size: 144 },
{ dir: 'mipmap-xxxhdpi', size: 192 },
];

(async () => {
// iOS
const iosDir = path.resolve(__dirname, '../ios/ezbmt/Images.xcassets/AppIcon.appiconset');
if (!fs.existsSync(iosDir)) fs.mkdirSync(iosDir, { recursive: true });
const contents = { images: [], info: { version: 1, author: 'xcode' } };

for (const row of ios) {
if (row.marketing) {
const out = path.join(iosDir, 'ios-marketing-1024.png');
await sharp(SRC).resize(1024, 1024).png().toFile(out);
contents.images.push({ idiom: 'ios-marketing', size: '1024x1024', scale: '1x', filename: 'ios-marketing-1024.png' });
continue;
}
for (const s of row.scales) {
const px = row.size * s;
const name = `icon-${row.size}pt@${s}x.png`;
const out = path.join(iosDir, name);
await sharp(SRC).resize(px, px).png().toFile(out);
contents.images.push({ idiom: 'iphone', size: `${row.size}x${row.size}`, scale: `${s}x`, filename: name });
}
}
fs.writeFileSync(path.join(iosDir, 'Contents.json'), JSON.stringify(contents, null, 2));

// Android
const resDir = path.resolve(__dirname, '../android/app/src/main/res');
for (const a of android) {
const dir = path.join(resDir, a.dir);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
await sharp(SRC).resize(a.size, a.size).png().toFile(path.join(dir, 'ic_launcher.png'));
await sharp(SRC).resize(a.size, a.size).png().toFile(path.join(dir, 'ic_launcher_round.png'));
}
console.log('✓ Icons generated for iOS/Android');
})();