/**
 * Video Optimizer
 * Optimizes uploaded videos for storage and playback
 * - Resizes to max dimensions while maintaining aspect ratio
 * - Compresses to reasonable file size
 * - Supports square and vertical orientations
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';

// Configure FFmpeg path
let ffmpegPath = 'ffmpeg';
if (process.env.GITHUB_ACTIONS !== 'true' && ffmpegStatic) {
  ffmpegPath = ffmpegStatic;
} else {
  ffmpegPath = 'ffmpeg';
}

export class VideoOptimizer {
  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp-uploads');
    fs.ensureDirSync(this.tempDir);
  }

  /**
   * Get video dimensions and orientation
   * @param {string} videoPath - Path to video file
   * @returns {Promise<{width: number, height: number, orientation: string}>}
   */
  async getVideoInfo(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to probe video: ${err.message}`));
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        const width = videoStream.width;
        const height = videoStream.height;
        const orientation = width > height ? 'landscape' : width === height ? 'square' : 'portrait';

        resolve({ width, height, orientation });
      });
    });
  }

  /**
   * Optimize video with smart resizing and compression
   * @param {string} inputPath - Input video path
   * @param {Object} options - Optimization options
   * @param {number} options.maxWidth - Maximum width (default: 720)
   * @param {number} options.maxHeight - Maximum height (default: 720)
   * @param {string} options.orientation - 'square', 'portrait', 'landscape', or 'auto' (default: 'auto')
   * @param {number} options.quality - Video quality 0-51, lower is better (default: 23)
   * @param {number} options.maxFileSizeMB - Maximum file size in MB (default: 50)
   * @returns {Promise<{outputPath: string, originalSize: number, optimizedSize: number, dimensions: {width: number, height: number}}>}
   */
  async optimizeVideo(inputPath, options = {}) {
    const {
      maxWidth = 720,
      maxHeight = 720,
      orientation = 'auto',
      quality = 23,
      maxFileSizeMB = 50
    } = options;

    console.log(`[VideoOptimizer] Optimizing video: ${path.basename(inputPath)}`);

    // Get video info
    const videoInfo = await this.getVideoInfo(inputPath);
    console.log(`[VideoOptimizer] Original: ${videoInfo.width}x${videoInfo.height} (${videoInfo.orientation})`);

    // Determine target dimensions
    let targetWidth, targetHeight;
    
    if (orientation === 'auto') {
      // Auto-detect: maintain aspect ratio, fit within max dimensions
      const aspectRatio = videoInfo.width / videoInfo.height;
      
      if (videoInfo.orientation === 'portrait') {
        // Vertical video: prioritize height
        targetHeight = Math.min(videoInfo.height, maxHeight);
        targetWidth = Math.round(targetHeight * aspectRatio);
        if (targetWidth > maxWidth) {
          targetWidth = maxWidth;
          targetHeight = Math.round(targetWidth / aspectRatio);
        }
      } else if (videoInfo.orientation === 'landscape') {
        // Horizontal video: prioritize width
        targetWidth = Math.min(videoInfo.width, maxWidth);
        targetHeight = Math.round(targetWidth / aspectRatio);
        if (targetHeight > maxHeight) {
          targetHeight = maxHeight;
          targetWidth = Math.round(targetHeight * aspectRatio);
        }
      } else {
        // Square video
        const size = Math.min(videoInfo.width, videoInfo.height, maxWidth, maxHeight);
        targetWidth = size;
        targetHeight = size;
      }
    } else if (orientation === 'square') {
      // Force square: crop to center
      const size = Math.min(maxWidth, maxHeight);
      targetWidth = size;
      targetHeight = size;
    } else if (orientation === 'portrait') {
      // Force portrait: max height, proportional width
      targetHeight = maxHeight;
      const aspectRatio = videoInfo.width / videoInfo.height;
      targetWidth = Math.round(targetHeight * aspectRatio);
      if (targetWidth > maxWidth) {
        targetWidth = maxWidth;
        targetHeight = Math.round(targetWidth / aspectRatio);
      }
    } else {
      // Landscape: max width, proportional height
      targetWidth = maxWidth;
      const aspectRatio = videoInfo.width / videoInfo.height;
      targetHeight = Math.round(targetWidth / aspectRatio);
      if (targetHeight > maxHeight) {
        targetHeight = maxHeight;
        targetWidth = Math.round(targetHeight * aspectRatio);
      }
    }

    // Ensure even dimensions (required for H.264)
    targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
    targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

    console.log(`[VideoOptimizer] Target: ${targetWidth}x${targetHeight}`);

    // Generate output path
    const outputPath = path.join(
      this.tempDir,
      `optimized_${Date.now()}_${path.basename(inputPath)}`
    );

    // Build FFmpeg command
    const command = [
      ffmpegPath,
      '-i', inputPath,
      '-vf', `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', quality.toString(),
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart', // Optimize for web playback
      '-y',
      outputPath
    ];

    // If forcing square, add crop filter
    if (orientation === 'square' && videoInfo.orientation !== 'square') {
      const cropFilter = `crop=${targetWidth}:${targetHeight}:(iw-${targetWidth})/2:(ih-${targetHeight})/2`;
      const scaleIndex = command.indexOf('-vf');
      command[scaleIndex + 1] = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,${cropFilter}`;
    }

    // Execute FFmpeg
    await this.executeFFmpeg(command, outputPath);

    // Check file size
    const stats = await fs.stat(outputPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`[VideoOptimizer] Optimized size: ${fileSizeMB.toFixed(2)}MB`);

    // If file is still too large, reduce quality
    if (fileSizeMB > maxFileSizeMB) {
      console.log(`[VideoOptimizer] File too large (${fileSizeMB.toFixed(2)}MB > ${maxFileSizeMB}MB), re-encoding with lower quality...`);
      const lowerQuality = Math.min(quality + 5, 28); // Increase CRF (lower quality)
      return this.optimizeVideo(inputPath, { ...options, quality: lowerQuality });
    }

    // Get original file size
    const originalStats = await fs.stat(inputPath);
    const originalSizeMB = originalStats.size / (1024 * 1024);

    return {
      outputPath,
      originalSize: originalStats.size,
      optimizedSize: stats.size,
      dimensions: { width: targetWidth, height: targetHeight },
      compressionRatio: ((1 - stats.size / originalStats.size) * 100).toFixed(1)
    };
  }

  /**
   * Execute FFmpeg command
   */
  async executeFFmpeg(command, outputPath) {
    return new Promise((resolve, reject) => {
      const ffmpegPath = command[0];
      const args = command.slice(1);

      console.log(`[VideoOptimizer] Executing: ${ffmpegPath} ${args.slice(0, 5).join(' ')}...`);

      const ffmpegProcess = spawn(ffmpegPath, args, { stdio: 'pipe' });

      let stderr = '';

      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        if (output.includes('time=')) {
          process.stdout.write('.');
        }
      });

      ffmpegProcess.on('close', (code) => {
        console.log(''); // New line after progress dots

        if (code === 0) {
          if (fs.existsSync(outputPath)) {
            console.log(`[VideoOptimizer] ✅ Optimization complete: ${path.basename(outputPath)}`);
            resolve(outputPath);
          } else {
            reject(new Error('Output file was not created'));
          }
        } else {
          console.error(`[VideoOptimizer] ❌ FFmpeg failed with code: ${code}`);
          console.error(stderr);
          reject(new Error(`FFmpeg failed with exit code ${code}`));
        }
      });

      ffmpegProcess.on('error', (error) => {
        console.error('[VideoOptimizer] ❌ FFmpeg spawn error:', error);
        reject(error);
      });
    });
  }

  /**
   * Clean up temporary files
   */
  async cleanup(filePath) {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        console.log(`[VideoOptimizer] Cleaned up: ${path.basename(filePath)}`);
      }
    } catch (error) {
      console.warn(`[VideoOptimizer] Cleanup warning: ${error.message}`);
    }
  }
}


