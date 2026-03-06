const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { ClassicLevel } = require('classic-level');

const PACKS_SOURCE_DIR = path.join(__dirname, '../static/packs');
const PACK_NAMES = ['roguelike-classes', 'roguelike-ancestries', 'roguelike-backgrounds'];

const MODULE_ID = 'ai-pf2e-assistant';

function addFoundryMetadata(data, packName) {
  const key = `!items!${data._id}`;
  const now = Date.now();
  return {
    folder: data.folder ?? null,
    name: data.name,
    type: data.type,
    _id: data._id,
    img: data.img,
    system: data.system,
    sort: data.sort ?? 0,
    ownership: data.ownership ?? { default: 0 },
    flags: data.flags ?? {},
    _stats: data._stats ?? {
      compendiumSource: `Compendium.${MODULE_ID}.${packName}.Item.${data._id}`,
      duplicateSource: null,
      coreVersion: '13.344',
      systemId: 'pf2e',
      systemVersion: '7.4.0',
      createdTime: now,
      modifiedTime: now,
      lastModifiedBy: 'AIPf2eBuilder000'
    },
    _key: key
  };
}

async function buildPack(packName, outputDir) {
  const sourceDir = path.join(PACKS_SOURCE_DIR, packName);
  const destDir = path.join(outputDir, packName);

  if (!await fs.pathExists(sourceDir)) {
    console.log(chalk.yellow(`  Skipping ${packName}: source directory not found`));
    return;
  }

  const jsonFiles = (await fs.readdir(sourceDir)).filter(f => f.endsWith('.json'));
  if (jsonFiles.length === 0) {
    console.log(chalk.yellow(`  Skipping ${packName}: no JSON files found`));
    return;
  }

  await fs.ensureDir(destDir);
  try {
    await fs.emptyDir(destDir);
  } catch (err) {
    console.log(chalk.yellow(`    Warning: Could not clean ${packName} directory (may be locked by Foundry)`));
  }

  const db = new ClassicLevel(destDir, { keyEncoding: 'utf8', valueEncoding: 'utf8' });
  try {
    await db.open();
  } catch (err) {
    console.log(chalk.yellow(`    Skipping ${packName}: LevelDB locked (Foundry may be running)`));
    return;
  }

  for (const file of jsonFiles) {
    const filePath = path.join(sourceDir, file);
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);

    if (!data._id) {
      console.log(chalk.yellow(`  Warning: ${file} has no _id, skipping`));
      continue;
    }

    const doc = addFoundryMetadata(data, packName);
    const key = `!items!${data._id}`;
    await db.put(key, JSON.stringify(doc));
    console.log(chalk.green(`    + ${data.name} (${data._id})`));
  }

  await db.close();
  console.log(chalk.green(`  Built ${packName}: ${jsonFiles.length} entries`));
}

async function buildAllPacks(targetDir) {
  const outputDir = targetDir
    ? path.join(targetDir, 'packs')
    : path.join(__dirname, '../dist/packs');

  console.log(chalk.blue('Building compendium packs...'));
  console.log(chalk.blue(`  Source: ${PACKS_SOURCE_DIR}`));
  console.log(chalk.blue(`  Output: ${outputDir}`));

  await fs.ensureDir(outputDir);

  for (const packName of PACK_NAMES) {
    await buildPack(packName, outputDir);
  }

  console.log(chalk.green('Pack build complete!'));
}

if (require.main === module) {
  buildAllPacks().catch(err => {
    console.error(chalk.red('Pack build failed:'), err);
    process.exit(1);
  });
}

module.exports = { buildAllPacks };
