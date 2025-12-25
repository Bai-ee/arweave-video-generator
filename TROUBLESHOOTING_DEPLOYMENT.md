# Troubleshooting Website Deployment to Arweave

## Resources Not Loading (404 Errors)

If resources like images, fonts, or CSS files are showing 404 errors after deployment, follow these steps:

### Step 1: Inspect the Deployed Manifest

Use the inspection script to see what's actually in your manifest:

```bash
node scripts/inspect-manifest.js <manifest-transaction-id>
```

Replace `<manifest-transaction-id>` with your actual manifest ID (e.g., `ypRlddql...`).

This will show you:
- All paths in the manifest
- Whether critical resources are present
- Direct Arweave URLs for each resource
- Path mismatches between requested and actual paths

### Step 2: Check Deployment Logs

Look for these log messages in your deployment output:

```
[WebsiteDeployer] ✅ Critical file img/covers/ue_banner.jpg found in deployment list
[WebsiteDeployer] ✅ Banner image (img/covers/ue_banner.jpg) is in manifest
```

If you see warnings like:
```
[WebsiteDeployer] ❌ WARNING: Banner image (img/covers/ue_banner.jpg) is NOT in the manifest!
```

This means the file wasn't included in the deployment.

### Step 3: Verify Files Exist Locally

Check that files exist in the `website/` directory:

```bash
ls -la website/img/covers/ue_banner.jpg
ls -la website/img/loge_horiz.png
ls -la website/fonts/IBM_Plex_Mono,Rationale,Shantell_Sans/Rationale/Rationale-Regular.ttf
```

### Step 4: Check File Paths in HTML/CSS

Verify that the paths in your HTML/CSS match the paths in the manifest:

**HTML should use:**
```html
<img src="img/covers/ue_banner.jpg" alt="Banner">
<img src="img/loge_horiz.png" alt="Logo">
```

**CSS should use relative paths:**
```css
@font-face {
  font-family: 'Rationale-Regular';
  src: url('../fonts/IBM_Plex_Mono,Rationale,Shantell_Sans/Rationale/Rationale-Regular.ttf');
}
```

**NOT absolute paths:**
```css
/* ❌ WRONG - won't work on Arweave */
src: url('/fonts/Rationale-Regular.ttf');
```

### Step 5: Test Direct URLs

Test if files are accessible directly (bypassing the manifest):

```
https://arweave.net/<transaction-id>
```

You can get transaction IDs from the manifest inspection script.

### Step 6: Check Ignore Patterns

Files might be excluded by ignore patterns in `lib/WebsiteDeployer.js`:

```javascript
const ignorePatterns = [
  /archive/,
  /active/,
  /data\//,
  /scripts\//,
  // ...
];
```

If your files are in ignored directories, they won't be deployed.

### Step 7: Force Re-upload

If files are marked as "unchanged" but missing, you may need to force a re-upload:

1. Delete the manifest entry from Firebase (if using incremental uploads)
2. Or modify the file slightly to trigger a change detection
3. Redeploy

## Common Issues

### Issue: Files exist locally but not in manifest

**Cause:** Files might be in ignored directories or have wrong extensions.

**Solution:**
- Check ignore patterns in `collectWebsiteFiles()`
- Verify file extensions are in the allowed list: `.html`, `.css`, `.js`, `.jpg`, `.png`, `.ttf`, etc.

### Issue: Path mismatch (file exists but wrong path)

**Cause:** Paths in HTML don't match paths in manifest.

**Solution:**
- Use relative paths in HTML/CSS
- Ensure paths use forward slashes (`/`) not backslashes (`\`)
- Check that paths are normalized in the manifest

### Issue: Font files not loading

**Cause:** CSS using absolute paths or wrong font path.

**Solution:**
- Change `/fonts/...` to `../fonts/...` in CSS
- Verify font file exists at the specified path
- Check font file extension is `.ttf`, `.woff`, etc. (allowed extensions)

### Issue: Images loading but fonts not

**Cause:** Font files might be in a subdirectory that's not being collected.

**Solution:**
- Check if font files are in `fonts/IBM_Plex_Mono,Rationale,Shantell_Sans/Rationale/`
- Verify the path in CSS matches the actual file location
- Check deployment logs to see if font files were uploaded

## Getting Help

If resources still don't load after following these steps:

1. Run the manifest inspection script and share the output
2. Check deployment logs for warnings/errors
3. Verify the manifest ID is correct
4. Test direct transaction URLs to see if files are accessible

## Quick Checklist

- [ ] Files exist in `website/` directory
- [ ] Files have allowed extensions (`.jpg`, `.png`, `.ttf`, etc.)
- [ ] Files are not in ignored directories (`archive/`, `active/`, etc.)
- [ ] HTML/CSS use relative paths (not absolute `/...`)
- [ ] Manifest contains the file paths
- [ ] Deployment logs show files were uploaded
- [ ] Direct transaction URLs work (if manifest doesn't)








