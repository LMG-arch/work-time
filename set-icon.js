const fs = require('fs');
const path = require('path');
const { NtExecutable, NtExecutableResource, Resource } = require('resedit');

// RawIconItem is imported internally, we need to access it
// Since resedit uses ESM internally, we'll create the icon data manually

const exePath = path.join(__dirname, 'dist', 'WorkCalendar-win32-x64', 'WorkCalendar.exe');
const icoPath = path.join(__dirname, 'assets', 'icon.ico');

function parseICO(buffer) {
  const count = buffer.readUInt16LE(4);
  const icons = [];
  for (let i = 0; i < count; i++) {
    const entry = buffer.slice(6 + i * 16, 6 + (i + 1) * 16);
    const width = entry[0] || 256;
    const height = entry[1] || 256;
    const bitCount = entry.readUInt16LE(6);
    const size = entry.readUInt32LE(8);
    const offset = entry.readUInt32LE(12);
    icons.push({
      width,
      height,
      bitCount,
      data: new Uint8Array(buffer.slice(offset, offset + size)),
    });
  }
  return icons;
}

async function main() {
  // Dynamically import RawIconItem from resedit's internal modules
  const reseditPath = path.dirname(require.resolve('resedit'));
  const rawIconPath = path.join(reseditPath, 'data', 'RawIconItem.js');
  const fileUrl = 'file:///' + rawIconPath.replace(/\\/g, '/');
  const { default: RawIconItem } = await import(fileUrl);

  const exeBuf = fs.readFileSync(exePath);
  const exe = NtExecutable.from(exeBuf);
  const res = NtExecutableResource.from(exe);

  const icoData = fs.readFileSync(icoPath);
  const icons = parseICO(icoData);

  // Create RawIconItem instances
  const iconItems = icons.map(icon =>
    RawIconItem.from(icon.data, icon.width, icon.height, icon.bitCount)
  );

  // Replace icon group 1
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1,  // icon group ID
    0,  // lang
    iconItems
  );

  // Update exe
  res.outputResource(exe);
  const newExe = Buffer.from(exe.generate());
  fs.writeFileSync(exePath, newExe);
  console.log('Icon set successfully! File size:', newExe.length);
}

main().catch(err => {
  console.error('Failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
