import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';

/**
 * Image Loader Utility - Loads images from various sources
 */
export class ImageLoader {
    constructor() {
        this.cacheDir = path.join(process.cwd(), 'outputs', 'image-cache');
        fs.ensureDirSync(this.cacheDir);
    }

    /**
     * Load images from artist JSON data
     * Returns array of image file paths
     */
    async loadFromArtistJSON(artistData, mixData = null) {
        const images = [];

        try {
            // Load artist image if available
            if (artistData.artistImageFilename) {
                const artistImagePath = await this.resolveImagePath(artistData.artistImageFilename);
                if (artistImagePath && await fs.pathExists(artistImagePath)) {
                    images.push({
                        path: artistImagePath,
                        type: 'artist',
                        source: 'json'
                    });
                    console.log(`[ImageLoader] Loaded artist image: ${artistImagePath}`);
                } else {
                    console.warn(`[ImageLoader] Artist image not found: ${artistData.artistImageFilename}`);
                }
            }

            // Load mix image if available
            if (mixData && mixData.mixImageFilename) {
                const mixImagePath = await this.resolveImagePath(mixData.mixImageFilename);
                if (mixImagePath && await fs.pathExists(mixImagePath)) {
                    images.push({
                        path: mixImagePath,
                        type: 'mix',
                        source: 'json'
                    });
                    console.log(`[ImageLoader] Loaded mix image: ${mixImagePath}`);
                } else {
                    console.warn(`[ImageLoader] Mix image not found: ${mixData.mixImageFilename}`);
                }
            }
        } catch (error) {
            console.error('[ImageLoader] Error loading images from JSON:', error.message);
        }

        return images;
    }

    /**
     * Resolve image path from relative path in JSON
     * Tries multiple possible locations
     */
    async resolveImagePath(relativePath) {
        // Possible base directories
        const baseDirs = [
            path.join(process.cwd(), 'worker', 'data'),
            path.join(process.cwd(), 'data'),
            path.join(process.cwd(), 'public'),
            process.cwd()
        ];

        for (const baseDir of baseDirs) {
            const fullPath = path.join(baseDir, relativePath);
            if (await fs.pathExists(fullPath)) {
                return fullPath;
            }
        }

        // Return the first possible path even if it doesn't exist (caller will check)
        return path.join(baseDirs[0], relativePath);
    }

    /**
     * Load image from URL
     * Downloads and caches the image
     */
    async loadFromURL(url) {
        try {
            // Check cache first
            const cacheKey = this.getCacheKey(url);
            const cachedPath = path.join(this.cacheDir, cacheKey);
            
            if (await fs.pathExists(cachedPath)) {
                console.log(`[ImageLoader] Using cached image: ${cachedPath}`);
                return {
                    path: cachedPath,
                    type: 'url',
                    source: 'cache'
                };
            }

            // Download image
            console.log(`[ImageLoader] Downloading image from URL: ${url}`);
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000
            });

            // Determine file extension from content type or URL
            let ext = 'jpg';
            const contentType = response.headers['content-type'];
            if (contentType) {
                if (contentType.includes('png')) ext = 'png';
                else if (contentType.includes('webp')) ext = 'webp';
                else if (contentType.includes('gif')) ext = 'gif';
            } else {
                // Try to get extension from URL
                const urlExt = path.extname(new URL(url).pathname).substring(1);
                if (urlExt && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(urlExt.toLowerCase())) {
                    ext = urlExt.toLowerCase();
                }
            }

            const fileName = `${cacheKey}.${ext}`;
            const filePath = path.join(this.cacheDir, fileName);
            
            await fs.writeFile(filePath, Buffer.from(response.data));
            console.log(`[ImageLoader] ✅ Downloaded and cached image: ${filePath}`);

            return {
                path: filePath,
                type: 'url',
                source: 'download'
            };
        } catch (error) {
            console.error(`[ImageLoader] Error loading image from URL ${url}:`, error.message);
            return null;
        }
    }

    /**
     * Generate cache key from URL
     */
    getCacheKey(url) {
        // Create a safe filename from URL
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname.replace(/[^a-zA-Z0-9]/g, '_');
            const hash = Buffer.from(url).toString('base64').substring(0, 16).replace(/[^a-zA-Z0-9]/g, '');
            return `${hash}_${pathname}`;
        } catch (error) {
            // Fallback to simple hash
            return Buffer.from(url).toString('base64').substring(0, 32).replace(/[^a-zA-Z0-9]/g, '');
        }
    }

    /**
     * Load random image from folder
     */
    async loadRandomFromFolder(folderPath) {
        try {
            // Resolve folder path
            const resolvedPath = await this.resolveImagePath(folderPath);
            const actualPath = await fs.pathExists(resolvedPath) ? resolvedPath : folderPath;

            if (!await fs.pathExists(actualPath)) {
                console.warn(`[ImageLoader] Folder not found: ${actualPath}`);
                return null;
            }

            // Get all image files
            const files = await fs.readdir(actualPath);
            const imageFiles = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
            });

            if (imageFiles.length === 0) {
                console.warn(`[ImageLoader] No image files found in folder: ${actualPath}`);
                return null;
            }

            // Select random image
            const randomFile = imageFiles[Math.floor(Math.random() * imageFiles.length)];
            const imagePath = path.join(actualPath, randomFile);
            
            console.log(`[ImageLoader] Selected random image: ${imagePath}`);
            
            return {
                path: imagePath,
                type: 'random',
                source: 'folder'
            };
        } catch (error) {
            console.error(`[ImageLoader] Error loading random image from folder ${folderPath}:`, error.message);
            return null;
        }
    }

    /**
     * Download image from URL to specific output path
     */
    async downloadImage(url, outputPath) {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000
            });

            await fs.ensureDir(path.dirname(outputPath));
            await fs.writeFile(outputPath, Buffer.from(response.data));
            
            console.log(`[ImageLoader] ✅ Downloaded image to: ${outputPath}`);
            return outputPath;
        } catch (error) {
            console.error(`[ImageLoader] Error downloading image to ${outputPath}:`, error.message);
            throw error;
        }
    }

    /**
     * Check if file is a valid image
     */
    async isValidImage(filePath) {
        try {
            if (!await fs.pathExists(filePath)) {
                return false;
            }

            const ext = path.extname(filePath).toLowerCase();
            const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
            return validExtensions.includes(ext);
        } catch (error) {
            return false;
        }
    }
}




