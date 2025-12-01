/**
 * Local Test Script for Video Generation
 * 
 * Tests video generation locally with organized output folders
 * Run: node test-local.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '.env') });

// Also check for environment variable (for direct export)
if (!process.env.OPENAI_API_KEY && process.env.OPENAI_KEY) {
    process.env.OPENAI_API_KEY = process.env.OPENAI_KEY;
}

// Set up organized output directories
const testOutputDir = path.join(__dirname, 'test-output');
const testImagesDir = path.join(testOutputDir, 'images');
const testVideosDir = path.join(testOutputDir, 'videos');
const testDalleDir = path.join(testOutputDir, 'images', 'dalle-generated');
const testCacheDir = path.join(testOutputDir, 'images', 'cache');

// Ensure directories exist
fs.ensureDirSync(testOutputDir);
fs.ensureDirSync(testImagesDir);
fs.ensureDirSync(testVideosDir);
fs.ensureDirSync(testDalleDir);
fs.ensureDirSync(testCacheDir);

console.log('🧪 Local Video Generation Test');
console.log('================================\n');

// Override output directories in process.env so generators use test folders
process.env.TEST_OUTPUT_DIR = testOutputDir;
process.env.TEST_IMAGES_DIR = testImagesDir;
process.env.TEST_VIDEOS_DIR = testVideosDir;

// Check for OpenAI API key
if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OPENAI_API_KEY not found in environment variables');
    console.warn('   DALL-E image generation will be skipped');
    console.warn('   Set OPENAI_API_KEY in .env file or export it\n');
} else {
    console.log('✅ OPENAI_API_KEY found');
    console.log(`   Key: ${process.env.OPENAI_API_KEY.substring(0, 10)}...${process.env.OPENAI_API_KEY.substring(process.env.OPENAI_API_KEY.length - 4)}\n`);
}

// Initialize video generator
console.log('📦 Initializing video generator...\n');
const videoGenerator = new ArweaveVideoGenerator();

// Override output directories
videoGenerator.videosDir = testVideosDir;
videoGenerator.backgroundsDir = testImagesDir;
videoGenerator.tempDir = path.join(testOutputDir, 'temp');
fs.ensureDirSync(videoGenerator.tempDir);

// Also update DALL-E generator output directory
if (videoGenerator.dalleGenerator) {
    videoGenerator.dalleGenerator.outputDir = testDalleDir;
    fs.ensureDirSync(testDalleDir);
}

// Also update image loader cache directory
if (videoGenerator.imageLoader) {
    videoGenerator.imageLoader.cacheDir = testCacheDir;
    fs.ensureDirSync(testCacheDir);
}

// Also update video loader cache directory
if (videoGenerator.videoLoader) {
    videoGenerator.videoLoader.cacheDir = path.join(testOutputDir, 'video-cache');
    fs.ensureDirSync(videoGenerator.videoLoader.cacheDir);
}

console.log('📁 Output directories:');
console.log(`   Videos: ${testVideosDir}`);
console.log(`   Images: ${testImagesDir}`);
console.log(`   DALL-E: ${testDalleDir}`);
console.log(`   Cache: ${testCacheDir}\n`);

// Test configuration
// Using "chicago skyline" prompt to trigger video background usage
const testConfig = {
    duration: 30,
    artist: null, // null = random artist
    prompt: 'chicago skyline', // This will trigger Chicago skyline video background
    width: 720,
    height: 720,
    fadeIn: 2,
    fadeOut: 2
};

console.log('🎬 Test Configuration:');
console.log(`   Duration: ${testConfig.duration}s`);
console.log(`   Artist: ${testConfig.artist || 'Random'}`);
console.log(`   Resolution: ${testConfig.width}x${testConfig.height}`);
console.log(`   Prompt: ${testConfig.prompt || 'Default'}\n`);

console.log('🚀 Starting video generation...\n');
console.log('=' .repeat(50) + '\n');

// Run the test
async function runTest() {
    try {
        const startTime = Date.now();
        
        const result = await videoGenerator.generateVideoWithAudio(testConfig);
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log('\n' + '='.repeat(50));
        console.log('✅ Video Generation Complete!');
        console.log('='.repeat(50) + '\n');
        
        console.log('📊 Results:');
        console.log(`   ✅ Success: ${result.success}`);
        console.log(`   🎤 Artist: ${result.artist}`);
        console.log(`   🎵 Mix: ${result.mixTitle}`);
        console.log(`   ⏱️  Duration: ${result.duration}s`);
        console.log(`   📁 File: ${result.fileName}`);
        console.log(`   💾 Size: ${result.fileSize}`);
        console.log(`   ⏱️  Generation Time: ${duration}s\n`);
        
        console.log('📂 Output Files:');
        console.log(`   Video: ${result.videoPath}`);
        
        // List generated images
        const dalleImages = await fs.readdir(testDalleDir).catch(() => []);
        if (dalleImages.length > 0) {
            console.log(`\n   DALL-E Images (${dalleImages.length}):`);
            dalleImages.forEach(img => {
                console.log(`      - ${img}`);
            });
        }
        
        const cacheImages = await fs.readdir(testCacheDir).catch(() => []);
        if (cacheImages.length > 0) {
            console.log(`\n   Cached Images (${cacheImages.length}):`);
            cacheImages.forEach(img => {
                console.log(`      - ${img}`);
            });
        }
        
        console.log('\n✨ Test completed successfully!');
        console.log(`📁 Check output in: ${testOutputDir}\n`);
        
    } catch (error) {
        console.error('\n' + '='.repeat(50));
        console.error('❌ Test Failed!');
        console.error('='.repeat(50) + '\n');
        console.error('Error:', error.message);
        console.error('\nStack trace:');
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
runTest();

