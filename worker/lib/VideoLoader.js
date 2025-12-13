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
            
            // Log what folders are being requested
            console.log(`[VideoLoader] 🔍 Loading video references with selectedFolders: [${selectedFolders.join(', ')}]`);
            
            // Support multiple video formats
            const videoExtensions = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'];
            
            // Define folder mapping: normalized name -> Firebase Storage path
            // Frontend sends normalized names (without assets/ prefix), backend maps to correct paths
            const folderMap = {
                'equipment': 'equipment',
                'decks': 'decks',
                'skyline': 'skyline',
                'neighborhood': 'neighborhood',
                'artist': 'artist',
                'family': 'family',
                'chicago-skyline-videos': 'assets/chicago-skyline-videos' // Special case: nested under assets/
            };
            
            // Normalize folder names for comparison (case-insensitive, trim whitespace, remove assets/ prefix)
            const normalize = (name) => {
                if (!name) return '';
                return name.toString().toLowerCase().trim().replace(/^assets\//, '');
            };
            
            // Normalize selected folders from frontend (they come without assets/ prefix)
            const normalizedSelectedFolders = selectedFolders.map(normalize);
            
            // Helper function to check if a folder should be included
            const shouldIncludeFolder = (normalizedFolderName) => {
                if (normalizedSelectedFolders.length === 0) return true; // No filter = include all
                
                // Simple exact match after normalization
                const matches = normalizedSelectedFolders.includes(normalizedFolderName);
                
                if (matches) {
                    console.log(`[VideoLoader] ✅ Folder "${normalizedFolderName}" matches selected folders: [${normalizedSelectedFolders.join(', ')}]`);
                } else {
                    console.log(`[VideoLoader] ⏭️  Folder "${normalizedFolderName}" does NOT match selected folders: [${normalizedSelectedFolders.join(', ')}]`);
                }
                
                return matches;
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
            
            // Process each folder from the map
            for (const [normalizedName, firebasePath] of Object.entries(folderMap)) {
                if (!shouldIncludeFolder(normalizedName)) {
                    console.log(`[VideoLoader] ⏭️  Skipping ${normalizedName} (not selected)`);
                    continue;
                }
                
                // Get the Firebase Storage prefix path
                const prefix = firebasePath + '/';
                
                console.log(`[VideoLoader] 📋 Getting video file references from ${normalizedName} folder (Firebase path: ${firebasePath})...`);
                const [fileList] = await bucket.getFiles({ prefix: prefix });
                const filtered = fileList.filter(file => {
                    const fileName = file.name.toLowerCase();
                    return videoExtensions.some(ext => fileName.endsWith(ext)) && !fileName.endsWith('.keep');
                });
                
                // Map to appropriate group based on normalized name
                if (normalizedName === 'equipment') groupedFiles.equipment = filtered;
                else if (normalizedName === 'decks') groupedFiles.decks = filtered;
                else if (normalizedName === 'skyline') groupedFiles.skyline = filtered;
                else if (normalizedName === 'chicago-skyline-videos') groupedFiles.chicago = filtered;
                else if (normalizedName === 'neighborhood') groupedFiles.neighborhood = filtered;
                else if (normalizedName === 'artist') groupedFiles.artist = filtered;
                else if (normalizedName === 'family') groupedFiles.family = filtered;
                
                console.log(`[VideoLoader] Found ${filtered.length} videos in ${normalizedName} folder`);
            }
            
            const total = Object.values(groupedFiles).reduce((sum, arr) => sum + arr.length, 0);
            console.log(`[VideoLoader] ✅ Found ${groupedFiles.equipment.length} equipment + ${groupedFiles.decks.length} decks + ${groupedFiles.skyline.length} skyline + ${groupedFiles.chicago.length} chicago + ${groupedFiles.neighborhood.length} neighborhood + ${groupedFiles.artist.length} artist + ${groupedFiles.family.length} family = ${total} total video references`);

            if (total === 0) {
                console.warn(`[VideoLoader] ⚠️ No videos found in selected folders: [${selectedFolders.join(', ')}]`);
                console.warn(`[VideoLoader] ⚠️ This will cause fallback to image background.`);
                console.warn(`[VideoLoader] 💡 Check that:`);
                console.warn(`[VideoLoader]    1. Folder names match exactly (case-insensitive)`);
                console.warn(`[VideoLoader]    2. Videos exist in Firebase Storage in those folders`);
                console.warn(`[VideoLoader]    3. Videos have valid extensions: ${videoExtensions.join(', ')}`);
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
     * Load videos from all available folders (for MIXES mode)
     * Returns grouped structure: { skyline: [...], chicago: [...], artist: [...], etc. }
     * Also maintains backward compatibility by returning flat array if needed
     * Downloads and caches videos locally for FFmpeg to use
     */
    async loadAllSkylineVideos(returnGrouped = true, selectedFolders = []) {
        try {
            const storage = getStorage();
            const bucket = storage.bucket();

            // Log what folders are being requested
            console.log(`[VideoLoader] 🔍 Loading videos with selectedFolders: [${selectedFolders.join(', ')}]`);

            // Support multiple video formats: .mp4, .mov, .m4v, .avi, .mkv, .webm
            const videoExtensions = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'];
            
            // Normalize folder names for comparison (case-insensitive, trim whitespace, remove assets/ prefix)
            const normalize = (name) => {
                if (!name) return '';
                return name.toString().toLowerCase().trim().replace(/^assets\//, '');
            };
            
            // Normalize selected folders from frontend (they come without assets/ prefix)
            const normalizedSelectedFolders = selectedFolders.map(normalize);
            
            // Dynamically discover folders from Firebase Storage (like video-folders API does)
            // This allows new folders created by users to be automatically included
            async function discoverFolders() {
                const [allFiles] = await bucket.getFiles();
                const folderSet = new Set();
                
                // Extract unique folder names from file paths
                allFiles.forEach(file => {
                    const pathParts = file.name.split('/');
                    if (pathParts.length > 1) {
                        const folderName = pathParts[0];
                        // Skip hidden files and .keep files
                        if (!folderName.startsWith('.') && !file.name.endsWith('.keep')) {
                            folderSet.add(folderName);
                        }
                    }
                });
                
                // Also check for nested folders (like assets/chicago-skyline-videos)
                allFiles.forEach(file => {
                    const pathParts = file.name.split('/');
                    if (pathParts.length > 2) {
                        const nestedFolder = `${pathParts[0]}/${pathParts[1]}`;
                        if (!nestedFolder.includes('.') && !file.name.endsWith('.keep')) {
                            folderSet.add(nestedFolder);
                        }
                    }
                });
                
                return Array.from(folderSet);
            }
            
            // Discover all folders dynamically
            const discoveredFolders = await discoverFolders();
            console.log(`[VideoLoader] 🔍 Discovered ${discoveredFolders.length} folders: [${discoveredFolders.join(', ')}]`);
            
            // Helper function to check if a folder should be included
            const shouldIncludeFolder = (folderName) => {
                if (normalizedSelectedFolders.length === 0) return true; // No filter = include all
                
                const normalizedFolderName = normalize(folderName);
                // Simple exact match after normalization
                const matches = normalizedSelectedFolders.includes(normalizedFolderName);
                
                if (matches) {
                    console.log(`[VideoLoader] ✅ Folder "${folderName}" (normalized: "${normalizedFolderName}") matches selected folders: [${normalizedSelectedFolders.join(', ')}]`);
                } else {
                    console.log(`[VideoLoader] ⏭️  Folder "${folderName}" (normalized: "${normalizedFolderName}") does NOT match selected folders: [${normalizedSelectedFolders.join(', ')}]`);
                }
                
                return matches;
            };
            
            // Initialize grouped structure dynamically (will add folders as we discover them)
            const groupedVideos = {};

            // Process each discovered folder
            for (const folderName of discoveredFolders) {
                // Skip excluded folders
                const normalizedFolderName = normalize(folderName);
                if (normalizedFolderName === 'logos' || 
                    normalizedFolderName === 'paper_backgrounds' || 
                    normalizedFolderName === 'mixes' ||
                    (normalizedFolderName.includes('baiee') && !normalizedFolderName.includes('retro') && !normalizedFolderName.includes('noise') && !normalizedFolderName.includes('grit'))) {
                    continue;
                }
                
                if (!shouldIncludeFolder(folderName)) {
                    console.log(`[VideoLoader] ⏭️  Skipping ${folderName} (not selected)`);
                    continue;
                }
                
                // Get the Firebase Storage prefix path
                const prefix = folderName + '/';
                
                console.log(`[VideoLoader] 📥 Loading videos from ${folderName} folder...`);
                const [fileList] = await bucket.getFiles({ prefix: prefix });
                const filtered = fileList.filter(file => {
                    const fileName = file.name.toLowerCase();
                    return videoExtensions.some(ext => fileName.endsWith(ext)) && !fileName.endsWith('.keep');
                });
                
                console.log(`[VideoLoader] Found ${filtered.length} videos in ${folderName} folder`);
                
                // Download and cache videos from this folder
                const folderVideos = [];
                for (const file of filtered) {
                    const fileName = path.basename(file.name);
                    const safeFolderName = normalizedFolderName.replace(/[^a-zA-Z0-9]/g, '_');
                    const cacheKey = `${safeFolderName}_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    const cachedPath = path.join(this.cacheDir, cacheKey);

                    // Check cache first
                    if (await fs.pathExists(cachedPath)) {
                        folderVideos.push(cachedPath);
                        continue;
                    }

                    // Download from Firebase using Admin SDK (works with private files)
                    try {
                        const fileRef = bucket.file(file.name);
                        console.log(`[VideoLoader] 📥 Downloading video from ${folderName}: ${fileName}`);
                        
                        // Use Admin SDK download method (works with private files)
                        await fileRef.download({ destination: cachedPath });
                        
                        folderVideos.push(cachedPath);
                        console.log(`[VideoLoader] ✅ Cached ${folderName}: ${fileName}`);
                    } catch (error) {
                        console.warn(`[VideoLoader] ⚠️ Failed to download ${fileName}:`, error.message);
                    }
                }
                
                // Add to grouped structure using normalized folder name as key
                // Map chicago-skyline-videos to 'chicago' for backward compatibility
                const groupKey = normalizedFolderName === 'chicago-skyline-videos' ? 'chicago' : normalizedFolderName;
                groupedVideos[groupKey] = folderVideos;
            }
            
            // Ensure backward compatibility: initialize known folder keys if they don't exist
            const knownFolders = ['equipment', 'decks', 'skyline', 'chicago', 'neighborhood', 'artist', 'family'];
            knownFolders.forEach(key => {
                if (!groupedVideos[key]) {
                    groupedVideos[key] = [];
                }
            });

            const totalVideos = Object.values(groupedVideos).reduce((sum, arr) => sum + arr.length, 0);
            const folderSummary = Object.entries(groupedVideos)
                .filter(([_, arr]) => arr.length > 0)
                .map(([name, arr]) => `${arr.length} ${name}`)
                .join(' + ');
            console.log(`[VideoLoader] ✅ Loaded ${folderSummary} = ${totalVideos} total videos`);

            if (totalVideos === 0) {
                console.warn(`[VideoLoader] ⚠️ No videos found in selected folders: [${selectedFolders.join(', ')}]`);
                console.warn(`[VideoLoader] ⚠️ This will cause fallback to image background.`);
                console.warn(`[VideoLoader] 💡 Check that:`);
                console.warn(`[VideoLoader]    1. Folder names match exactly (case-insensitive)`);
                console.warn(`[VideoLoader]    2. Videos exist in Firebase Storage in those folders`);
                console.warn(`[VideoLoader]    3. Videos have valid extensions: ${videoExtensions.join(', ')}`);
                return returnGrouped ? groupedVideos : [];
            }

            // Return grouped structure or flat array for backward compatibility
            if (returnGrouped) {
                return groupedVideos;
            } else {
                // Backward compatibility: return flat array
                return Object.values(groupedVideos).flat();
            }

        } catch (error) {
            console.error(`[VideoLoader] ❌ Error loading videos:`, error.message);
            console.error(error.stack);
            return returnGrouped ? { equipment: [], decks: [], skyline: [], chicago: [], neighborhood: [], artist: [], family: [] } : [];
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


