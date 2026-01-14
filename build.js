const fs = require('fs-extra');
const path = require('path');

const SRC_DIR = 'src';
const DIST_DIR = 'dist';
const CHROME_DIR = path.join(DIST_DIR, 'chrome');
const FIREFOX_DIR = path.join(DIST_DIR, 'firefox');

async function build() {
  console.log('🧹 Cleaning dist directory...');
  await fs.remove(DIST_DIR);

  console.log('📦 Building Chrome extension...');
  await fs.copy(SRC_DIR, CHROME_DIR);
  console.log('✅ Chrome build complete at:', CHROME_DIR);

  console.log('📦 Building Firefox extension...');
  await fs.copy(SRC_DIR, FIREFOX_DIR);

  // Read Firefox-specific manifest
  const firefoxManifest = await fs.readJson('manifest-firefox.json');
  await fs.writeJson(
    path.join(FIREFOX_DIR, 'manifest.json'),
    firefoxManifest,
    { spaces: 2 }
  );
  console.log('✅ Firefox build complete at:', FIREFOX_DIR);

  console.log('\n🎉 Build complete! Extension packages ready in dist/');
  console.log('   Chrome:  ', CHROME_DIR);
  console.log('   Firefox: ', FIREFOX_DIR);
  console.log('\n📝 Next steps:');
  console.log('   1. Test Chrome:  Load unpacked from dist/chrome/');
  console.log('   2. Test Firefox: Load temporary add-on from dist/firefox/');
}

build().catch(error => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});
