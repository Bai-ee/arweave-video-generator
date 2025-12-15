/**
 * Inspect Arweave Manifest
 * 
 * This script helps troubleshoot resource loading issues by:
 * 1. Fetching the manifest from Arweave
 * 2. Checking if critical resources are present
 * 3. Comparing requested paths with manifest paths
 * 4. Providing direct Arweave URLs for each resource
 */

import fetch from 'node-fetch';

const MANIFEST_ID = process.argv[2];

if (!MANIFEST_ID) {
  console.error('Usage: node inspect-manifest.js <manifest-transaction-id>');
  console.error('Example: node inspect-manifest.js ypRlddql...');
  process.exit(1);
}

async function inspectManifest() {
  try {
    console.log('🔍 Inspecting Arweave Manifest...\n');
    console.log(`Manifest ID: ${MANIFEST_ID}`);
    console.log(`Manifest URL: https://arweave.net/${MANIFEST_ID}\n`);
    
    // Fetch manifest
    const manifestUrl = `https://arweave.net/${MANIFEST_ID}`;
    console.log(`📥 Fetching manifest from ${manifestUrl}...`);
    
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
    }
    
    const manifest = await response.json();
    
    console.log('✅ Manifest fetched successfully!\n');
    console.log('📋 Manifest Structure:');
    console.log(`   Manifest Type: ${manifest.manifest}`);
    console.log(`   Version: ${manifest.version}`);
    console.log(`   Index: ${manifest.index}`);
    console.log(`   Total Paths: ${Object.keys(manifest.paths || {}).length}\n`);
    
    // Check critical resources
    const criticalResources = [
      'img/covers/ue_banner.jpg',
      'img/loge_horiz.png',
      'fonts/IBM_Plex_Mono,Rationale,Shantell_Sans/Rationale/Rationale-Regular.ttf',
      'css/main.css',
      'index.html'
    ];
    
    console.log('🔍 Checking Critical Resources:\n');
    
    const missing = [];
    const found = [];
    
    for (const resourcePath of criticalResources) {
      const pathEntry = manifest.paths[resourcePath];
      if (pathEntry && pathEntry.id) {
        found.push({
          path: resourcePath,
          txId: pathEntry.id,
          url: `https://arweave.net/${pathEntry.id}`
        });
        console.log(`✅ ${resourcePath}`);
        console.log(`   Transaction ID: ${pathEntry.id}`);
        console.log(`   Direct URL: https://arweave.net/${pathEntry.id}\n`);
      } else {
        missing.push(resourcePath);
        console.log(`❌ ${resourcePath} - NOT FOUND in manifest\n`);
      }
    }
    
    // Show all img/ paths
    console.log('\n📁 All img/ paths in manifest:');
    const imgPaths = Object.keys(manifest.paths).filter(p => p.startsWith('img/'));
    if (imgPaths.length > 0) {
      imgPaths.slice(0, 20).forEach(path => {
        const entry = manifest.paths[path];
        console.log(`   ${path} -> ${entry.id}`);
      });
      if (imgPaths.length > 20) {
        console.log(`   ... and ${imgPaths.length - 20} more img/ paths`);
      }
    } else {
      console.log('   No img/ paths found!');
    }
    
    // Show all fonts/ paths
    console.log('\n📁 All fonts/ paths in manifest:');
    const fontPaths = Object.keys(manifest.paths).filter(p => p.startsWith('fonts/'));
    if (fontPaths.length > 0) {
      fontPaths.forEach(path => {
        const entry = manifest.paths[path];
        console.log(`   ${path} -> ${entry.id}`);
      });
    } else {
      console.log('   No fonts/ paths found!');
    }
    
    // Summary
    console.log('\n📊 Summary:');
    console.log(`   ✅ Found: ${found.length}/${criticalResources.length}`);
    console.log(`   ❌ Missing: ${missing.length}/${criticalResources.length}`);
    
    if (missing.length > 0) {
      console.log('\n⚠️  Missing Resources:');
      missing.forEach(path => console.log(`   - ${path}`));
      console.log('\n💡 These resources need to be added to the manifest in the next deployment.');
    }
    
    // Test URLs
    console.log('\n🌐 Test URLs:');
    console.log(`   Website: https://arweave.net/${MANIFEST_ID}/index.html`);
    if (found.find(r => r.path === 'img/covers/ue_banner.jpg')) {
      const banner = found.find(r => r.path === 'img/covers/ue_banner.jpg');
      console.log(`   Banner (direct): ${banner.url}`);
      console.log(`   Banner (via manifest): https://arweave.net/${MANIFEST_ID}/img/covers/ue_banner.jpg`);
    }
    if (found.find(r => r.path === 'img/loge_horiz.png')) {
      const logo = found.find(r => r.path === 'img/loge_horiz.png');
      console.log(`   Logo (direct): ${logo.url}`);
      console.log(`   Logo (via manifest): https://arweave.net/${MANIFEST_ID}/img/loge_horiz.png`);
    }
    
    // Check for path mismatches
    console.log('\n🔍 Path Analysis:');
    const allPaths = Object.keys(manifest.paths);
    const requestedPaths = [
      'img/covers/ue_banner.jpg',
      'img/loge_horiz.png',
      'fonts/IBM_Plex_Mono,Rationale,Shantell_Sans/Rationale/Rationale-Regular.ttf'
    ];
    
    requestedPaths.forEach(requested => {
      const exact = allPaths.includes(requested);
      const similar = allPaths.filter(p => p.includes(requested.split('/').pop()));
      
      if (exact) {
        console.log(`✅ ${requested} - exact match found`);
      } else if (similar.length > 0) {
        console.log(`⚠️  ${requested} - exact match NOT found, but similar paths exist:`);
        similar.forEach(p => console.log(`      ${p}`));
      } else {
        console.log(`❌ ${requested} - not found and no similar paths`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

inspectManifest();
