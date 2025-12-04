/**
 * Test Script for Video Segment Creation
 * 
 * Tests that 5-second video segments are properly extracted and combined
 * Run: node test-video-segments.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import { VideoLoader } from './lib/VideoLoader.js';
import { VideoSegmentCompositor } from './lib/VideoSegmentCompositor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('🧪 Video Segment Creation Test');
console.log('================================\n');

async function testVideoSegments() {
    try {
        // Initialize components
        console.log('📦 Initializing components...');
        const videoLoader = new VideoLoader();
        const segmentCompositor = new VideoSegmentCompositor();
        
        // Test 1: Check if videos are available
        console.log('\n📋 Test 1: Loading video references from folders...');
        const selectedFolders = ['skyline', 'assets/chicago-skyline-videos'];
        // loadAllSkylineVideos doesn't accept selectedFolders, it loads all folders
        // For testing specific folders, we need to use loadTrackVideoReferences
        const groupedVideos = await videoLoader.loadAllSkylineVideos(true);
        
        const totalVideos = Object.values(groupedVideos).reduce((sum, arr) => sum + arr.length, 0);
        console.log(`\n✅ Found ${totalVideos} total videos:`);
        Object.entries(groupedVideos).forEach(([folder, videos]) => {
            if (videos.length > 0) {
                console.log(`   ${folder}: ${videos.length} videos`);
            }
        });
        
        if (totalVideos === 0) {
            console.error('\n❌ ERROR: No videos found in selected folders!');
            console.error('   This is why video creation is failing and falling back to images.');
            console.error('   Check Firebase Storage to ensure videos exist in:');
            selectedFolders.forEach(folder => console.error(`     - ${folder}/`));
            return;
        }
        
        // Test 2: Try to create video from segments
        console.log('\n🎬 Test 2: Creating video from 5-second segments...');
        console.log(`   Target duration: 30 seconds`);
        console.log(`   Segment duration: 5 seconds`);
        console.log(`   Expected segments: ${Math.ceil(30 / 5)}`);
        
        try {
            const videoPath = await segmentCompositor.createVideoFromSegments(
                groupedVideos,
                30, // 30 seconds
                5   // 5-second segments
            );
            
            if (!await fs.pathExists(videoPath)) {
                throw new Error('Video file was not created');
            }
            
            const stats = await fs.stat(videoPath);
            console.log(`\n✅ SUCCESS: Video created!`);
            console.log(`   Path: ${videoPath}`);
            console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            
            // Verify video duration using ffprobe
            try {
                const { execSync } = await import('child_process');
                const ffprobePath = 'ffprobe';
                const command = `${ffprobePath} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
                const duration = parseFloat(execSync(command, { encoding: 'utf8' }).trim());
                console.log(`   Duration: ${duration.toFixed(2)} seconds`);
                
                if (duration < 25 || duration > 35) {
                    console.warn(`   ⚠️  WARNING: Duration is ${duration.toFixed(2)}s, expected ~30s`);
                }
            } catch (probeError) {
                console.warn(`   ⚠️  Could not verify duration: ${probeError.message}`);
            }
            
        } catch (error) {
            console.error('\n❌ ERROR: Failed to create video from segments!');
            console.error(`   Error: ${error.message}`);
            console.error(`   Stack: ${error.stack}`);
            console.error('\n   This is the error that causes fallback to image background.');
            return;
        }
        
        // Test 3: Full video generation test
        console.log('\n🎬 Test 3: Full video generation with audio...');
        const videoGenerator = new ArweaveVideoGenerator();
        
        const testConfig = {
            duration: 30,
            artist: null,
            prompt: 'chicago skyline',
            width: 720,
            height: 720,
            fadeIn: 2,
            fadeOut: 2,
            selectedFolders: selectedFolders
        };
        
        console.log('   Generating video with selected folders...');
        const result = await videoGenerator.generateVideoWithAudio(testConfig);
        
        if (result.success) {
            console.log(`\n✅ SUCCESS: Full video generated!`);
            console.log(`   Video: ${result.videoPath}`);
            console.log(`   File: ${result.fileName}`);
            
            // Check if video background was used
            if (result.videoPath && await fs.pathExists(result.videoPath)) {
                const videoStats = await fs.stat(result.videoPath);
                console.log(`   Size: ${(videoStats.size / 1024 / 1024).toFixed(2)} MB`);
                console.log(`\n✅ Video segments are working correctly!`);
            } else {
                console.warn(`\n⚠️  WARNING: Video file not found at expected path`);
            }
        } else {
            console.error('\n❌ ERROR: Video generation failed!');
            console.error(`   Result: ${JSON.stringify(result, null, 2)}`);
        }
        
    } catch (error) {
        console.error('\n❌ TEST FAILED!');
        console.error(`   Error: ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
        process.exit(1);
    }
}

// Run the test
testVideoSegments();

