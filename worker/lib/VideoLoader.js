/**
 * Video Loader Utility - Loads videos from Firebase Storage or local paths
 * Similar to ImageLoader but for video files
 */

import fs from 'fs-extra';
import path from 'path';
import { getStorage } from '../firebase-admin.js';

export class VideoLoader {
    constructor() {
        this.cacheDir = path.join(process.cwd(), 'outputs', 'video-cache');
        fs.ensureDirSync(this.cacheDir);
    }

    /**
     * Load videos from multiple folders for tracks (equipment, decks, skyline, chicago-skyline, neighborhood)
     * Returns grouped structure: { equipment: [...], decks: [...], skyline: [...], chicago: [...], neighborhood: [...] }
     */
    async loadTrackVideos(returnGrouped = true) {
        try {
            const storage = getStorage();
            const bucket = storage.bucket();
            const equipmentVideos = [];
            const decksVideos = [];
            const skylineVideos = [];
            const chicagoVideos = [];
            const neighborhoodVideos = [];

            // Support multiple video formats
            const videoExtensions = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'];

            // Load from equipment folder
            console.log(`[VideoLoader] 📥 Loading videos from equipment folder...`);
            const [equipmentFiles] = await bucket.getFiles({ prefix: 'equipment/' });
            const equipmentFileList = equipmentFiles.filter(file => {
                const fileName = file.name.toLowerCase();
                const isVideo = videoExtensions.some(ext => fileName.endsWith(ext));
                const isNotKeep = !fileName.endsWith('.keep');
                return isVideo && isNotKeep;
            });
            console.log(`[VideoLoader] Found ${equipmentFileList.length} videos in equipment folder`);

            // Load from decks folder
            console.log(`[VideoLoader] 📥 Loading videos from decks folder...`);
            const [decksFiles] = await bucket.getFiles({ prefix: 'decks/' });
            const decksFileList = decksFiles.filter(file => {
                const fileName = file.name.toLowerCase();
                const isVideo = videoExtensions.some(ext => fileName.endsWith(ext));
                const isNotKeep = !fileName.endsWith('.keep');
                return isVideo && isNotKeep;
            });
            console.log(`[VideoLoader] Found ${decksFileList.length} videos in decks folder`);

            // Load from skyline folder
            console.log(`[VideoLoader] 📥 Loading videos from skyline folder...`);
            const [skylineFiles] = await bucket.getFiles({ prefix: 'skyline/' });
            const skylineFileList = skylineFiles.filter(file => {
                const fileName = file.name.toLowerCase();
                const isVideo = videoExtensions.some(ext => fileName.endsWith(ext));
                const isNotKeep = !fileName.endsWith('.keep');
                return isVideo && isNotKeep;
            });
            console.log(`[VideoLoader] Found ${skylineFileList.length} videos in skyline folder`);

            // Load from chicago-skyline-videos folder
            console.log(`[VideoLoader] 📥 Loading videos from chicago-skyline-videos folder...`);
            const [chicagoFiles] = await bucket.getFiles({ prefix: 'assets/chicago-skyline-videos/' });
            const chicagoFileList = chicagoFiles.filter(file => {
                const fileName = file.name.toLowerCase();
                return videoExtensions.some(ext => fileName.endsWith(ext));
            });
            console.log(`[VideoLoader] Found ${chicagoFileList.length} videos in chicago-skyline-videos folder`);

            // Load from neighborhood folder
            console.log(`[VideoLoader] 📥 Loading videos from neighborhood folder...`);
            const [neighborhoodFiles] = await bucket.getFiles({ prefix: 'neighborhood/' });
            const neighborhoodFileList = neighborhoodFiles.filter(file => {
                const fileName = file.name.toLowerCase();
                const isVideo = videoExtensions.some(ext => fileName.endsWith(ext));
                const isNotKeep = !fileName.endsWith('.keep');
                return isVideo && isNotKeep;
            });
            console.log(`[VideoLoader] Found ${neighborhoodFileList.length} videos in neighborhood folder`);

            // Download and cache all videos from each folder
            const folders = [
                { name: 'equipment', files: equipmentFileList, videos: equipmentVideos },
                { name: 'decks', files: decksFileList, videos: decksVideos },
                { name: 'skyline', files: skylineFileList, videos: skylineVideos },
                { name: 'chicago', files: chicagoFileList, videos: chicagoVideos },
                { name: 'neighborhood', files: neighborhoodFileList, videos: neighborhoodVideos }
            ];

            for (const folder of folders) {
                for (const file of folder.files) {
                    const fileName = path.basename(file.name);
                    const cacheKey = `${folder.name}_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    const cachedPath = path.join(this.cacheDir, cacheKey);

                    // Check cache first
                    if (await fs.pathExists(cachedPath)) {
                        folder.videos.push(cachedPath);
                        continue;
                    }

                    // Download from Firebase using Admin SDK
                    try {
                        const fileRef = bucket.file(file.name);
                        console.log(`[VideoLoader] 📥 Downloading ${folder.name} video: ${fileName}`);
                        
                        await fileRef.download({ destination: cachedPath });
                        
                        folder.videos.push(cachedPath);
                        console.log(`[VideoLoader] ✅ Cached ${folder.name}: ${fileName}`);
                    } catch (error) {
                        console.warn(`[VideoLoader] ⚠️ Failed to download ${fileName}:`, error.message);
                    }
                }
            }

            const totalVideos = equipmentVideos.length + decksVideos.length + skylineVideos.length + chicagoVideos.length + neighborhoodVideos.length;
            console.log(`[VideoLoader] ✅ Loaded ${equipmentVideos.length} equipment + ${decksVideos.length} decks + ${skylineVideos.length} skyline + ${chicagoVideos.length} chicago + ${neighborhoodVideos.length} neighborhood = ${totalVideos} total videos`);

            if (totalVideos === 0) {
                console.warn(`[VideoLoader] ⚠️ No track videos found in Firebase Storage`);
                return returnGrouped ? { equipment: [], decks: [], skyline: [], chicago: [], neighborhood: [] } : [];
            }

            // Return grouped structure or flat array for backward compatibility
            if (returnGrouped) {
                return {
                    equipment: equipmentVideos,
                    decks: decksVideos,
                    skyline: skylineVideos,
                    chicago: chicagoVideos,
                    neighborhood: neighborhoodVideos
                };
            } else {
                // Backward compatibility: return flat array
                return [...equipmentVideos, ...decksVideos, ...skylineVideos, ...chicagoVideos, ...neighborhoodVideos];
            }

        } catch (error) {
            console.error(`[VideoLoader] ❌ Error loading track videos:`, error.message);
            return returnGrouped ? { equipment: [], decks: [], skyline: [], chicago: [], neighborhood: [] } : [];
        }
    }

    /**
     * Load video file references (metadata only, no download)
     * Returns grouped structure with file references that can be downloaded on-demand
     * @param {boolean} returnGrouped - Whether to return grouped structure or flat array
     * @param {string[]} selectedFolders - Optional array of folder names to filter by (empty = all folders)
     */
    async loadTrackVideoReferences(returnGrouped = true, selectedFolders = []) {
        try {
            const storage = getStorage();
            const bucket = storage.bucket();
            
            // Support multiple video formats
            const videoExtensions = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'];
            
            // Define all possible folders (matching API availableFolders)
            const allFolders = ['equipment', 'decks', 'skyline', 'neighborhood', 'artist', 'family', 'assets/chicago-skyline-videos'];
            
            // Helper function to check if a folder should be included
            const shouldIncludeFolder = (folderName) => {
                if (selectedFolders.length === 0) return true; // No filter = include all
                // Check if folder name matches any selected folder (handle both 'skyline' and 'assets/chicago-skyline-videos')
                return selectedFolders.some(selected => {
                    const normalizedSelected = selected.replace('assets/', '');
                    const normalizedFolder = folderName.replace('assets/', '');
                    return normalizedSelected === normalizedFolder || 
                           selected.includes(folderName) || 
                           folderName.includes(selected);
                });
            };
            
            // Initialize grouped structure for all folders
            const groupedFiles = {
                equipment: [],
                decks: [],
                skyline: [],
                chicago: [],
                neighborhood: [],
                artist: [],
                family: []
            };
            
            // Process each folder dynamically
            for (const folderName of allFolders) {
                if (!shouldIncludeFolder(folderName)) continue;
                
                // Determine the actual prefix path
                const prefix = folderName.startsWith('assets/') ? folderName + '/' : folderName + '/';
                const displayName = folderName.replace('assets/', '');
                
                console.log(`[VideoLoader] 📋 Getting video file references from ${displayName} folder...`);
                const [fileList] = await bucket.getFiles({ prefix: prefix });
                const filtered = fileList.filter(file => {
                    const fileName = file.name.toLowerCase();
                    return videoExtensions.some(ext => fileName.endsWith(ext)) && !fileName.endsWith('.keep');
                });
                
                // Map to appropriate group
                if (folderName === 'equipment') groupedFiles.equipment = filtered;
                else if (folderName === 'decks') groupedFiles.decks = filtered;
                else if (folderName === 'skyline') groupedFiles.skyline = filtered;
                else if (folderName === 'assets/chicago-skyline-videos' || folderName === 'chicago-skyline-videos') groupedFiles.chicago = filtered;
                else if (folderName === 'neighborhood') groupedFiles.neighborhood = filtered;
                else if (folderName === 'artist') groupedFiles.artist = filtered;
                else if (folderName === 'family') groupedFiles.family = filtered;
                
                console.log(`[VideoLoader] Found ${filtered.length} videos in ${displayName} folder`);
            }
            
            const total = Object.values(groupedFiles).reduce((sum, arr) => sum + arr.length, 0);
            console.log(`[VideoLoader] ✅ Found ${groupedFiles.equipment.length} equipment + ${groupedFiles.decks.length} decks + ${groupedFiles.skyline.length} skyline + ${groupedFiles.chicago.length} chicago + ${groupedFiles.neighborhood.length} neighborhood + ${groupedFiles.artist.length} artist + ${groupedFiles.family.length} family = ${total} total video references`);

            if (total === 0) {
                console.warn(`[VideoLoader] ⚠️ No videos found in selected folders`);
                return returnGrouped ? groupedFiles : [];
            }

            // Return grouped structure with file references (not downloaded paths)
            if (returnGrouped) {
                return groupedFiles;
            } else {
                return Object.values(groupedFiles).flat();
            }

        } catch (error) {
            console.error(`[VideoLoader] ❌ Error loading video references:`, error.message);
            return returnGrouped ? { equipment: [], decks: [], skyline: [], chicago: [], neighborhood: [], artist: [], family: [] } : [];
        }
    }

    /**
     * Download a single video file from Firebase Storage
     * @param {File} fileRef - Firebase Storage file reference
     * @param {string} folderName - Folder name for cache key
     * @returns {Promise<string>} Path to cached video file
     */
    async downloadVideoFile(fileRef, folderName) {
        try {
            const fileName = path.basename(fileRef.name);
            const cacheKey = `${folderName}_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const cachedPath = path.join(this.cacheDir, cacheKey);

            // Check cache first
            if (await fs.pathExists(cachedPath)) {
                return cachedPath;
            }

            // Download from Firebase using Admin SDK
            console.log(`[VideoLoader] 📥 Downloading ${folderName} video: ${fileName}`);
            await fileRef.download({ destination: cachedPath });
            console.log(`[VideoLoader] ✅ Cached ${folderName}: ${fileName}`);
            
            return cachedPath;
        } catch (error) {
            console.error(`[VideoLoader] ❌ Failed to download ${fileRef.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Load videos from both skyline and chicago-skyline-videos folders
     * Returns grouped structure: { skyline: [...], chicago: [...] }
     * Also maintains backward compatibility by returning flat array if needed
     */
    async loadAllSkylineVideos(returnGrouped = true) {
        try {
            const storage = getStorage();
            const bucket = storage.bucket();
            const skylineVideos = [];
            const chicagoVideos = [];

            // Support multiple video formats: .mp4, .mov, .m4v, .avi, .mkv, .webm
            const videoExtensions = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'];
            
            // Helper function to check if a folder should be included
            const shouldIncludeFolder = (folderName) => {
                if (selectedFolders.length === 0) return true; // No filter = include all
                return selectedFolders.some(selected => {
                    const normalizedSelected = selected.replace('assets/', '');
                    const normalizedFolder = folderName.replace('assets/', '');
                    return normalizedSelected === normalizedFolder || 
                           selected.includes(folderName) || 
                           folderName.includes(selected);
                });
            };
            
            // Initialize file lists
            let skylineFileList = [];
            let chicagoFileList = [];

            // Load from skyline folder (user uploads) - if selected
            if (shouldIncludeFolder('skyline')) {
                console.log(`[VideoLoader] 📥 Loading videos from skyline folder...`);
                const [skylineFiles] = await bucket.getFiles({ prefix: 'skyline/' });
                const skylineFileList = skylineFiles.filter(file => {
                    const fileName = file.name.toLowerCase();
                    const isVideo = videoExtensions.some(ext => fileName.endsWith(ext));
                    const isNotKeep = !fileName.endsWith('.keep');
                    return isVideo && isNotKeep;
                });
                console.log(`[VideoLoader] Found ${skylineFileList.length} videos in skyline folder`);
                
                // Download and cache skyline videos
                for (const file of skylineFileList) {
                    const fileName = path.basename(file.name);
                    const cacheKey = `skyline_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    const cachedPath = path.join(this.cacheDir, cacheKey);

                    // Check cache first
                    if (await fs.pathExists(cachedPath)) {
                        skylineVideos.push(cachedPath);
                        continue;
                    }

                    // Download from Firebase using Admin SDK (works with private files)
                    try {
                        const fileRef = bucket.file(file.name);
                        console.log(`[VideoLoader] 📥 Downloading skyline video: ${fileName}`);
                        
                        // Use Admin SDK download method (works with private files)
                        await fileRef.download({ destination: cachedPath });
                        
                        skylineVideos.push(cachedPath);
                        console.log(`[VideoLoader] ✅ Cached skyline: ${fileName}`);
                    } catch (error) {
                        console.warn(`[VideoLoader] ⚠️ Failed to download ${fileName}:`, error.message);
                    }
                }
            }

            // Load from chicago-skyline-videos folder - if selected
            if (shouldIncludeFolder('chicago-skyline-videos') || shouldIncludeFolder('assets/chicago-skyline-videos')) {
                console.log(`[VideoLoader] 📥 Loading videos from chicago-skyline-videos folder...`);
                const [chicagoFiles] = await bucket.getFiles({ prefix: 'assets/chicago-skyline-videos/' });
                const chicagoFileList = chicagoFiles.filter(file => {
                    const fileName = file.name.toLowerCase();
                    return videoExtensions.some(ext => fileName.endsWith(ext));
                });
                console.log(`[VideoLoader] Found ${chicagoFileList.length} videos in chicago-skyline-videos folder`);
                
                // Download and cache chicago videos
                for (const file of chicagoFileList) {
                    const fileName = path.basename(file.name);
                    const cacheKey = `chicago_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    const cachedPath = path.join(this.cacheDir, cacheKey);

                    // Check cache first
                    if (await fs.pathExists(cachedPath)) {
                        chicagoVideos.push(cachedPath);
                        continue;
                    }

                    // Download from Firebase using Admin SDK (works with private files)
                    try {
                        const fileRef = bucket.file(file.name);
                        console.log(`[VideoLoader] 📥 Downloading chicago video: ${fileName}`);
                        
                        // Use Admin SDK download method (works with private files)
                        await fileRef.download({ destination: cachedPath });
                        
                        chicagoVideos.push(cachedPath);
                        console.log(`[VideoLoader] ✅ Cached chicago: ${fileName}`);
                    } catch (error) {
                        console.warn(`[VideoLoader] ⚠️ Failed to download ${fileName}:`, error.message);
                    }
                }
            }


            const totalVideos = skylineVideos.length + chicagoVideos.length;
            console.log(`[VideoLoader] ✅ Loaded ${skylineVideos.length} skyline + ${chicagoVideos.length} chicago = ${totalVideos} total videos`);

            if (totalVideos === 0) {
                console.warn(`[VideoLoader] ⚠️ No skyline videos found in Firebase Storage`);
                return returnGrouped ? { skyline: [], chicago: [] } : [];
            }

            // Return grouped structure or flat array for backward compatibility
            if (returnGrouped) {
                return {
                    skyline: skylineVideos,
                    chicago: chicagoVideos
                };
            } else {
                // Backward compatibility: return flat array
                return [...skylineVideos, ...chicagoVideos];
            }

        } catch (error) {
            console.error(`[VideoLoader] ❌ Error loading skyline videos:`, error.message);
            return returnGrouped ? { skyline: [], chicago: [] } : [];
        }
    }

    /**
     * Load a random Chicago skyline video from Firebase Storage (legacy method)
     * Downloads and caches the video locally for FFmpeg to use
     */
    async loadRandomChicagoSkylineVideo() {
        // Use flat array for backward compatibility
        const videos = await this.loadAllSkylineVideos(false);
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

            // Download from Firebase using Admin SDK (works with private files)
            const fileRef = bucket.file(storagePath);
            console.log(`[VideoLoader] 📥 Downloading video from Firebase: ${fileName}`);

            // Use Admin SDK download method (works with private files)
            await fileRef.download({ destination: cachedPath });
            
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


