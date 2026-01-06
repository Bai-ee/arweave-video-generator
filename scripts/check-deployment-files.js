/**
 * Check Deployment Files
 * 
 * Verifies that all critical files exist locally and will be included in deployment
 */

import { collectWebsiteFiles } from '../lib/WebsiteDeployer.js';
import fs from 'fs-extra';
import path from 'path';

const websiteDir = './website';

console.log('🔍 Checking Deployment Files\n');
console.log('='.repeat(60));

// Check if files exist on disk
console.log('\n📁 File Existence Check:');
const criticalFiles = [
  { path: 'img/covers/ue_banner.jpg', name: 'Banner Image' },
  { path: 'img/loge_horiz.png', name: 'Logo' },
  { path: 'fonts/IBM_Plex_Mono,Rationale,Shantell_Sans/Rationale/Rationale-Regular.ttf', name: 'Rationale Font' },
  { path: 'css/main.css', name: 'Main CSS' },
  { path: 'index.html', name: 'Index HTML' }
];

let allExist = true;
for (const file of criticalFiles) {
  const fullPath = path.join(websiteDir, file.path);
  const exists = await fs.pathExists(fullPath);
  if (exists) {
    const stats = await fs.stat(fullPath);
    console.log(`✅ ${file.name}: ${file.path} (${(stats.size / 1024).toFixed(1)} KB)`);
  } else {
    console.log(`❌ ${file.name}: ${file.path} - NOT FOUND`);
    allExist = false;
  }
}

// Check file collection
console.log('\n📦 File Collection Check:');
try {
  const collectedFiles = await collectWebsiteFiles(websiteDir);
  console.log(`Total files collected: ${collectedFiles.length}`);
  
  console.log('\nCritical files in collection:');
  for (const file of criticalFiles) {
    const found = collectedFiles.some(f => {
      const normalized = f.replace(/\\/g, '/');
      return normalized === file.path;
    });
    if (found) {
      console.log(`✅ ${file.path}`);
    } else {
      console.log(`❌ ${file.path} - NOT IN COLLECTION`);
      allExist = false;
    }
  }
  
  // Show sample of img/ files
  const imgFiles = collectedFiles.filter(f => f.includes('img/'));
  console.log(`\n📸 Found ${imgFiles.length} img/ files`);
  if (imgFiles.length > 0) {
    console.log('Sample img/ files:');
    imgFiles.slice(0, 5).forEach(f => console.log(`   ${f}`));
  }
  
  // Show sample of fonts/ files
  const fontFiles = collectedFiles.filter(f => f.includes('fonts/'));
  console.log(`\n🔤 Found ${fontFiles.length} fonts/ files`);
  if (fontFiles.length > 0) {
    console.log('Sample fonts/ files:');
    fontFiles.slice(0, 5).forEach(f => console.log(`   ${f}`));
  }
  
} catch (error) {
  console.error('❌ Error collecting files:', error.message);
  allExist = false;
}

// Check HTML references
console.log('\n🔗 HTML Path References:');
try {
  const indexPath = path.join(websiteDir, 'index.html');
  if (await fs.pathExists(indexPath)) {
    const htmlContent = await fs.readFile(indexPath, 'utf-8');
    
    const checks = [
      { pattern: /src=["']img\/covers\/ue_banner\.jpg["']/, name: 'Banner image reference' },
      { pattern: /src=["']img\/loge_horiz\.png["']/, name: 'Logo reference' },
      { pattern: /url\(['"]?\.\.\/fonts\//, name: 'Relative font path in CSS' }
    ];
    
    checks.forEach(check => {
      if (check.pattern.test(htmlContent)) {
        console.log(`✅ ${check.name} - Found`);
      } else {
        console.log(`⚠️  ${check.name} - Not found (may be in CSS file)`);
      }
    });
  }
} catch (error) {
  console.error('❌ Error checking HTML:', error.message);
}

// Check CSS font paths
console.log('\n🎨 CSS Font Path Check:');
try {
  const cssPath = path.join(websiteDir, 'css/main.css');
  if (await fs.pathExists(cssPath)) {
    const cssContent = await fs.readFile(cssPath, 'utf-8');
    
    // Check for absolute paths (wrong)
    const absolutePaths = cssContent.match(/url\(['"]?\/fonts\//g);
    if (absolutePaths) {
      console.log(`❌ Found ${absolutePaths.length} absolute font paths (should be relative)`);
      console.log('   Example:', absolutePaths[0]);
    } else {
      console.log('✅ No absolute font paths found');
    }
    
    // Check for relative paths (correct)
    const relativePaths = cssContent.match(/url\(['"]?\.\.\/fonts\//g);
    if (relativePaths) {
      console.log(`✅ Found ${relativePaths.length} relative font paths`);
    }
  }
} catch (error) {
  console.error('❌ Error checking CSS:', error.message);
}

// Summary
console.log('\n' + '='.repeat(60));
if (allExist) {
  console.log('✅ All critical files exist and will be included in deployment');
  console.log('\n💡 Next steps:');
  console.log('   1. Deploy the website');
  console.log('   2. After deployment, get the manifest ID from the response');
  console.log('   3. Run: node scripts/inspect-manifest.js <manifest-id>');
  console.log('   4. Check if files are in the deployed manifest');
} else {
  console.log('❌ Some files are missing or not being collected');
  console.log('\n💡 Check:');
  console.log('   - File paths are correct');
  console.log('   - Files are not in ignored directories (archive/, active/, etc.)');
  console.log('   - File extensions are allowed (.jpg, .png, .ttf, etc.)');
}

console.log('\n');










