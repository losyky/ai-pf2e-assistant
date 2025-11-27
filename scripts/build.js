const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
require('dotenv').config();

// 源目录和目标目录
const distDir = path.join(__dirname, '../dist');
const staticDir = path.join(__dirname, '../static');
const moduleJsonPath = path.join(staticDir, 'module.json');

async function build() {
  try {
    // 输出环境信息
    console.log(chalk.blue('Environment information:'));
    console.log(chalk.blue(`- Current working directory: ${process.cwd()}`));
    console.log(chalk.blue(`- Dist directory: ${distDir}`));
    console.log(chalk.blue(`- Static directory: ${staticDir}`));
    console.log(chalk.blue(`- FOUNDRY_DATA_PATH: ${process.env.FOUNDRY_DATA_PATH || 'Not set'}`));
    
    // 确保 dist 目录存在
    await fs.ensureDir(distDir);
    
    // 读取 module.json
    const moduleJson = await fs.readJson(moduleJsonPath);
    console.log(chalk.blue(`- Module name: ${moduleJson.id}`));
    
    // 创建目标目录
    const targetDir = process.env.FOUNDRY_DATA_PATH 
      ? path.join(process.env.FOUNDRY_DATA_PATH, 'modules', moduleJson.id)
      : path.join(__dirname, '../build');
    console.log(chalk.blue(`- Target directory: ${targetDir}`));
    
    // 检查目标目录是否存在
    if (process.env.FOUNDRY_DATA_PATH && !fs.existsSync(process.env.FOUNDRY_DATA_PATH)) {
      console.error(chalk.red(`Error: FOUNDRY_DATA_PATH (${process.env.FOUNDRY_DATA_PATH}) does not exist.`));
      console.error(chalk.yellow('Please check your .env file and ensure the path is correct.'));
      process.exit(1);
    }
    
    // 确保源目录和目标目录不同
    if (path.resolve(distDir) === path.resolve(targetDir)) {
      console.error(chalk.red('Error: Source and destination directories are the same.'));
      console.error(chalk.yellow(`Source: ${distDir}`));
      console.error(chalk.yellow(`Target: ${targetDir}`));
      console.error(chalk.yellow('Please check your FOUNDRY_DATA_PATH in .env file.'));
      process.exit(1);
    }
    
    // 清空目标目录，确保不会有旧文件残留
    console.log(chalk.blue('Cleaning target directory...'));
    await fs.emptyDir(targetDir);
    
    // 复制构建文件到目标目录
    console.log(chalk.blue('Copying built JS files...'));
    const jsFiles = await fs.readdir(distDir);
    for (const file of jsFiles) {
      if (file.endsWith('.js') || file.endsWith('.mjs')) {
        await fs.copy(path.join(distDir, file), path.join(targetDir, file));
        console.log(chalk.green(`  - Copied ${file}`));
      }
    }
    
    // 同步源文件到静态文件夹
    console.log(chalk.blue('Syncing source files to static directory...'));
    const srcDir = path.join(__dirname, '../src');
    
    // 同步模板文件
    const srcTemplatesDir = path.join(srcDir, 'templates');
    const staticTemplatesDir = path.join(staticDir, 'templates');
    if (await fs.pathExists(srcTemplatesDir)) {
      await fs.copy(srcTemplatesDir, staticTemplatesDir);
      console.log(chalk.green('  - Synced templates to static'));
    }
    
    // 同步样式文件
    const srcStylesDir = path.join(srcDir, 'styles');
    const staticStylesDir = path.join(staticDir, 'styles');
    if (await fs.pathExists(srcStylesDir)) {
      await fs.copy(srcStylesDir, staticStylesDir);
      console.log(chalk.green('  - Synced styles to static'));
    }
    
    // 同步语言文件
    const srcLangDir = path.join(srcDir, 'lang');
    const staticLangDir = path.join(staticDir, 'lang');
    if (await fs.pathExists(srcLangDir)) {
      await fs.copy(srcLangDir, staticLangDir);
      console.log(chalk.green('  - Synced language files to static'));
    }
    
    // 复制静态文件到目标目录
    console.log(chalk.blue('Copying static files...'));
    await fs.copy(staticDir, targetDir);
    console.log(chalk.green('  - Copied all static files'));
    
    console.log(chalk.green('Build completed successfully!'));
    console.log(chalk.yellow(`Files copied to ${targetDir}`));
    console.log(chalk.blue('Verify that the following files exist in the target directory:'));
    console.log(chalk.blue(`  - ${targetDir}/ai-pf2e-assistant.js`));
    console.log(chalk.blue(`  - ${targetDir}/styles/ai-pf2e-assistant.css`));
    console.log(chalk.blue(`  - ${targetDir}/templates/ai-generator-app.hbs`));
    console.log(chalk.blue(`  - ${targetDir}/lang/en.json`));
    console.log(chalk.blue(`  - ${targetDir}/module.json`));
  } catch (error) {
    console.error(chalk.red('Build failed:'), error);
    process.exit(1);
  }
}

build(); 