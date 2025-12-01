import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import { ArweaveAudioClient } from './ArweaveAudioClient.js';
import { DALLEImageGenerator } from './DALLEImageGenerator.js';
import { ImageLoader } from './ImageLoader.js';
import { VideoCompositor, CompositionConfig, LayerConfig } from './VideoCompositor.js';

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
        this.dalleGenerator = new DALLEImageGenerator();
        this.imageLoader = new ImageLoader();
        this.videoCompositor = new VideoCompositor();
        this.tempDir = path.join(process.cwd(), 'temp-uploads');
        this.videosDir = path.join(process.cwd(), 'outputs', 'videos');
        this.backgroundsDir = path.join(process.cwd(), 'outputs', 'backgrounds');
        
        // Ensure directories exist
        fs.ensureDirSync(this.tempDir);
        fs.ensureDirSync(this.videosDir);
        fs.ensureDirSync(this.backgroundsDir);
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
        const {
            duration = 30,
            artist = null,
            prompt = null,
            width = 720,
            height = 720,
            fadeIn = 2,
            fadeOut = 2
        } = options;

        console.log(`[ArweaveVideoGenerator] Starting video generation - ${duration}s for ${artist || 'random artist'}`);

        try {
            let audioResult;
            
            // Step 1: Use existing audio or generate new audio clip
            if (existingAudioResult) {
                console.log('[ArweaveVideoGenerator] Using provided audio clip...');
                audioResult = existingAudioResult;
            } else {
                console.log('[ArweaveVideoGenerator] Step 1: Generating Arweave audio clip...');
                audioResult = await this.audioClient.generateAudioClip(duration, fadeIn, fadeOut, prompt, { artist });
                console.log(`[ArweaveVideoGenerator] Audio generated: ${audioResult.artist} - ${audioResult.mixTitle}`);
            }

            // Ensure audioResult has necessary properties
            if (!audioResult || !audioResult.audioPath) {
                throw new Error('Audio result is missing or invalid.');
            }

            console.log(`[ArweaveVideoGenerator] Audio ready: ${audioResult.artist} - ${audioResult.mixTitle}`);

            const audioFilePath = audioResult.audioPath;
            const audioArtist = audioResult.artist;
            const audioMixTitle = audioResult.mixTitle;
            const audioDuration = audioResult.duration;
            const audioArweaveUrl = audioResult.arweaveUrl;

            // Step 2: Generate DALL-E background image
            console.log('[ArweaveVideoGenerator] Step 2: Generating DALL-E background...');
            let backgroundPath = await this.dalleGenerator.generateBackgroundImage(audioArtist, prompt, width, height);
            
            // Fallback to simple background if DALL-E fails
            if (!backgroundPath) {
                console.log('[ArweaveVideoGenerator] DALL-E failed, using fallback background...');
                backgroundPath = await this.generateBackgroundImage(audioArtist, prompt, width, height);
            }

            // Step 3: Collect image layers
            console.log('[ArweaveVideoGenerator] Step 3: Collecting image layers...');
            const layers = [];

            // Generate 1-3 random DALL-E overlay images
            const randomImageCount = Math.floor(Math.random() * 3) + 1; // 1-3 images
            console.log(`[ArweaveVideoGenerator] Generating ${randomImageCount} random DALL-E overlay images...`);
            const randomImages = await this.dalleGenerator.generateRandomImages(audioArtist, randomImageCount, width * 0.4, height * 0.4);
            
            // Add random DALL-E images as layers
            randomImages.forEach((imagePath, index) => {
                if (imagePath) {
                    // Position randomly on canvas
                    const x = Math.floor(Math.random() * (width * 0.6)); // Random x, leave 40% margin
                    const y = Math.floor(Math.random() * (height * 0.6)); // Random y, leave 40% margin
                    const layerSize = Math.min(width * 0.3, height * 0.3); // 30% of canvas
                    
                    layers.push(new LayerConfig(
                        'image',
                        imagePath,
                        { x, y },
                        { width: layerSize, height: layerSize },
                        0.7 + Math.random() * 0.2, // Opacity between 0.7-0.9
                        10 + index, // z-index
                        1.0
                    ));
                }
            });

            // Load images from artist JSON
            try {
                const { artist: artistData, mix: mixData } = this.audioClient.getArtistMix(audioArtist);
                const jsonImages = await this.imageLoader.loadFromArtistJSON(artistData, mixData);
                
                jsonImages.forEach((img, index) => {
                    if (img && img.path) {
                        const layerSize = Math.min(width * 0.25, height * 0.25); // 25% of canvas
                        const x = width * 0.1 + (index * width * 0.3); // Stagger horizontally
                        const y = height * 0.1;
                        
                        layers.push(new LayerConfig(
                            'image',
                            img.path,
                            { x, y },
                            { width: layerSize, height: layerSize },
                            0.8, // opacity
                            20 + index, // z-index
                            1.0
                        ));
                    }
                });
            } catch (error) {
                console.warn('[ArweaveVideoGenerator] Could not load images from JSON:', error.message);
            }

            // Step 4: Generate text layers
            console.log('[ArweaveVideoGenerator] Step 4: Generating text layers...');
            const textLayers = this.generateTextLayers(audioArtist, audioMixTitle, width, height);
            layers.push(...textLayers);

            // Step 5: Compose final video with all layers
            console.log('[ArweaveVideoGenerator] Step 5: Composing final video with layers...');
            
            // Generate temp video path
            const tempVideoPath = path.join(this.tempDir, `${audioArtist.replace(/[^a-zA-Z0-9]/g, '_')}_video_${Date.now()}.mp4`);
            
            // Generate permanent video path
            const permanentVideoPath = path.join(this.videosDir, `${audioArtist.replace(/[^a-zA-Z0-9]/g, '_')}_video_${Date.now()}.mp4`);

            // Create composition config
            const compositionConfig = new CompositionConfig(
                backgroundPath,
                audioFilePath,
                layers,
                tempVideoPath,
                duration,
                width,
                height
            );

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
                await fs.remove(backgroundPath);
                await fs.remove(tempVideoPath);
                
                // Cleanup DALL-E generated overlay images
                randomImages.forEach(async (imagePath) => {
                    if (imagePath && await fs.pathExists(imagePath)) {
                        try {
                            await fs.remove(imagePath);
                        } catch (err) {
                            console.warn(`[ArweaveVideoGenerator] Could not cleanup image ${imagePath}:`, err.message);
                        }
                    }
                });
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