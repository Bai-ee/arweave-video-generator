/**
 * Test Manifest Resources
 * 
 * Tests if specific resources are accessible via the manifest
 */

const MANIFEST_ID = process.argv[2];

if (!MANIFEST_ID) {
  console.error('Usage: node test-manifest-resources.js <manifest-id>');
  process.exit(1);
}

const baseUrl = `https://arweave.net/${MANIFEST_ID}`;

const resources = [
  { path: 'img/covers/ue_banner.jpg', name: 'Banner Image' },
  { path: 'img/loge_horiz.png', name: 'Logo' },
  { path: 'fonts/IBM_Plex_Mono,Rationale,Shantell_Sans/Rationale/Rationale-Regular.ttf', name: 'Rationale Font' },
  { path: 'css/main.css', name: 'Main CSS' },
  { path: 'index.html', name: 'Index HTML' }
];

console.log(`🔍 Testing Resources for Manifest: ${MANIFEST_ID}\n`);
console.log('='.repeat(70));

async function testResource(resource) {
  const url = `${baseUrl}/${resource.path}`;
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const status = response.status;
    
    if (status === 200) {
      const contentType = response.headers.get('content-type') || 'unknown';
      const contentLength = response.headers.get('content-length') || 'unknown';
      console.log(`✅ ${resource.name}`);
      console.log(`   Path: ${resource.path}`);
      console.log(`   URL: ${url}`);
      console.log(`   Content-Type: ${contentType}`);
      console.log(`   Size: ${contentLength} bytes\n`);
      return { success: true, resource, status };
    } else if (status === 404) {
      console.log(`❌ ${resource.name} - NOT FOUND (404)`);
      console.log(`   Path: ${resource.path}`);
      console.log(`   URL: ${url}\n`);
      return { success: false, resource, status: 404 };
    } else {
      console.log(`⚠️  ${resource.name} - Status ${status}`);
      console.log(`   Path: ${resource.path}`);
      console.log(`   URL: ${url}\n`);
      return { success: false, resource, status };
    }
  } catch (error) {
    console.log(`❌ ${resource.name} - ERROR`);
    console.log(`   Path: ${resource.path}`);
    console.log(`   Error: ${error.message}\n`);
    return { success: false, resource, error: error.message };
  }
}

async function main() {
  const results = [];
  
  for (const resource of resources) {
    const result = await testResource(resource);
    results.push(result);
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Summary
  console.log('='.repeat(70));
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Accessible: ${successful}/${resources.length}`);
  console.log(`   ❌ Not Found: ${failed}/${resources.length}`);
  
  if (failed > 0) {
    console.log(`\n❌ Missing Resources:`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.resource.path}`);
    });
    console.log(`\n💡 These files need to be added to the manifest in the next deployment.`);
  } else {
    console.log(`\n✅ All critical resources are accessible!`);
  }
  
  // Test some other paths to see what IS available
  console.log(`\n🔍 Testing Additional Paths:`);
  const testPaths = [
    'img/artists/JoshZ_B2B_Baiee.png',
    'img/artists/acidman.jpg',
    'img/covers/cover1.jpg'
  ];
  
  for (const testPath of testPaths) {
    const url = `${baseUrl}/${testPath}`;
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.status === 200) {
        console.log(`   ✅ ${testPath}`);
      } else {
        console.log(`   ❌ ${testPath} (${response.status})`);
      }
    } catch (error) {
      console.log(`   ❌ ${testPath} (error)`);
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

main().catch(console.error);
