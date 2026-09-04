const fs = require('fs');
const path = require('path');

const publicDirectory = fs.existsSync(path.join(__dirname, 'public')) ? 'public' : 'dist';
const publicRoot = path.join(__dirname, publicDirectory);
const dogsRoot = path.join(publicRoot, 'assets', 'dogs');
const supportedImage = /\.(avif|gif|jpe?g|png|webp)$/i;
const naturalSort = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function readProfile(profilePath) {
  const text = fs.readFileSync(profilePath, 'utf8').replaceAll('\r\n', '\n').trim();
  const descriptionMatch = text.match(/^Description:\s*(.*)$/im);
  if (!descriptionMatch) throw new Error(`${profilePath}: missing Description:`);

  const fields = {};
  const header = text.slice(0, descriptionMatch.index);
  for (const line of header.split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key) fields[key] = value;
  }

  const descriptionStart = descriptionMatch.index + descriptionMatch[0].length - descriptionMatch[1].length;
  fields.description = text.slice(descriptionStart).trim();
  return fields;
}

function webPath(...segments) {
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

if (!fs.existsSync(dogsRoot)) throw new Error(`Dog folder not found: ${dogsRoot}`);

const profiles = fs.readdirSync(dogsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
  .map((entry) => {
    const slug = entry.name;
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new Error(`Dog folder "${slug}" must use lowercase letters, numbers, and hyphens only.`);
    }

    const dogRoot = path.join(dogsRoot, slug);
    const profilePath = path.join(dogRoot, 'profile.txt');
    const photosRoot = path.join(dogRoot, 'photos');
    if (!fs.existsSync(profilePath)) throw new Error(`${slug}: missing profile.txt`);
    if (!fs.existsSync(photosRoot)) throw new Error(`${slug}: missing photos folder`);

    const fields = readProfile(profilePath);
    for (const required of ['name', 'age', 'sex', 'breed', 'description']) {
      if (!fields[required]) throw new Error(`${profilePath}: missing ${required[0].toUpperCase() + required.slice(1)}:`);
    }

    const filenames = fs.readdirSync(photosRoot)
      .filter((filename) => supportedImage.test(filename))
      .sort(naturalSort.compare);
    if (!filenames.length) throw new Error(`${slug}: photos folder contains no supported images`);

    const featured = fields['featured photo'];
    if (featured && !filenames.includes(featured)) {
      throw new Error(`${profilePath}: featured photo "${featured}" was not found in the photos folder`);
    }
    const orderedPhotos = featured
      ? [featured, ...filenames.filter((filename) => filename !== featured)]
      : filenames;

    return {
      slug,
      name: fields.name,
      age: fields.age,
      sex: fields.sex,
      breed: fields.breed,
      status: fields.status || 'Available',
      health: (fields.health || '').split('|').map((item) => item.trim()).filter(Boolean),
      description: fields.description,
      photos: orderedPhotos.map((filename) => webPath('assets', 'dogs', slug, 'photos', filename)),
    };
  })
  .sort((a, b) => naturalSort.compare(a.name, b.name));

const output = `window.SALTY_DOG_PROFILES = ${JSON.stringify(profiles, null, 2)};\n`;
fs.writeFileSync(path.join(publicRoot, 'dogs.js'), output);
console.log(`Built ${profiles.length} dog profile${profiles.length === 1 ? '' : 's'}.`);
