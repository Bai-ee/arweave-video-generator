const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function (tag) {
    const charsToReplace = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return charsToReplace[tag] || tag;
  });
}

/**
 * Generate playlist items HTML for artist page
 */
function generatePlaylistItems(artist, mixes) {
  return mixes.map(mix => {
    // Use mixImageFilename as-is if it starts with 'http', else use absolute path from manifest root
    let imgSrc = mix.mixImageFilename && mix.mixImageFilename.startsWith('http') 
      ? mix.mixImageFilename 
      : (mix.mixImageFilename || artist.artistImageFilename || '');
    
    // Ensure path is absolute from root (img/covers/ or img/artists/)
    if (imgSrc && !imgSrc.startsWith('http')) {
      if (!imgSrc.startsWith('img/')) {
        // Assume it's a cover image
        imgSrc = `img/covers/${imgSrc}`;
      }
    }
    
    return `
    <li class="single-item">
      <a data-playlist data-title="${escapeHtml(mix.mixTitle)}" data-artist="${escapeHtml(artist.artistName)}" data-img="${imgSrc}" href="${mix.mixArweaveURL || '#'}" class="single-item__cover">
        <img src="${imgSrc}" alt="">
      </a>
      <div class="single-item__title">
        <h4><a href="#">${escapeHtml(mix.mixTitle)}</a></h4>
        <span><a href="#">${escapeHtml(artist.artistName)}</a> | ${escapeHtml(artist.artistGenre)} | ${escapeHtml(mix.mixDateYear || '')}</span>
      </div>
      <span class="single-item__time">${escapeHtml(mix.mixDuration || '0:00')}</span>
    </li>`;
  }).join('\n');
}

/**
 * Generate artist card HTML for index page
 */
function generateArtistCard(artist) {
  // Use absolute path from manifest root
  let imgSrc = artist.artistImageFilename && artist.artistImageFilename.startsWith('http')
    ? artist.artistImageFilename
    : (artist.artistImageFilename || '');
  
  // Ensure path is absolute from root
  if (imgSrc && !imgSrc.startsWith('http')) {
    if (!imgSrc.startsWith('img/')) {
      imgSrc = `img/artists/${imgSrc}`;
    }
  }
  
  // Normalize genre for data-genre attribute
  const genre = (artist.artistGenre || 'other').toLowerCase();
  
  return `
<div class="col-6 col-sm-4 col-lg-2">
<a href="${artist.artistFilename}">
<div class="album" data-genre="${genre}">
<div class="album__cover">
<img src="${imgSrc}" alt="">
</div>
<div class="album__title">
<h3>
${escapeHtml(artist.artistName)}
</h3>
</div>
</div>
</a>
</div>`;
}

/**
 * Generate featured track item HTML for index page
 */
function generateFeaturedTrack(artist) {
  if (!artist.mixes || artist.mixes.length === 0) {
    return '';
  }
  
  const firstMix = artist.mixes[0];
  let imgSrc = firstMix.mixImageFilename && firstMix.mixImageFilename.startsWith('http')
    ? firstMix.mixImageFilename
    : (firstMix.mixImageFilename || artist.artistImageFilename || '');
  
  // Ensure path is absolute from root
  if (imgSrc && !imgSrc.startsWith('http')) {
    if (!imgSrc.startsWith('img/')) {
      // Assume it's a cover image
      imgSrc = `img/covers/${imgSrc}`;
    }
  }
  
  return `
<li class="single-item">
  <a data-link data-title="${escapeHtml(firstMix.mixTitle)}" data-artist="${escapeHtml(artist.artistName)}" data-img="${imgSrc}" href="${firstMix.mixArweaveURL || '#'}" class="single-item__cover">
  <img style="max-width:300px; max-height:300px;" src="${imgSrc}" alt="${escapeHtml(firstMix.mixTitle)}">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M18.54,9,8.88,3.46a3.42,3.42,0,0,0-5.13,3V17.58A3.42,3.42,0,0,0,7.17,21a3.43,3.43,0,0,0,1.71-.46L18.54,15a3.42,3.42,0,0,0,0-5.92Zm-1,4.19L7.88,18.81a1.44,1.44,0,0,1-1.42,0,1.42,1.42,0,0,1-.71-1.23V6.42a1.42,1.42,0,0,1,.71-1.23A1.51,1.51,0,0,1,7.17,5a1.54,1.54,0,0,1,.71.19l9.66,5.58a1.42,1.42,0,0,1,0,2.46Z"/></svg>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M16,2a3,3,0,0,0-3,3V19a3,3,0,0,0,6,0V5A3,3,0,0,0,16,2Zm1,17a1,1,0,0,1-2,0V5a1,1,0,0,1,2,0ZM8,2A3,3,0,0,0,5,5V19a3,3,0,0,0,6,0V5A3,3,0,0,0,8,2ZM9,19a1,1,0,0,1-2,0V5A1,1,0,0,1,9,5Z"/></svg>
  </a>
  <div class="single-item__title">
  <h4>${escapeHtml(artist.artistName)}<a href="#"></a></h4>
  <span><a href="#">${escapeHtml(firstMix.mixTitle)}</a>
  </span>
  </div>
  <span class="single-item__time">${escapeHtml(firstMix.mixDuration || '0:00')}</span>
  </li>`;
}

/**
 * Replace all relative paths (../) with absolute paths from manifest root
 * This is required for Arweave manifest structure
 */
function fixPathsForArweave(html) {
  // Replace ../css/ with css/
  html = html.replace(/href="\.\.\/css\//g, 'href="css/');
  html = html.replace(/href='\.\.\/css\//g, "href='css/");
  // Replace ../js/ with js/
  html = html.replace(/src="\.\.\/js\//g, 'src="js/');
  html = html.replace(/src='\.\.\/js\//g, "src='js/");
  // Replace ../img/ with img/
  html = html.replace(/src="\.\.\/img\//g, 'src="img/');
  html = html.replace(/src='\.\.\/img\//g, "src='img/");
  // Replace ../icon/ with icon/
  html = html.replace(/href="\.\.\/icon\//g, 'href="icon/');
  html = html.replace(/href='\.\.\/icon\//g, "href='icon/");
  // Fix img/covers/ to use artist images - check if we should use img/artists/ instead
  // But first, let's fix the template to use the correct path for artist covers
  // Replace img/covers/[ARTIST_COVER] references - these should point to img/artists/ for artist images
  // Actually, the template uses img/covers/ for the placeholder, we'll keep that structure
  // but ensure the actual image path is correct
  // Replace any remaining ../ references
  html = html.replace(/\.\.\//g, '');
  return html;
}

/**
 * Generate all artist HTML pages
 */
function generateArtistPages(artistsJsonPath, templatePath, outputDir) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }
  if (!fs.existsSync(artistsJsonPath)) {
    throw new Error(`artists.json not found: ${artistsJsonPath}`);
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  const artists = JSON.parse(fs.readFileSync(artistsJsonPath, 'utf8'));

  artists.forEach(artist => {
    let html = template;
    // [ARTIST_NAME]
    html = html.replace(/\[ARTIST_NAME\]/g, escapeHtml(artist.artistName));
    // [ARTIST_COVER] - extract filename from path (template adds .jpg extension)
    let coverFilename = '';
    if (artist.artistImageFilename) {
      if (artist.artistImageFilename.startsWith('http')) {
        // Full URL - use as-is but template expects filename
        coverFilename = artist.artistImageFilename;
      } else {
        // Extract just the filename without extension
        // e.g., "img/artists/acidman.jpg" -> "acidman"
        const fullPath = artist.artistImageFilename;
        const filename = path.basename(fullPath);
        coverFilename = filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
      }
    }
    html = html.replace(/\[ARTIST_COVER\]/g, coverFilename);
    // [MIX_COUNT]
    html = html.replace(/\[MIX_COUNT\]/g, (artist.mixes || []).length.toString());
    // [PLAYLIST_ITEMS]
    html = html.replace(/<!-- \[PLAYLIST_ITEMS\] -->[\s\S]*<!-- end playlist -->/, generatePlaylistItems(artist, artist.mixes || []));
    // Social handles (optional, left blank)
    html = html.replace(/\[TWITTER_HANDLE\]/g, '');
    html = html.replace(/\[INSTAGRAM_HANDLE\]/g, '');
    
    // Fix all paths for Arweave (remove ../ references)
    html = fixPathsForArweave(html);
    
    // Fix artist cover image paths - template uses img/covers/ but images are in img/artists/
    // Replace img/covers/[filename].jpg with img/artists/[filename].jpg for artist images
    if (coverFilename && !coverFilename.startsWith('http')) {
      // Replace player cover and main cover images to use img/artists/ instead of img/covers/
      html = html.replace(/img\/covers\/([^"']*)/g, (match, filename) => {
        // Only replace if it matches our artist cover filename
        if (filename.includes(coverFilename) || filename === `${coverFilename}.jpg`) {
          return `img/artists/${filename}`;
        }
        return match; // Keep other covers as-is
      });
    }

    const outFile = path.join(outputDir, artist.artistFilename);
    fs.writeFileSync(outFile, html, 'utf8');
    console.log(`Generated: ${artist.artistFilename}`);
  });
  
  console.log('All artist pages generated.');
  return artists.length;
}

/**
 * Update index.html with artist grid and featured tracks
 */
function updateIndexHtml(indexHtmlPath, artistsJsonPath) {
  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error(`index.html not found: ${indexHtmlPath}`);
  }
  if (!fs.existsSync(artistsJsonPath)) {
    throw new Error(`artists.json not found: ${artistsJsonPath}`);
  }

  const artists = JSON.parse(fs.readFileSync(artistsJsonPath, 'utf8'));
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const $ = cheerio.load(indexHtml);

  // Update artist grid
  const artistGridContainer = $('.row.row--grid.fadeIn').first();
  if (artistGridContainer.length > 0) {
    // Clear existing artist cards
    artistGridContainer.find('.col-6.col-sm-4.col-lg-2').remove();
    
    // Add new artist cards
    artists.forEach(artist => {
      artistGridContainer.append(generateArtistCard(artist));
    });
    
    console.log(`Updated artist grid with ${artists.length} artists`);
  } else {
    console.warn('Artist grid container not found in index.html');
  }

  // Update featured track list
  const featuredList = $('ul.main__list').first();
  if (featuredList.length > 0) {
    // Clear existing featured tracks
    featuredList.find('li.single-item').remove();
    
    // Add new featured tracks (first mix of each artist)
    artists.forEach(artist => {
      if (artist.mixes && artist.mixes.length > 0) {
        featuredList.append(generateFeaturedTrack(artist));
      }
    });
    
    console.log(`Updated featured track list with ${artists.filter(a => a.mixes && a.mixes.length > 0).length} tracks`);
  } else {
    console.warn('Featured track list not found in index.html');
  }

  // Write updated HTML
  fs.writeFileSync(indexHtmlPath, $.html(), 'utf8');
  console.log('Updated index.html');
}

/**
 * Main function - can be called as module or CLI
 */
function generatePages(artistsJsonPath = null, outputDir = null) {
  // In Vercel, __dirname points to /var/task/lib, so we need to go up two levels to get to website
  const baseDir = path.join(__dirname, '..', 'website');
  const defaultArtistsJson = path.join(baseDir, 'artists.json');
  const defaultTemplate = path.join(baseDir, 'templates', 'artist.html');
  
  // Check if we're in Vercel production (read-only filesystem)
  const isVercelProduction = process.env.VERCEL === '1' || process.cwd() === '/var/task';
  let defaultOutputDir = baseDir;
  let defaultIndexHtml = path.join(baseDir, 'index.html');
  let actualTemplate = defaultTemplate;
  
  // If in Vercel production, write to /tmp/website instead
  if (isVercelProduction) {
    defaultOutputDir = '/tmp/website';
    defaultIndexHtml = '/tmp/website/index.html';
    // Ensure /tmp/website directory exists
    if (!fs.existsSync(defaultOutputDir)) {
      fs.mkdirSync(defaultOutputDir, { recursive: true });
    }
    
    // Copy template and index.html to /tmp if they don't exist there
    const tmpTemplate = '/tmp/website/templates/artist.html';
    const tmpIndexHtml = '/tmp/website/index.html';
    
    if (!fs.existsSync(tmpTemplate) && fs.existsSync(defaultTemplate)) {
      const tmpTemplatesDir = path.dirname(tmpTemplate);
      if (!fs.existsSync(tmpTemplatesDir)) {
        fs.mkdirSync(tmpTemplatesDir, { recursive: true });
      }
      fs.copyFileSync(defaultTemplate, tmpTemplate);
      console.log('[WebsitePageGenerator] Copied template to /tmp/website/templates/');
    }
    
    if (!fs.existsSync(tmpIndexHtml) && fs.existsSync(path.join(baseDir, 'index.html'))) {
      fs.copyFileSync(path.join(baseDir, 'index.html'), tmpIndexHtml);
      console.log('[WebsitePageGenerator] Copied index.html to /tmp/website/');
    }
    
    // Use template from /tmp if it exists
    if (fs.existsSync(tmpTemplate)) {
      actualTemplate = tmpTemplate;
    }
    
    console.log('[WebsitePageGenerator] Using /tmp/website for output (Vercel production mode)');
  }

  const artistsJson = artistsJsonPath || defaultArtistsJson;
  const template = actualTemplate;
  const output = outputDir || defaultOutputDir;
  const indexHtml = outputDir ? path.join(outputDir, 'index.html') : defaultIndexHtml;

  try {
    // Generate artist pages
    const artistCount = generateArtistPages(artistsJson, template, output);
    
    // Update index.html
    updateIndexHtml(indexHtml, artistsJson);
    
    return {
      success: true,
      artistPagesGenerated: artistCount,
      indexHtmlUpdated: true
    };
  } catch (error) {
    console.error('Error generating pages:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Export for use as module
module.exports = {
  generatePages,
  generateArtistPages,
  updateIndexHtml,
  generateArtistCard,
  generateFeaturedTrack,
  generatePlaylistItems,
  escapeHtml
};

// Run as CLI if called directly
if (require.main === module) {
  const result = generatePages();
  if (!result.success) {
    process.exit(1);
  }
}
