import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import { ArweaveAudioClient } from './ArweaveAudioClient.js';
import { VideoLoader } from './VideoLoader.js';
import { VideoCompositor, CompositionConfig, LayerConfig } from './VideoCompositor.js';
import { VideoSegmentCompositor } from './VideoSegmentCompositor.js';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure FFmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

/**
 * Arweave Video Generator - Creates videos with real Arweave audio and artist visuals
 * Enhanced with proper Chicago skyline backgrounds and reliable video generation
 */
class ArweaveVideoGenerator {
    constructor() {
        this.audioClient = new ArweaveAudioClient();
        // DALLEImageGenerator only used for fallback background generation (not overlays)
        // Main video generation uses Mix Archive configuration: paper overlay + "Mix Archive" text
        // NO DALL-E overlay images, NO artist/mix images, NO old text layers
        this.dalleGenerator = null; // Lazy load only if needed for fallback
        this.videoLoader = new VideoLoader();
        this.videoCompositor = new VideoCompositor();
        this.segmentCompositor = new VideoSegmentCompositor();
        this.tempDir = path.join(process.cwd(), 'temp-uploads');
        this.videosDir = path.join(process.cwd(), 'outputs', 'videos');
        this.backgroundsDir = path.join(process.cwd(), 'outputs', 'backgrounds');
        this.cacheDir = path.join(process.cwd(), 'outputs', 'image-cache');
        
        // Ensure directories exist
        fs.ensureDirSync(this.tempDir);
        fs.ensureDirSync(this.videosDir);
        fs.ensureDirSync(this.backgroundsDir);
        fs.ensureDirSync(this.cacheDir);
    }

    /**
     * Generate a simple but effective Chicago skyline background image
     * Uses basic FFmpeg commands to ensure reliability
     */
    async generateBackgroundImage(artist, prompt, width = 1920, height = 1080) {
        const imagePath = path.join(this.backgroundsDir, `bg_${uuidv4()}.png`);
        
        // Determine background type based on prompt and artist
        let backgroundType = 'chicago_skyline'; // Default fallback
        
        if (prompt) {
            const lowerPrompt = prompt.toLowerCase();
            if (lowerPrompt.includes('chicago') || lowerPrompt.includes('skyline')) {
                backgroundType = 'chicago_skyline';
            } else if (lowerPrompt.includes('abstract') || lowerPrompt.includes('geometric')) {
                backgroundType = 'abstract_geometric';
            } else if (lowerPrompt.includes('neon') || lowerPrompt.includes('cyber')) {
                backgroundType = 'neon_cyber';
            }
        }

        // Use ImageMagick for GitHub Actions (lavfi not available)
        if (process.env.GITHUB_ACTIONS === 'true') {
            console.log(`[ArweaveVideoGenerator] Using ImageMagick for background: ${backgroundType}`);
            try {
                const backgroundColor = this.getBackgroundColor(backgroundType);
                const convertCmd = `convert -size ${width}x${height} xc:${backgroundColor} "${imagePath}"`;
                execSync(convertCmd, { stdio: 'pipe' });
                console.log(`[ArweaveVideoGenerator] Background image created: ${imagePath}`);
                return imagePath;
            } catch (error) {
                console.error('[ArweaveVideoGenerator] ImageMagick background generation failed, falling back:', error.message);
                // Fallback to a very simple solid color PNG if ImageMagick fails
                return this.createSimpleSolidColorPNG(imagePath, width, height, this.getBackgroundColor(backgroundType));
            }
        }

        // Generate different background types using simple, reliable FFmpeg commands
        return new Promise((resolve, reject) => {
            let command;
            
            switch (backgroundType) {
                case 'chicago_skyline':
                    // Create Chicago skyline using simple gradient approach
                    command = ffmpeg()
                        .input(`color=c=#87CEEB:s=${width}x${height}:d=1`)
                        .inputOptions(['-f', 'lavfi'])
                        .outputOptions(['-frames:v', '1'])
                        .output(imagePath);
                    break;
                    
                case 'abstract_geometric':
                    // Create abstract geometric pattern
                    command = ffmpeg()
                        .input(`color=c=#2d1b4e:s=${width}x${height}:d=1`)
                        .inputOptions(['-f', 'lavfi'])
                        .outputOptions(['-frames:v', '1'])
                        .output(imagePath);
                    break;
                    
                case 'neon_cyber':
                    // Create neon cyberpunk style
                    command = ffmpeg()
                        .input(`color=c=#000000:s=${width}x${height}:d=1`)
                        .inputOptions(['-f', 'lavfi'])
                        .outputOptions(['-frames:v', '1'])
                        .output(imagePath);
                    break;
                    
                default:
                    // Chicago skyline as fallback
                    command = ffmpeg()
                        .input(`color=c=#87CEEB:s=${width}x${height}:d=1`)
                        .inputOptions(['-f', 'lavfi'])
                        .outputOptions(['-frames:v', '1'])
                        .output(imagePath);
            }

            command
                .on('end', () => {
                    console.log(`[ArweaveVideoGenerator] Background image created: ${backgroundType}`);
                    resolve(imagePath);
                })
                .on('error', (error) => {
                    console.error('[ArweaveVideoGenerator] Background generation error:', error);
                    // Fallback to simple gradient if complex filter fails
                    this.createSimpleBackground(imagePath, width, height, backgroundType)
                        .then(resolve)
                        .catch(reject);
                })
                .run();
        });
    }

    /**
     * Get background color for a given type
     */
    getBackgroundColor(type) {
        const colors = {
            'chicago_skyline': '#87CEEB',
            'abstract_geometric': '#2d1b4e',
            'neon_cyber': '#000000'
        };
        return colors[type] || '#87CEEB';
    }

    /**
     * Create a simple solid color PNG using Node.js (fallback when ImageMagick fails)
     */
    createSimpleSolidColorPNG(imagePath, width, height, color) {
        // For now, just create a simple file - ImageMagick should work
        // But if it doesn't, we'll use a basic approach
        return new Promise((resolve, reject) => {
            try {
                // Try ImageMagick one more time with simpler command
                const convertCmd = `convert -size ${width}x${height} xc:"${color}" "${imagePath}"`;
                execSync(convertCmd, { stdio: 'pipe' });
                console.log(`[ArweaveVideoGenerator] Simple solid color PNG created: ${imagePath}`);
                resolve(imagePath);
            } catch (error) {
                console.error('[ArweaveVideoGenerator] Failed to create solid color PNG:', error.message);
                reject(error);
            }
        });
    }

    /**
     * Create a simple but effective background as fallback
     */
    async createSimpleBackground(imagePath, width, height, type) {
        return new Promise((resolve, reject) => {
            let command;
            
            switch (type) {
                case 'chicago_skyline':
                    // Create a simple Chicago skyline with gradient and basic buildings
                    command = ffmpeg()
                        .input(`color=c=#87CEEB:s=${width}x${height}:d=1`)
                        .inputOptions(['-f', 'lavfi'])
                        .complexFilter([
                            // Simple gradient sky
                            `[0:v]gradients=s=${width}x${height}:c0=#87CEEB:c1=#FF8C42[v1]`,
                            // Add building base
                            `[v1]drawbox=x=0:y=${height*0.6}:w=${width}:h=${height*0.4}:color=#2C3E50:t=fill[v2]`,
                            // Add a few simple buildings
                            `[v2]drawbox=x=${width*0.2}:y=${height*0.4}:w=${width*0.1}:h=${height*0.6}:color=#34495E:t=fill[v3]`,
                            `[v3]drawbox=x=${width*0.5}:y=${height*0.35}:w=${width*0.1}:h=${height*0.65}:color=#2C3E50:t=fill[v4]`,
                            `[v4]drawbox=x=${width*0.8}:y=${height*0.5}:w=${width*0.1}:h=${height*0.5}:color=#34495E:t=fill[v5]`
                        ])
                        .outputOptions(['-frames:v', '1'])
                        .output(imagePath);
                    break;
                    
                case 'abstract_geometric':
                    // Simple geometric pattern
                    command = ffmpeg()
                        .input(`color=c=#2d1b4e:s=${width}x${height}:d=1`)
                        .inputOptions(['-f', 'lavfi'])
                        .complexFilter([
                            `[0:v]drawbox=x=${width*0.1}:y=${height*0.1}:w=${width*0.3}:h=${height*0.3}:color=#8B5CF6:t=fill[v1]`,
                            `[v1]drawbox=x=${width*0.6}:y=${height*0.6}:w=${width*0.3}:h=${height*0.3}:color=#EC4899:t=fill[v2]`
                        ])
                        .outputOptions(['-frames:v', '1'])
                        .output(imagePath);
                    break;
                    
                case 'neon_cyber':
                    // Simple neon style
                    command = ffmpeg()
                        .input(`color=c=#000000:s=${width}x${height}:d=1`)
                        .inputOptions(['-f', 'lavfi'])
                        .complexFilter([
                            `[0:v]drawbox=x=0:y=${height*0.5}:w=${width}:h=2:color=#00FF00:t=fill[v1]`,
                            `[v1]drawbox=x=${width*0.5}:y=0:w=2:h=${height}:color=#00FF00:t=fill[v2]`
                        ])
                        .outputOptions(['-frames:v', '1'])
                        .output(imagePath);
                    break;
                    
                default:
                    // Default Chicago skyline
                    command = ffmpeg()
                        .input(`color=c=#87CEEB:s=${width}x${height}:d=1`)
                        .inputOptions(['-f', 'lavfi'])
                        .complexFilter([
                            `[0:v]gradients=s=${width}x${height}:c0=#87CEEB:c1=#FF8C42[v1]`,
                            `[v1]drawbox=x=0:y=${height*0.6}:w=${width}:h=${height*0.4}:color=#2C3E50:t=fill[v2]`,
                            `[v2]drawbox=x=${width*0.2}:y=${height*0.4}:w=${width*0.1}:h=${height*0.6}:color=#34495E:t=fill[v3]`,
                            `[v3]drawbox=x=${width*0.5}:y=${height*0.35}:w=${width*0.1}:h=${height*0.65}:color=#2C3E50:t=fill[v4]`,
                            `[v4]drawbox=x=${width*0.8}:y=${height*0.5}:w=${width*0.1}:h=${height*0.5}:color=#34495E:t=fill[v5]`
                        ])
                        .outputOptions(['-frames:v', '1'])
                        .output(imagePath);
            }
            
            command
                .on('end', () => {
                    console.log(`[ArweaveVideoGenerator] Simple background created: ${type}`);
                    resolve(imagePath);
                })
                .on('error', reject)
                .run();
        });
    }

    /**
     * Generate text layers for video overlay
     */
    generateTextLayers(artist, mixTitle, width, height) {
        const layers = [];
        const fontSize = Math.round(height * 0.08); // 8% of canvas height
        const padding = Math.round(height * 0.05); // 5% padding

        // Artist name at top-center
        // x = width/2 signals to VideoCompositor to center the text
        if (artist) {
            layers.push(new LayerConfig(
                'text',
                artist,
                { x: width / 2, y: padding + fontSize }, // Center horizontally (VideoCompositor will handle centering)
                { width: width * 0.9, height: fontSize * 1.5 },
                1.0, // opacity
                100 // z-index (high, on top)
            ));
        }

        // Mix title at bottom-center
        if (mixTitle) {
            layers.push(new LayerConfig(
                'text',
                mixTitle,
                { x: width / 2, y: height - padding - fontSize * 1.5 }, // Center horizontally, bottom
                { width: width * 0.9, height: fontSize * 1.2 },
                1.0, // opacity
                101 // z-index (highest, on top)
            ));
        }

        return layers;
    }

    /**
     * Generate video with audio and proper visuals
     */
    async generateVideoWithAudio(options = {}, existingAudioResult = null) {
        // Store overlay opacity from options for use in layer creation
        this.currentOverlayOpacity = options.overlayOpacity !== undefined ? options.overlayOpacity : 0.5;
        const {
            duration = 30,
            artist = null,
            prompt = null,
            width = 720,
            height = 720,
            fadeIn = 2,
            fadeOut = 2,
            videoFilter = null,
            useTrax = false, // Flag to use tracks instead of mixes
            selectedFolders = [], // Array of selected folder names
            enableOverlay = true // Overlay feature toggle (default: true)
        } = options;

        console.log(`[ArweaveVideoGenerator] Starting video generation - ${duration}s for ${artist || 'random artist'}`);
        console.log(`[ArweaveVideoGenerator] 🎬 Using Mix Archive configuration: paper overlay + "Mix Archive" text`);
        console.log(`[ArweaveVideoGenerator] 🎨 Filter: ${videoFilter ? 'Custom filter applied' : 'Default (B&W)'}`);

        try {
            let audioResult;
            
            // Step 1: Use existing audio or generate new audio clip
            if (existingAudioResult) {
                console.log('[ArweaveVideoGenerator] Using provided audio clip...');
                audioResult = existingAudioResult;
            } else {
                console.log('[ArweaveVideoGenerator] Step 1: Generating Arweave audio clip...');
                audioResult = await this.audioClient.generateAudioClip(duration, fadeIn, fadeOut, prompt, { 
                    artist,
                    useTrax: useTrax // Pass useTrax flag to audio client
                });
                console.log(`[ArweaveVideoGenerator] Audio generated: ${audioResult.artist} - ${audioResult.mixTitle || audioResult.trackTitle}`);
            }

            // Ensure audioResult has necessary properties
            if (!audioResult || !audioResult.audioPath) {
                throw new Error('Audio result is missing or invalid.');
            }

            console.log(`[ArweaveVideoGenerator] Audio ready: ${audioResult.artist} - ${audioResult.mixTitle || audioResult.trackTitle}`);

            const audioFilePath = audioResult.audioPath;
            const audioArtist = audioResult.artist;
            const audioMixTitle = audioResult.mixTitle || audioResult.trackTitle || 'Unknown';
            const audioDuration = audioResult.duration;
            const audioArweaveUrl = audioResult.arweaveUrl;

            // Step 2: Create 30-second video from 5-second segments
            console.log('[ArweaveVideoGenerator] Step 2: Creating video from segments...');
            let backgroundPath = null;
            let useVideoBackground = false;
            
            // Check if we're using tracks (original music) or mixes (DJ mixes)
            // useTrax is already extracted from options at line 303
            // Both tracks and mixes now use the same unified approach with all folders
            // For tracks: use file references (on-demand download)
            // For mixes: download all videos upfront (backward compatibility)
            if (useTrax) {
                // For tracks: Get video file references (metadata only, no download yet)
                console.log(`[ArweaveVideoGenerator] 🎵 TRACKS mode: Getting video file references from selected folders: [${selectedFolders.join(', ')}]`);
                const groupedVideos = await this.videoLoader.loadTrackVideoReferences(true, selectedFolders);
                
                // Calculate totals from all folders
                const totalVideos = Object.values(groupedVideos).reduce((sum, arr) => sum + arr.length, 0);
                
                if (totalVideos > 0) {
                    const folderSummary = Object.entries(groupedVideos)
                        .filter(([_, arr]) => arr.length > 0)
                        .map(([name, arr]) => `${arr.length} ${name}`)
                        .join(' + ');
                    console.log(`[ArweaveVideoGenerator] Found ${folderSummary} = ${totalVideos} total video references`);
                    console.log(`[ArweaveVideoGenerator] Selected folders: ${selectedFolders.length > 0 ? selectedFolders.join(', ') : 'all'}`);
                    console.log(`[ArweaveVideoGenerator] Creating ${duration}s video from 5s segments with equal distribution across selected folders (videos will be downloaded on-demand)...`);
                    
                    // Validate we have enough videos for the required segments
                    const segmentsNeeded = Math.ceil(duration / 5);
                    if (totalVideos < segmentsNeeded) {
                        console.warn(`[ArweaveVideoGenerator] ⚠️  Warning: Only ${totalVideos} video references available, but ${segmentsNeeded} segments needed. Videos will be reused.`);
                    }
                    
                    try {
                        // Create 30-second video from random 5-second segments with equal distribution
                        // Videos will be downloaded on-demand in VideoSegmentCompositor
                        console.log(`[ArweaveVideoGenerator] Attempting to create video from ${totalVideos} video references...`);
                        backgroundPath = await this.segmentCompositor.createVideoFromSegments(
                            groupedVideos, // Pass grouped structure with file references (not paths)
                            duration,
                            5, // 5-second segments
                            audioFilePath // Pass audio path for BPM detection
                        );
                        
                        // Verify the video was actually created
                        if (!backgroundPath) {
                            throw new Error('Video segment compositor returned null/undefined path');
                        }
                        
                        const fs = await import('fs-extra');
                        if (!await fs.pathExists(backgroundPath)) {
                            throw new Error(`Video file does not exist at path: ${backgroundPath}`);
                        }
                        
                        useVideoBackground = true;
                        console.log('[ArweaveVideoGenerator] ✅ Created video background from track videos (equal distribution, on-demand download)');
                        console.log(`[ArweaveVideoGenerator] Video path: ${backgroundPath}`);
                    } catch (error) {
                        console.error('[ArweaveVideoGenerator] ❌ Failed to create segment video!');
                        console.error(`[ArweaveVideoGenerator] Error message: ${error.message}`);
                        console.error(`[ArweaveVideoGenerator] Error stack: ${error.stack}`);
                        console.error(`[ArweaveVideoGenerator] This will cause fallback to image background.`);
                        console.error(`[ArweaveVideoGenerator] Check logs above for video loading/segment extraction errors.`);
                        // Fall through to DALL-E or simple background
                    }
                } else {
                    console.warn(`[ArweaveVideoGenerator] ⚠️  No video references found in selected folders: ${selectedFolders.length > 0 ? selectedFolders.join(', ') : 'all'}`);
                    console.warn(`[ArweaveVideoGenerator] This will cause fallback to image background.`);
                }
            } else {
                // For mixes: Load video REFERENCES from selected folders (on-demand download, not all upfront)
                const defaultFolders = selectedFolders.length > 0 ? selectedFolders : ['skyline', 'assets/chicago-skyline-videos'];
                console.log(`[ArweaveVideoGenerator] 🎬 MIXES mode: Loading video references from selected folders: [${defaultFolders.join(', ')}]`);
                console.log(`[ArweaveVideoGenerator] 📋 Original selectedFolders parameter: [${selectedFolders.join(', ')}]`);
                const groupedVideos = await this.videoLoader.loadTrackVideoReferences(true, defaultFolders);
                
                // Calculate totals from all folders
                const totalVideos = Object.values(groupedVideos).reduce((sum, arr) => sum + arr.length, 0);
                
                if (totalVideos > 0) {
                    const folderSummary = Object.entries(groupedVideos)
                        .filter(([_, arr]) => arr.length > 0)
                        .map(([name, arr]) => `${arr.length} ${name}`)
                        .join(' + ');
                    console.log(`[ArweaveVideoGenerator] Found ${folderSummary} = ${totalVideos} total videos`);
                    
                    // Determine distribution: if more than 2 folders, use equal distribution; otherwise 50/50
                    const folderCount = Object.values(groupedVideos).filter(arr => arr.length > 0).length;
                    const distributionType = folderCount > 2 ? `equal distribution across ${folderCount} folders` : '50/50 distribution';
                    console.log(`[ArweaveVideoGenerator] Creating ${duration}s video from 5s segments with ${distributionType}...`);
                    
                    // Validate we have enough videos for the required segments
                    const segmentsNeeded = Math.ceil(duration / 5);
                    if (totalVideos < segmentsNeeded) {
                        console.warn(`[ArweaveVideoGenerator] ⚠️  Warning: Only ${totalVideos} videos available, but ${segmentsNeeded} segments needed. Videos will be reused.`);
                    }
                    
                    try {
                        // Create 30-second video from random 5-second segments with transitions and beat sync
                        console.log(`[ArweaveVideoGenerator] Attempting to create video from ${totalVideos} videos...`);
                        backgroundPath = await this.segmentCompositor.createVideoFromSegments(
                            groupedVideos, // Pass grouped structure
                            duration,
                            5, // 5-second segments
                            audioFilePath // Pass audio path for BPM detection
                        );
                        
                        // Verify the video was actually created
                        if (!backgroundPath) {
                            throw new Error('Video segment compositor returned null/undefined path');
                        }
                        
                        const fs = await import('fs-extra');
                        if (!await fs.pathExists(backgroundPath)) {
                            throw new Error(`Video file does not exist at path: ${backgroundPath}`);
                        }
                        
                        useVideoBackground = true;
                        console.log(`[ArweaveVideoGenerator] ✅ Created video background from selected folders (${distributionType})`);
                        console.log(`[ArweaveVideoGenerator] Video path: ${backgroundPath}`);
                    } catch (error) {
                        console.error('[ArweaveVideoGenerator] ❌ Failed to create segment video!');
                        console.error(`[ArweaveVideoGenerator] Error message: ${error.message}`);
                        console.error(`[ArweaveVideoGenerator] Error stack: ${error.stack}`);
                        console.error(`[ArweaveVideoGenerator] This will cause fallback to image background.`);
                        console.error(`[ArweaveVideoGenerator] Check logs above for video loading/segment extraction errors.`);
                        // Fall through to DALL-E or simple background
                    }
                } else {
                    console.warn(`[ArweaveVideoGenerator] ⚠️  No videos found in selected folders: [${selectedFolders.join(', ')}]`);
                    console.warn(`[ArweaveVideoGenerator] ⚠️  This will cause fallback to image background.`);
                    console.warn(`[ArweaveVideoGenerator] 💡 Troubleshooting:`);
                    console.warn(`[ArweaveVideoGenerator]    1. Check VideoLoader logs above for folder matching details`);
                    console.warn(`[ArweaveVideoGenerator]    2. Verify videos exist in Firebase Storage in those folders`);
                    console.warn(`[ArweaveVideoGenerator]    3. Check that folder names match exactly (case-insensitive)`);
                }
            }
            
            // Fallback to DALL-E background if video segments not available (background only, NOT overlays)
            if (!backgroundPath && process.env.OPENAI_API_KEY) {
                console.log('[ArweaveVideoGenerator] Generating DALL-E background (fallback only, no overlays)...');
                // Lazy load DALLEImageGenerator only if needed
                if (!this.dalleGenerator) {
                    const { DALLEImageGenerator } = await import('./DALLEImageGenerator.js');
                    this.dalleGenerator = new DALLEImageGenerator();
                }
                backgroundPath = await this.dalleGenerator.generateBackgroundImage(audioArtist, prompt, width, height);
            }
            
            // Final fallback to simple background generation
            if (!backgroundPath) {
                console.log('[ArweaveVideoGenerator] Using fallback background generation...');
                backgroundPath = await this.generateBackgroundImage(audioArtist, prompt, width, height);
            }

            // Step 3: Load serial_logo.png from Firebase Storage and add to center
            console.log('[ArweaveVideoGenerator] Step 3: Loading serial_logo.png from Firebase...');
            const layers = [];
            let serialLogoCachePath = null; // Declare outside try block for cleanup
            
            try {
                // Load serial_logo.png from Firebase Storage
                const { getStorage } = await import('../firebase-admin.js');
                const storage = getStorage();
                const bucket = storage.bucket();
                const logoStoragePath = 'logos/serial_logo.png';
                const publicUrl = `https://storage.googleapis.com/${bucket.name}/${logoStoragePath}`;
                
                console.log(`[ArweaveVideoGenerator] Downloading serial_logo.png from Firebase...`);
                
                // Download and cache logo
                serialLogoCachePath = path.join(this.cacheDir, `serial_logo_${Date.now()}.png`);
                const response = await axios({
                    url: publicUrl,
                    method: 'GET',
                    responseType: 'stream'
                });
                
                const writer = fs.createWriteStream(serialLogoCachePath);
                response.data.pipe(writer);
                
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
                
                console.log(`[ArweaveVideoGenerator] ✅ Serial logo cached`);
                
                // Add serial logo at 100% width, centered vertically and horizontally
                // The logo will be scaled to 100% width, maintaining aspect ratio
                const logoWidth = width; // 100% width
                const logoHeight = height; // Full height (will maintain aspect ratio via FFmpeg scale filter)
                const logoX = 0; // Start at left edge (100% width fills entire canvas)
                const logoY = Math.round((height - logoHeight) / 2); // Center vertically (will be adjusted by aspect ratio)
                
                layers.push(new LayerConfig(
                    'image',
                    serialLogoCachePath,
                    { x: logoX, y: logoY },
                    { width: logoWidth, height: logoHeight },
                    1.0, // Full opacity
                    10, // z-index (above video background)
                    1.0 // scale
                ));
                
                console.log(`[ArweaveVideoGenerator] Serial logo: ${logoWidth}x${logoHeight} (100% width), centered`);
            } catch (error) {
                console.warn(`[ArweaveVideoGenerator] ⚠️ Failed to load serial_logo.png:`, error.message);
                serialLogoCachePath = null; // Clear if failed
                // Continue without logo if it fails
            }

            // Step 4: Add second logo at 40% down from top, appearing at 22 seconds (after fade starts, won't fade out)
            console.log('[ArweaveVideoGenerator] Step 4: Loading second logo for 22s overlay from Firebase...');
            const secondLogoStartTime = 22; // 22 seconds into video (same time fade starts, but logo won't fade)
            let secondLogoCachePath = null; // Declare outside try block for cleanup
            
            try {
                secondLogoCachePath = path.join(this.cacheDir, `second_logo_${Date.now()}.png`);
                
                // Load logos from Firebase Storage (excluding serial_logo.png)
                const { getStorage } = await import('../firebase-admin.js');
                const storage = getStorage();
                const bucket = storage.bucket();
                
                console.log(`[ArweaveVideoGenerator] 📥 Loading logos from Firebase Storage (logos/ folder)...`);
                const [logoFiles] = await bucket.getFiles({ prefix: 'logos/' });
                const validLogos = logoFiles.filter(file => {
                    const fileName = path.basename(file.name);
                    // Exclude SVG files - FFmpeg cannot handle them directly
                    return (fileName.endsWith('.png') || fileName.endsWith('.jpg')) &&
                           fileName !== 'serial_logo.png' &&
                           !fileName.endsWith('.keep');
                });
                
                if (validLogos.length > 0) {
                    const randomLogo = validLogos[Math.floor(Math.random() * validLogos.length)];
                    const logoFileName = path.basename(randomLogo.name);
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${randomLogo.name}`;
                    
                    console.log(`[ArweaveVideoGenerator] Selected second logo: ${logoFileName}`);
                    
                    // Download and cache logo
                    const response = await axios({
                        url: publicUrl,
                        method: 'GET',
                        responseType: 'stream'
                    });
                    
                    const writer = fs.createWriteStream(secondLogoCachePath);
                    response.data.pipe(writer);
                    
                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });
                    
                    // Second logo: 30% width, maintain aspect ratio, centered horizontally
                    const logoWidth = Math.round(width * 0.30); // 30% width
                    const logoHeight = Math.round(logoWidth * 1.0); // Will be adjusted by aspect ratio
                    // Center horizontally
                    const logoX = Math.round((width - logoWidth) / 2); // Center horizontally
                    // Position at 40% down from top
                    const logoY = Math.round(height * 0.4); // 40% down from top
                    
                    console.log(`[ArweaveVideoGenerator] ✅ Second logo downloaded: ${logoFileName}`);
                    console.log(`[ArweaveVideoGenerator] Second logo size: ${logoWidth}x${logoHeight}, position: (${logoX}, ${logoY})`);
                    console.log(`[ArweaveVideoGenerator] Second logo appears at: ${secondLogoStartTime}s (after fade starts, won't fade out)`);
                    console.log(`[ArweaveVideoGenerator] Second logo z-index: 20 (above serial logo at 10)`);
                    
                    // Add second logo as timed overlay layer (appears at 22s, stays until end, won't fade)
                    // Mark this layer to be added AFTER the fade filter so it doesn't fade out
                    const secondLogoLayer = new LayerConfig(
                        'image',
                        secondLogoCachePath,
                        { x: logoX, y: logoY },
                        { width: logoWidth, height: logoHeight },
                        1.0, // Full opacity
                        20, // z-index (above serial logo at 10, below text)
                        1.0, // scale
                        null, // no font path
                        secondLogoStartTime, // start at 22 seconds
                        duration - secondLogoStartTime // duration until end (8 seconds)
                    );
                    secondLogoLayer.addAfterFade = true; // Mark to add after fade filter
                    layers.push(secondLogoLayer);
                } else {
                    console.warn(`[ArweaveVideoGenerator] ⚠️ No valid logos found for second logo overlay`);
                }
            } catch (error) {
                console.warn(`[ArweaveVideoGenerator] ⚠️ Failed to load second logo from Firebase:`, error.message);
                // Continue without logo if it fails
            }

            // Step 5: Add white text overlay (Artist, Mix Title, UndergroundExistence.info) at bottom corner
            console.log('[ArweaveVideoGenerator] Step 5: Adding artist/mix title text overlay...');
            const textStartTime = 10; // Fade in at 10 seconds
            const textWidthPercent = 0.15; // 15% of screen width
            const textWidth = Math.round(width * textWidthPercent);
            const textFontSize = Math.round(height * 0.03); // Small font (3% of height)
            
            // Position at bottom left corner
            // With reduced line spacing (0.75x instead of 1.5x), text takes less vertical space
            // Adjust Y position to move text up: reduce the height calculation since lines are closer together
            const textX = 10; // Small margin from left edge
            // Move text up significantly: 3 lines with 0.75x spacing need more clearance from bottom
            // Using 3.5x font size + 30px margin to ensure all 3 lines are fully visible
            const textY = height - (textFontSize * 3.5) - 30; // Moved up significantly: 3.5x font size + 30px margin
            
            // Build text content: Artist (line break) Mix Title (line break) UndergroundExistence.info
            const textContent = `${audioArtist}\n${audioMixTitle}\nUndergroundExistence.info`;
            
            // Use system Arial/sans-serif (no custom font for this small text)
            // FFmpeg will use default font if no fontfile specified
            console.log(`[ArweaveVideoGenerator] Text content: ${textContent.replace(/\n/g, ' | ')}`);
            console.log(`[ArweaveVideoGenerator] Text position: (${textX}, ${textY}), size: ${textWidth}x${textFontSize * 4}`);
            console.log(`[ArweaveVideoGenerator] Text fades in at: ${textStartTime}s`);
            console.log(`[ArweaveVideoGenerator] Text z-index: 400 (HIGHEST - above everything)`);
            
            // Add text layer with white color, small font, fade-in at 10 seconds
            // Note: drawtext doesn't support fontcolor directly in enable expression, so we'll use white text
            // We'll need to modify VideoCompositor to support white text color
            // Text should end when fade starts (so it fades out with video)
            // Fade starts at duration - 8 seconds (22s for 30s video)
            const fadeStartTime = duration - 8;
            const textEndTime = fadeStartTime; // Text ends when fade starts
            const textDuration = textEndTime - textStartTime; // Duration from start to fade
            
            const textLayer = new LayerConfig(
                'text',
                textContent,
                { x: textX, y: textY },
                { width: textWidth, height: textFontSize * 4 }, // Height for 3 lines
                1.0, // Full opacity (fade handled by enable expression)
                400, // HIGHEST z-index (above everything including logos)
                1.0, // scale
                null, // No custom font - use system Arial/sans-serif
                textStartTime, // start at 10 seconds
                textDuration // duration until fade starts (12 seconds for 30s video: 10s to 22s)
            );
            // Text layer should fade out with everything else (processed before fade)
            textLayer.addAfterFade = false;
            // Store text color in layer config (we'll need to add this to LayerConfig)
            textLayer.textColor = '0xFFFFFF'; // White text
            textLayer.fontSize = textFontSize; // Store font size
            layers.push(textLayer);

            // Step 5.5: Add random video overlays from ONE selected folder, switching every 10 seconds
            console.log('[ArweaveVideoGenerator] Step 5.5: Loading overlay videos from ONE random folder, switching every 10 seconds...');
            const overlayVideoCachePaths = [];
            
            try {
                const { getStorage } = await import('../firebase-admin.js');
                const storage = getStorage();
                const bucket = storage.bucket();
                
                // Define which asset folders are for overlay videos (not background videos)
                // These folders contain videos specifically for overlay effects
                const OVERLAY_ASSET_FOLDERS = ['assets/analog_film', 'assets/gritt', 'assets/noise', 'assets/retro_dust'];
                const videoExtensions = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'];
                
                console.log(`[ArweaveVideoGenerator] 📥 Available overlay asset folders: ${OVERLAY_ASSET_FOLDERS.join(', ')}`);
                
                // Select ONE random folder for this video
                const selectedFolderPath = OVERLAY_ASSET_FOLDERS[Math.floor(Math.random() * OVERLAY_ASSET_FOLDERS.length)];
                console.log(`[ArweaveVideoGenerator] 🎲 Selected overlay folder: ${selectedFolderPath}`);
                
                // Load all videos from the selected folder
                const [files] = await bucket.getFiles({ prefix: `${selectedFolderPath}/` });
                const folderVideos = files.filter(file => {
                    const fileName = file.name.toLowerCase();
                    return videoExtensions.some(ext => fileName.endsWith(ext)) && !fileName.endsWith('.keep');
                });
                
                if (folderVideos.length === 0) {
                    console.warn(`[ArweaveVideoGenerator] ⚠️  No overlay videos found in ${selectedFolderPath}. Run upload-overlay-videos.js to upload videos.`);
                } else {
                    console.log(`[ArweaveVideoGenerator] Found ${folderVideos.length} videos in ${selectedFolderPath}`);
                    
                    // Calculate number of 10-second segments needed
                    const segmentDuration = 10; // 10 seconds per overlay
                    const numSegments = Math.ceil(duration / segmentDuration);
                    console.log(`[ArweaveVideoGenerator] Creating ${numSegments} overlay segments (${segmentDuration}s each) for ${duration}s video`);
                    
                    // Download videos and create overlay layers for each segment
                    const usedVideoIndices = new Set(); // Track which videos we've used to avoid immediate repeats
                    
                    for (let segmentIndex = 0; segmentIndex < numSegments; segmentIndex++) {
                        const segmentStartTime = segmentIndex * segmentDuration;
                        const segmentEndTime = Math.min(segmentStartTime + segmentDuration, duration);
                        const actualSegmentDuration = segmentEndTime - segmentStartTime;
                        
                        // Select a random video from the folder (avoid immediate repeats)
                        let videoIndex;
                        let attempts = 0;
                        do {
                            videoIndex = Math.floor(Math.random() * folderVideos.length);
                            attempts++;
                            // If we've used all videos, reset the set
                            if (usedVideoIndices.size >= folderVideos.length) {
                                usedVideoIndices.clear();
                            }
                        } while (usedVideoIndices.has(videoIndex) && attempts < 10);
                        
                        usedVideoIndices.add(videoIndex);
                        const selectedVideo = folderVideos[videoIndex];
                        const videoFileName = path.basename(selectedVideo.name);
                        
                        console.log(`[ArweaveVideoGenerator] Segment ${segmentIndex + 1}/${numSegments}: ${videoFileName} (${segmentStartTime}s - ${segmentEndTime}s)`);
                        
                        // Download and cache video
                        const overlayVideoCachePath = path.join(this.cacheDir, `overlay_video_${Date.now()}_${segmentIndex}.mp4`);
                        await selectedVideo.download({ destination: overlayVideoCachePath });
                        overlayVideoCachePaths.push(overlayVideoCachePath);
                        
                        // Video overlay: full canvas size, overlay blend mode, z-index 250
                        const overlayVideoWidth = width;
                        const overlayVideoHeight = height;
                        const overlayVideoX = 0;
                        const overlayVideoY = 0;
                        
                        // Add video overlay layer with timing (10 seconds per segment)
                        // Opacity can be controlled via options.overlayOpacity (default 0.5 for less distraction)
                        const overlayOpacity = this.currentOverlayOpacity !== undefined ? this.currentOverlayOpacity : 0.5;
                        const overlayVideoLayer = new LayerConfig(
                            'video',
                            overlayVideoCachePath,
                            { x: overlayVideoX, y: overlayVideoY },
                            { width: overlayVideoWidth, height: overlayVideoHeight },
                            overlayOpacity, // Configurable opacity (default 0.5 for less distraction)
                            250, // z-index (above images at 10/20, below text at 400 and end logo at 300)
                            1.0, // scale
                            null, // no font path
                            segmentStartTime, // start at segment start time
                            actualSegmentDuration // duration of this segment
                        );
                        overlayVideoLayer.addAfterFade = false; // Fade out with everything else
                        overlayVideoLayer.blendMode = 'overlay'; // Use overlay blend mode
                        layers.push(overlayVideoLayer);
                    }
                    
                    console.log(`[ArweaveVideoGenerator] ✅ Created ${numSegments} overlay segments from ${selectedFolderPath}`);
                    console.log(`[ArweaveVideoGenerator] Overlay videos will switch every ${segmentDuration} seconds`);
                }
            } catch (error) {
                console.warn(`[ArweaveVideoGenerator] ⚠️ Failed to load overlay videos from assets/:`, error.message);
                // Continue without overlay videos if it fails
            }

            // Step 6: Add random logo overlay at 25 seconds (5 seconds before end)
            console.log('[ArweaveVideoGenerator] Step 6: Loading random logo for end overlay from Firebase...');
            const logoStartTime = duration - 5; // 25 seconds for 30s video
            let logoCachePath = null; // Declare outside try block for cleanup
            
            try {
                logoCachePath = path.join(this.cacheDir, `logo_${Date.now()}.png`);
                
                // Load logos from Firebase Storage
                const { getStorage } = await import('../firebase-admin.js');
                const storage = getStorage();
                const bucket = storage.bucket();
                
                // Get all logos from Firebase Storage (excluding serial_logo.png)
                console.log(`[ArweaveVideoGenerator] 📥 Loading logos from Firebase Storage (logos/ folder)...`);
                const [logoFiles] = await bucket.getFiles({ prefix: 'logos/' });
                const validLogos = logoFiles.filter(file => {
                    const fileName = path.basename(file.name);
                    // Exclude SVG files - FFmpeg cannot handle them directly
                    return (fileName.endsWith('.png') || fileName.endsWith('.jpg')) &&
                           fileName !== 'serial_logo.png' &&
                           !fileName.endsWith('.keep');
                });
                
                if (validLogos.length > 0) {
                    const randomLogo = validLogos[Math.floor(Math.random() * validLogos.length)];
                    const logoFileName = path.basename(randomLogo.name);
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${randomLogo.name}`;
                    
                    console.log(`[ArweaveVideoGenerator] Selected logo: ${logoFileName}`);
                    
                    // Download and cache logo
                    const response = await axios({
                        url: publicUrl,
                        method: 'GET',
                        responseType: 'stream'
                    });
                    
                    const writer = fs.createWriteStream(logoCachePath);
                    response.data.pipe(writer);
                    
                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });
                    
                    // Calculate logo size: 35% of width, maintain aspect ratio
                    const logoWidth = Math.round(width * 0.35);
                    const logoHeight = Math.round(logoWidth * 1.0); // Will be adjusted by aspect ratio
                    
                    // Center position (horizontally and vertically) - use canvas center
                    // FFmpeg overlay uses top-left corner, so center = (width - logoWidth) / 2
                    const logoX = Math.round((width - logoWidth) / 2);
                    const logoY = Math.round((height - logoHeight) / 2);
                    
                    console.log(`[ArweaveVideoGenerator] ✅ Logo downloaded: ${logoFileName}`);
                    console.log(`[ArweaveVideoGenerator] Logo size: ${logoWidth}x${logoHeight}, position: (${logoX}, ${logoY})`);
                    console.log(`[ArweaveVideoGenerator] Logo appears at: ${logoStartTime}s (5 seconds before end)`);
                    console.log(`[ArweaveVideoGenerator] Logo z-index: 300 (HIGHEST - above text and serial logo)`);
                    
                    // Add logo as timed overlay layer (appears at 25s, stays until end)
                    // Use z-index 300 to ensure it's processed LAST and appears on top of everything
                    layers.push(new LayerConfig(
                        'image',
                        logoCachePath,
                        { x: logoX, y: logoY },
                        { width: logoWidth, height: logoHeight },
                        1.0, // Full opacity
                        300, // HIGHEST z-index (above everything including text at 100)
                        1.0, // scale
                        null, // no font path
                        logoStartTime, // start at 25 seconds
                        duration - logoStartTime // duration until end (5 seconds)
                    ));
                } else {
                    console.warn(`[ArweaveVideoGenerator] ⚠️ No valid logos found in Firebase Storage (excluding serial_logo.png)`);
                }
            } catch (error) {
                console.warn(`[ArweaveVideoGenerator] ⚠️ Failed to load logo from Firebase:`, error.message);
                // Continue without logo if it fails
            }

            // Step 6: Compose final video with all layers
            console.log('[ArweaveVideoGenerator] Step 6: Composing final video with layers...');
            
            // Generate temp video path
            const tempVideoPath = path.join(this.tempDir, `${audioArtist.replace(/[^a-zA-Z0-9]/g, '_')}_video_${Date.now()}.mp4`);
            
            // Generate permanent video path
            const permanentVideoPath = path.join(this.videosDir, `${audioArtist.replace(/[^a-zA-Z0-9]/g, '_')}_video_${Date.now()}.mp4`);

            // Create composition config with filter
            console.log(`[ArweaveVideoGenerator] 🎨 Video filter received: ${videoFilter ? `"${videoFilter.substring(0, 100)}..."` : 'null (will use default B&W)'}`);
            console.log(`[ArweaveVideoGenerator] 📊 Layers count: ${layers.length} (serial_logo + second_logo + artist_text${logoCachePath ? ' + end_logo' : ''})`);
            
            const compositionConfig = new CompositionConfig(
                backgroundPath,
                audioFilePath,
                layers,
                tempVideoPath,
                duration,
                width,
                height,
                videoFilter // Pass the filter to CompositionConfig
            );
            
            console.log(`[ArweaveVideoGenerator] ✅ CompositionConfig created with filter: ${compositionConfig.videoFilter ? 'YES' : 'NO'}`);

            // Use VideoCompositor to create video with all layers
            await this.videoCompositor.composeVideo(compositionConfig);

            // Copy to permanent location
            await fs.copy(tempVideoPath, permanentVideoPath);
            
            // Get file size
            const stats = await fs.stat(permanentVideoPath);
            const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

            console.log(`[ArweaveVideoGenerator] ✅ Video generated: ${path.basename(permanentVideoPath)} (${fileSizeMB}MB)`);

            // Cleanup temp files
            try {
                if (backgroundPath && await fs.pathExists(backgroundPath)) {
                await fs.remove(backgroundPath);
                }
                if (tempVideoPath && await fs.pathExists(tempVideoPath)) {
                await fs.remove(tempVideoPath);
                }
                // Cleanup serial logo cache
                if (serialLogoCachePath && await fs.pathExists(serialLogoCachePath)) {
                    await fs.remove(serialLogoCachePath);
                }
                // Cleanup end logo cache
                if (logoCachePath && await fs.pathExists(logoCachePath)) {
                    await fs.remove(logoCachePath);
                }
                // Cleanup second logo cache
                if (secondLogoCachePath && await fs.pathExists(secondLogoCachePath)) {
                    await fs.remove(secondLogoCachePath);
                }
            } catch (cleanupError) {
                console.warn('[ArweaveVideoGenerator] Cleanup warning:', cleanupError.message);
            }

            return {
                success: true,
                videoPath: permanentVideoPath,
                videoUrl: `/outputs/videos/${path.basename(permanentVideoPath)}`,
                fileName: path.basename(permanentVideoPath),
                artist: audioArtist,
                mixTitle: audioMixTitle,
                duration: audioDuration,
                fileSize: `${fileSizeMB}MB`,
                arweaveUrl: audioArweaveUrl,
                metadata: {
                    artist: audioArtist,
                    genre: audioResult.genre || 'Electronic',
                    duration: audioDuration,
                    width: width,
                    height: height,
                    backgroundType: 'chicago_skyline'
                }
            };

        } catch (error) {
            console.error('[ArweaveVideoGenerator] Error generating video with audio:', error);
            throw new Error(`Video generation failed: ${error.message}`);
        }
    }

    /**
     * Create video from background and audio components
     */
    async createVideoFromComponents(backgroundPath, audioPath, outputPath, duration, width, height) {
        return new Promise((resolve, reject) => {
            console.log('[ArweaveVideoGenerator] FFmpeg video composition started');
            
            const command = ffmpeg()
                .input(backgroundPath)
                .inputOptions(['-loop', '1', '-r', '30'])
                .input(audioPath)
                .videoCodec('libx264')
                .audioCodec('aac')
                .outputOptions([
                    '-t', duration.toString(),
                    '-pix_fmt', 'yuv420p',
                    '-shortest',
                    '-preset', 'fast',
                    '-crf', '23',
                    '-movflags', '+faststart'
                ])
                .size(`${width}x${height}`)
                .output(outputPath);

            command
                .on('start', (commandLine) => {
                    console.log(`[ArweaveVideoGenerator] FFmpeg command: ${commandLine.substring(0, 100)}...`);
                })
                .on('progress', (progress) => {
                    if (progress.percent) {
                        console.log(`[ArweaveVideoGenerator] Progress: ${Math.round(progress.percent)}% done`);
                    }
                })
                .on('end', () => {
                    console.log('[ArweaveVideoGenerator] Video composition completed');
                    resolve(outputPath);
                })
                .on('error', (error) => {
                    console.error('[ArweaveVideoGenerator] Video composition error:', error);
                    reject(error);
                })
                .run();
        });
    }

    /**
     * Generate video for specific artist
     */
    async generateForArtist(artistName, duration = 30) {
        return await this.generateVideoWithAudio({
            duration,
            artist: artistName,
            prompt: `Generate video for ${artistName}`
        });
    }

    /**
     * Generate random video
     */
    async generateRandom(duration = 30) {
        return await this.generateVideoWithAudio({
            duration,
            prompt: `Generate random video clip`
        });
    }

    /**
     * Test audio connection for artist
     */
    async testArtistAudio(artistName) {
        try {
            const { artist, mix } = this.audioClient.getArtistMix(artistName);
            const connectionTest = await this.audioClient.testArweaveConnection(mix.mixArweaveURL);
            
            return {
                success: true,
                artist: artist.artistName,
                mix: mix.mixTitle,
                connection: connectionTest,
                arweaveUrl: mix.mixArweaveURL
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get available artists from audio client
     */
    getAvailableArtists() {
        return this.audioClient.getAvailableArtists();
    }

    /**
     * Cleanup temporary files
     */
    async cleanup() {
        try {
            const files = await fs.readdir(this.tempDir);
            for (const file of files) {
                if (file.endsWith('.mp4') || file.endsWith('.m4a')) {
                    await fs.remove(path.join(this.tempDir, file));
                }
            }
            console.log('[ArweaveVideoGenerator] Cleanup completed');
        } catch (error) {
            console.warn('[ArweaveVideoGenerator] Cleanup warning:', error.message);
        }
    }
}

export { ArweaveVideoGenerator }; 