/**
 * Local Test Script for Mix Archive Video Generation
 * 
 * Creates a 30-second video with:
 * - Random skyline video clips (5-second segments)
 * - Paper background overlay (80% width, positioned at 75% from top)
 * - "Mix Archive" text in ShantellSans font, centered on paper
 * 
 * Run: node test-mix-archive.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import { VideoCompositor, LayerConfig, CompositionConfig } from './lib/VideoCompositor.js';
import { VideoLoader } from './lib/VideoLoader.js';
import { VideoSegmentCompositor } from './lib/VideoSegmentCompositor.js';
import { ArweaveAudioClient } from './lib/ArweaveAudioClient.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Set up output directories
const testOutputDir = path.join(__dirname, 'test-output');
const testVideosDir = path.join(testOutputDir, 'videos');
const testTempDir = path.join(testOutputDir, 'temp');
const testCacheDir = path.join(testOutputDir, 'video-cache');

fs.ensureDirSync(testOutputDir);
fs.ensureDirSync(testVideosDir);
fs.ensureDirSync(testTempDir);
fs.ensureDirSync(testCacheDir);

console.log('🎬 Mix Archive Video Generation Test');
console.log('====================================\n');

// Configuration
const width = 720;
const height = 720;
const duration = 30;

// Paper background configuration
const paperWidthPercent = 1.5; // 150% of video width
const paperTopPercent = 0.65; // 65% from top
const paperWidth = Math.round(width * paperWidthPercent);
const paperTopY = Math.round(height * paperTopPercent);

// Text configuration
const textContent = 'Mix Archive';
const fontFamily = 'ShantellSans'; // Will use ShantellSans-Regular.ttf or ShantellSans-Bold.ttf

async function loadPaperBackground() {
    console.log('[MixArchive] Loading paper background from Firebase...');
    
    // Paper background URLs from Firebase Storage
    const paperBackgrounds = [
        'https://storage.googleapis.com/editvideos-63486.firebasestorage.app/paper_backgrounds/sheet-paper.png',
        'https://storage.googleapis.com/editvideos-63486.firebasestorage.app/paper_backgrounds/sheet-paper-1.png',
        'https://storage.googleapis.com/editvideos-63486.firebasestorage.app/paper_backgrounds/sheet-paper-2.png'
    ];
    
    // Select random paper background
    const paperUrl = paperBackgrounds[Math.floor(Math.random() * paperBackgrounds.length)];
    console.log(`[MixArchive] Selected paper: ${paperUrl.split('/').pop()}`);
    
    // Download and cache paper background
    const cachePath = path.join(testCacheDir, `paper_${Date.now()}.png`);
    
    try {
        const response = await axios({
            url: paperUrl,
            method: 'GET',
            responseType: 'stream'
        });
        
        const writer = fs.createWriteStream(cachePath);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        console.log(`[MixArchive] ✅ Paper background cached: ${path.basename(cachePath)}`);
        return cachePath;
    } catch (error) {
        console.error(`[MixArchive] ❌ Failed to load paper background:`, error.message);
        throw error;
    }
}

async function generateMixArchiveVideo() {
    try {
        // Step 1: Generate audio
        console.log('[MixArchive] Step 1: Generating audio...');
        const audioClient = new ArweaveAudioClient();
        const audioResult = await audioClient.generateAudioClip(duration, 2, 2, null, { artist: null });
        const audioFilePath = audioResult.audioPath;
        console.log(`[MixArchive] ✅ Audio ready: ${audioResult.artist} - ${audioResult.mixTitle}\n`);

        // Step 2: Create 30-second video from skyline segments
        console.log('[MixArchive] Step 2: Creating video from skyline segments...');
        const videoLoader = new VideoLoader();
        videoLoader.cacheDir = testCacheDir;
        
        // Use flat array for test (backward compatibility)
        const skylineVideos = await videoLoader.loadAllSkylineVideos(false);
        
        if (skylineVideos.length === 0) {
            throw new Error('No skyline videos found');
        }
        
        console.log(`[MixArchive] Found ${skylineVideos.length} skyline videos`);
        
        const segmentCompositor = new VideoSegmentCompositor();
        segmentCompositor.tempDir = testTempDir;
        
        const backgroundVideoPath = await segmentCompositor.createVideoFromSegments(
            skylineVideos,
            duration,
            5 // 5-second segments
        );
        console.log(`[MixArchive] ✅ Created ${duration}s video from segments\n`);

        // Step 3: Load paper background
        console.log('[MixArchive] Step 3: Loading paper background...');
        const paperPath = await loadPaperBackground();
        
        // Calculate paper dimensions
        // Get paper image dimensions to calculate height while maintaining aspect ratio
        // Paper will be 150% width, so it extends beyond canvas
        const paperHeight = Math.round(paperWidth * 1.4); // Approximate aspect ratio for paper
        
        // Calculate paper position
        // Top of paper at 65% from top: y = height * 0.65
        // Center horizontally: x = (width - paperWidth) / 2 (will be negative, allowing paper to extend beyond)
        const paperX = Math.round((width - paperWidth) / 2);
        const paperY = paperTopY;
        
        console.log(`[MixArchive] Paper dimensions: ${paperWidth}x${paperHeight}`);
        console.log(`[MixArchive] Paper position: (${paperX}, ${paperY})\n`);

        // Step 4: Create layers
        console.log('[MixArchive] Step 4: Creating layers...');
        const layers = [];
        
        // Add paper background as image layer
        layers.push(new LayerConfig(
            'image',
            paperPath,
            { x: paperX, y: paperY },
            { width: paperWidth, height: paperHeight },
            1.0, // Full opacity
            10, // z-index (above video background)
            1.0 // scale
        ));
        
        // Add "Mix Archive" text layer
        // Position text centered on paper
        // Paper center: x = paperX + paperWidth/2, y = paperY + paperHeight/2
        const textX = paperX + Math.round(paperWidth / 2); // Center horizontally (will be centered by FFmpeg)
        const textY = paperY + Math.round(paperHeight / 2); // Center vertically
        
        // Calculate font size (about 15% of paper height for better visibility)
        const fontSize = Math.round(paperHeight * 0.15);
        
        // Get font path
        const fontPath = path.join(__dirname, 'assets', 'fonts', 'ShantellSans-Bold.ttf');
        
        // Check if font exists, fallback to Regular
        const actualFontPath = await fs.pathExists(fontPath) 
            ? fontPath 
            : path.join(__dirname, 'assets', 'fonts', 'ShantellSans-Regular.ttf');
        
        if (!await fs.pathExists(actualFontPath)) {
            throw new Error(`Font not found: ${actualFontPath}`);
        }
        
        // Calculate text position - 50% down from top of screen
        // Text should be at 50% of canvas height (360px for 720px canvas)
        const textCenterX = width / 2; // Canvas center (paper is centered)
        const textCenterY = height * 0.5; // 50% down from top
        
        console.log(`[MixArchive] Using font: ${path.basename(actualFontPath)}`);
        console.log(`[MixArchive] Text: "${textContent}"`);
        console.log(`[MixArchive] Text position: (${textCenterX}, ${textCenterY}) - CENTERED`);
        console.log(`[MixArchive] Font size: ${fontSize}px`);
        console.log(`[MixArchive] Text z-index: 100 (highest)\n`);
        
        // Add text layer with custom font - HIGHEST z-index to ensure it's on top
        // Use canvas center for X to trigger FFmpeg centering
        const textLayer = new LayerConfig(
            'text',
            textContent,
            { x: textCenterX, y: textCenterY },
            { width: paperWidth, height: fontSize * 2 }, // Larger bounding box
            1.0, // Full opacity
            100, // HIGHEST z-index (above everything, including paper)
            1.0, // scale
            actualFontPath // Pass font path as 8th parameter
        );
        layers.push(textLayer);

        // Step 5: Compose video
        console.log('[MixArchive] Step 5: Composing final video...');
        const outputPath = path.join(testVideosDir, `mix_archive_${Date.now()}.mp4`);
        
        const compositionConfig = new CompositionConfig(
            backgroundVideoPath,
            audioFilePath,
            layers,
            outputPath,
            duration,
            width,
            height
        );
        
        const videoCompositor = new VideoCompositor();
        await videoCompositor.composeVideo(compositionConfig);
        
        // Get file size
        const stats = await fs.stat(outputPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        console.log(`\n[MixArchive] ✅ Video generated: ${path.basename(outputPath)} (${fileSizeMB}MB)`);
        console.log(`[MixArchive] 📁 Full path: ${outputPath}\n`);
        
        return {
            success: true,
            videoPath: outputPath,
            fileName: path.basename(outputPath),
            fileSize: `${fileSizeMB}MB`,
            duration: duration
        };
        
    } catch (error) {
        console.error('\n[MixArchive] ❌ Error:', error.message);
        console.error(error.stack);
        throw error;
    }
}

// Run the test
console.log('🚀 Starting Mix Archive video generation...\n');
generateMixArchiveVideo()
    .then(result => {
        console.log('='.repeat(50));
        console.log('✅ Mix Archive Video Generation Complete!');
        console.log('='.repeat(50) + '\n');
        console.log('📊 Results:');
        console.log(`   ✅ Success: ${result.success}`);
        console.log(`   📁 File: ${result.fileName}`);
        console.log(`   💾 Size: ${result.fileSize}`);
        console.log(`   ⏱️  Duration: ${result.duration}s\n`);
        console.log(`📂 Output: ${result.videoPath}\n`);
    })
    .catch(error => {
        console.error('\n❌ Generation failed:', error.message);
        process.exit(1);
    });

