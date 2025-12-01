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
     * Load videos from both skyline and chicago-skyline-videos folders
     * Returns list of video paths from both sources
     */
    async loadAllSkylineVideos() {
        try {
            const storage = getStorage();
            const bucket = storage.bucket();
            const videos = [];

            // Load from skyline folder (user uploads)
            console.log(`[VideoLoader] 📥 Loading videos from skyline folder...`);
            const [skylineFiles] = await bucket.getFiles({ prefix: 'skyline/' });
            const skylineVideos = skylineFiles.filter(file => 
                file.name.endsWith('.mp4') && !file.name.endsWith('.keep')
            );
            console.log(`[VideoLoader] Found ${skylineVideos.length} videos in skyline folder`);

            // Load from chicago-skyline-videos folder
            console.log(`[VideoLoader] 📥 Loading videos from chicago-skyline-videos folder...`);
            const [chicagoFiles] = await bucket.getFiles({ prefix: 'assets/chicago-skyline-videos/' });
            const chicagoVideos = chicagoFiles.filter(file => 
                file.name.endsWith('.mp4')
            );
            console.log(`[VideoLoader] Found ${chicagoVideos.length} videos in chicago-skyline-videos folder`);

            // Combine both lists
            const allVideos = [...skylineVideos, ...chicagoVideos];

            if (allVideos.length === 0) {
                console.warn(`[VideoLoader] ⚠️ No skyline videos found in Firebase Storage`);
                return [];
            }

            // Download and cache all videos
            for (const file of allVideos) {
                const fileName = path.basename(file.name);
                const cacheKey = `skyline_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                const cachedPath = path.join(this.cacheDir, cacheKey);

                // Check cache first
                if (await fs.pathExists(cachedPath)) {
                    videos.push(cachedPath);
                    continue;
                }

                // Download from Firebase
                try {
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
                    const response = await axios.get(publicUrl, {
                        responseType: 'arraybuffer',
                        timeout: 60000,
                        maxContentLength: 100 * 1024 * 1024
                    });

                    await fs.writeFile(cachedPath, Buffer.from(response.data));
                    videos.push(cachedPath);
                    console.log(`[VideoLoader] ✅ Cached: ${fileName}`);
                } catch (error) {
                    console.warn(`[VideoLoader] ⚠️ Failed to download ${fileName}:`, error.message);
                }
            }

            console.log(`[VideoLoader] ✅ Loaded ${videos.length} total skyline videos`);
            return videos;

        } catch (error) {
            console.error(`[VideoLoader] ❌ Error loading skyline videos:`, error.message);
            return [];
        }
    }

    /**
     * Load a random Chicago skyline video from Firebase Storage (legacy method)
     * Downloads and caches the video locally for FFmpeg to use
     */
    async loadRandomChicagoSkylineVideo() {
        const videos = await this.loadAllSkylineVideos();
        if (videos.length === 0) {
            return null;
        }
        return videos[Math.floor(Math.random() * videos.length)];
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


