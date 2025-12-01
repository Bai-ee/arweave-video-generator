/**
 * Video Loader Utility - Loads videos from Firebase Storage or local paths
 * Similar to ImageLoader but for video files
 */

import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { getStorage } from '../firebase-admin.js';

export class VideoLoader {
    constructor() {
        this.cacheDir = path.join(process.cwd(), 'outputs', 'video-cache');
        fs.ensureDirSync(this.cacheDir);
    }

    /**
     * Load a random Chicago skyline video from Firebase Storage
     * Downloads and caches the video locally for FFmpeg to use
     */
    async loadRandomChicagoSkylineVideo() {
        try {
            // Get list of available videos from Firebase Storage
            const storage = getStorage();
            const bucket = storage.bucket();
            const storagePath = 'assets/chicago-skyline-videos';

            console.log(`[VideoLoader] 📥 Loading random Chicago skyline video from Firebase Storage...`);

            // List all files in the storage path
            const [files] = await bucket.getFiles({ prefix: storagePath });
            const videoFiles = files.filter(file => file.name.endsWith('.mp4'));

            if (videoFiles.length === 0) {
                console.warn(`[VideoLoader] ⚠️ No Chicago skyline videos found in Firebase Storage`);
                return null;
            }

            // Select a random video
            const randomFile = videoFiles[Math.floor(Math.random() * videoFiles.length)];
            const fileName = path.basename(randomFile.name);
            const cacheKey = `chicago_skyline_${fileName}`;
            const cachedPath = path.join(this.cacheDir, cacheKey);

            // Check if already cached
            if (await fs.pathExists(cachedPath)) {
                console.log(`[VideoLoader] ✅ Using cached video: ${fileName}`);
                return cachedPath;
            }

            // Download from Firebase Storage
            console.log(`[VideoLoader] 📥 Downloading video: ${fileName}`);
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${randomFile.name}`;
            
            const response = await axios.get(publicUrl, {
                responseType: 'arraybuffer',
                timeout: 60000, // 60 second timeout for video downloads
                maxContentLength: 100 * 1024 * 1024 // 100MB max
            });

            // Save to cache
            await fs.writeFile(cachedPath, Buffer.from(response.data));
            const stats = await fs.stat(cachedPath);
            console.log(`[VideoLoader] ✅ Downloaded and cached: ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

            return cachedPath;

        } catch (error) {
            console.error(`[VideoLoader] ❌ Error loading Chicago skyline video:`, error.message);
            return null;
        }
    }

    /**
     * Load a specific video from Firebase Storage by filename
     */
    async loadVideoFromFirebase(storagePath) {
        try {
            const storage = getStorage();
            const bucket = storage.bucket();
            const fileName = path.basename(storagePath);
            const cacheKey = `firebase_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const cachedPath = path.join(this.cacheDir, cacheKey);

            // Check cache first
            if (await fs.pathExists(cachedPath)) {
                console.log(`[VideoLoader] ✅ Using cached video: ${fileName}`);
                return cachedPath;
            }

            // Download from Firebase
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
            console.log(`[VideoLoader] 📥 Downloading video from Firebase: ${fileName}`);

            const response = await axios.get(publicUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
                maxContentLength: 100 * 1024 * 1024
            });

            await fs.writeFile(cachedPath, Buffer.from(response.data));
            console.log(`[VideoLoader] ✅ Downloaded and cached: ${fileName}`);

            return cachedPath;

        } catch (error) {
            console.error(`[VideoLoader] ❌ Error loading video from Firebase:`, error.message);
            return null;
        }
    }

    /**
     * Load video from local file path
     */
    async loadVideoFromPath(filePath) {
        try {
            // Resolve relative paths
            const resolvedPath = await this.resolveVideoPath(filePath);
            
            if (await fs.pathExists(resolvedPath)) {
                console.log(`[VideoLoader] ✅ Found local video: ${path.basename(resolvedPath)}`);
                return resolvedPath;
            }

            console.warn(`[VideoLoader] ⚠️ Video not found: ${filePath}`);
            return null;

        } catch (error) {
            console.error(`[VideoLoader] ❌ Error loading video from path:`, error.message);
            return null;
        }
    }

    /**
     * Resolve video path from relative path
     */
    async resolveVideoPath(relativePath) {
        const baseDirs = [
            path.join(process.cwd(), 'assets', 'chicago-skyline-videos'),
            path.join(process.cwd(), 'worker', 'assets', 'chicago-skyline-videos'),
            path.join(process.cwd(), 'assets'),
            path.join(process.cwd(), 'worker', 'assets'),
            process.cwd()
        ];

        for (const baseDir of baseDirs) {
            const fullPath = path.join(baseDir, relativePath);
            if (await fs.pathExists(fullPath)) {
                return fullPath;
            }
        }

        // Return the first possible path even if it doesn't exist
        return path.join(baseDirs[0], relativePath);
    }

    /**
     * Get all available Chicago skyline video URLs from Firebase
     */
    async getChicagoSkylineVideoUrls() {
        try {
            const storage = getStorage();
            const bucket = storage.bucket();
            const storagePath = 'assets/chicago-skyline-videos';

            const [files] = await bucket.getFiles({ prefix: storagePath });
            const videoFiles = files.filter(file => file.name.endsWith('.mp4'));

            return videoFiles.map(file => ({
                fileName: path.basename(file.name),
                storagePath: file.name,
                publicUrl: `https://storage.googleapis.com/${bucket.name}/${file.name}`
            }));

        } catch (error) {
            console.error(`[VideoLoader] ❌ Error getting video URLs:`, error.message);
            return [];
        }
    }

    /**
     * Clear video cache
     */
    async clearCache() {
        try {
            await fs.emptyDir(this.cacheDir);
            console.log(`[VideoLoader] 🧹 Cache cleared`);
        } catch (error) {
            console.error(`[VideoLoader] ❌ Error clearing cache:`, error.message);
        }
    }
}


