/**
 * Video Segment Compositor
 * Creates a 30-second video from multiple 5-second video segments
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

export class VideoSegmentCompositor {
  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp-uploads');
    fs.ensureDirSync(this.tempDir);
  }

  /**
   * Get video duration
   */
  async getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        const duration = metadata.format.duration;
        resolve(duration);
      });
    });
  }

  /**
   * Extract a random 5-second segment from a video
   * @param {string} videoPath - Path to source video
   * @param {number} segmentDuration - Duration of segment in seconds (default: 5)
   * @returns {Promise<string>} Path to extracted segment
   */
  async extractRandomSegment(videoPath, segmentDuration = 5) {
    try {
      const videoDuration = await this.getVideoDuration(videoPath);
      
      // If video is shorter than segment duration, use the whole video
      if (videoDuration <= segmentDuration) {
        console.log(`[VideoSegmentCompositor] Video is ${videoDuration.toFixed(1)}s, using entire video`);
        return videoPath;
      }

      // Calculate random start time (leave room for segment duration)
      const maxStartTime = videoDuration - segmentDuration;
      const startTime = Math.random() * maxStartTime;

      // Generate output path
      const segmentPath = path.join(
        this.tempDir,
        `segment_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`
      );

      console.log(`[VideoSegmentCompositor] Extracting ${segmentDuration}s segment from ${path.basename(videoPath)} (start: ${startTime.toFixed(1)}s)`);

      // Extract segment using FFmpeg
      // Re-encode to ensure compatibility with concatenation
      await this.executeFFmpeg([
        ffmpegPath,
        '-i', videoPath,
        '-ss', startTime.toString(),
        '-t', segmentDuration.toString(),
        '-c:v', 'libx264', // Re-encode for compatibility
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', // Re-encode audio
        '-b:a', '128k',
        '-avoid_negative_ts', 'make_zero',
        '-y',
        segmentPath
      ]);

      return segmentPath;

    } catch (error) {
      console.error(`[VideoSegmentCompositor] Error extracting segment:`, error.message);
      throw error;
    }
  }

  /**
   * Create a 30-second video from multiple 5-second segments
   * @param {string[]} videoPaths - Array of source video paths
   * @param {number} targetDuration - Target duration in seconds (default: 30)
   * @param {number} segmentDuration - Duration of each segment in seconds (default: 5)
   * @returns {Promise<string>} Path to concatenated video
   */
  async createVideoFromSegments(videoPaths, targetDuration = 30, segmentDuration = 5) {
    if (videoPaths.length === 0) {
      throw new Error('No video paths provided');
    }

    const segmentsNeeded = Math.ceil(targetDuration / segmentDuration);
    console.log(`[VideoSegmentCompositor] Creating ${targetDuration}s video from ${segmentsNeeded} segments`);

    // Extract random segments from available videos
    const segmentPaths = [];
    const usedVideos = new Set();

    for (let i = 0; i < segmentsNeeded; i++) {
      // Select a random video (can reuse videos if needed)
      let selectedVideo = videoPaths[Math.floor(Math.random() * videoPaths.length)];
      
      // Try to use different videos when possible
      if (videoPaths.length > 1 && usedVideos.size < videoPaths.length) {
        const unusedVideos = videoPaths.filter(v => !usedVideos.has(v));
        if (unusedVideos.length > 0) {
          selectedVideo = unusedVideos[Math.floor(Math.random() * unusedVideos.length)];
        }
      }
      usedVideos.add(selectedVideo);

      try {
        const segmentPath = await this.extractRandomSegment(selectedVideo, segmentDuration);
        segmentPaths.push(segmentPath);
        console.log(`[VideoSegmentCompositor] Segment ${i + 1}/${segmentsNeeded} extracted`);
      } catch (error) {
        console.warn(`[VideoSegmentCompositor] Failed to extract segment from ${path.basename(selectedVideo)}, trying another...`);
        // Try another video
        const otherVideos = videoPaths.filter(v => v !== selectedVideo);
        if (otherVideos.length > 0) {
          const fallbackVideo = otherVideos[Math.floor(Math.random() * otherVideos.length)];
          const segmentPath = await this.extractRandomSegment(fallbackVideo, segmentDuration);
          segmentPaths.push(segmentPath);
        } else {
          throw new Error('No valid videos available for segment extraction');
        }
      }
    }

    // Concatenate segments
    const outputPath = path.join(
      this.tempDir,
      `concatenated_${Date.now()}.mp4`
    );

    console.log(`[VideoSegmentCompositor] Concatenating ${segmentPaths.length} segments...`);
    await this.concatenateSegments(segmentPaths, outputPath, targetDuration);

    // Cleanup segment files
    for (const segmentPath of segmentPaths) {
      if (segmentPath !== outputPath) {
        try {
          await fs.remove(segmentPath);
        } catch (error) {
          console.warn(`[VideoSegmentCompositor] Could not cleanup segment:`, error.message);
        }
      }
    }

    return outputPath;
  }

  /**
   * Concatenate video segments using FFmpeg
   */
  async concatenateSegments(segmentPaths, outputPath, targetDuration) {
    // Create a file list for FFmpeg concat
    const concatListPath = path.join(this.tempDir, `concat_list_${Date.now()}.txt`);
    // Use absolute paths and escape properly
    const concatList = segmentPaths.map(seg => {
      const absPath = path.resolve(seg);
      return `file '${absPath.replace(/'/g, "'\\''")}'`;
    }).join('\n');
    await fs.writeFile(concatListPath, concatList);

    try {
      // Re-encode segments to ensure compatibility (concat demuxer with copy can fail)
      // Use concat filter instead for better compatibility
      await this.executeFFmpeg([
        ffmpegPath,
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c:v', 'libx264', // Re-encode video for compatibility
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', // Re-encode audio
        '-b:a', '128k',
        '-t', targetDuration.toString(), // Ensure exact duration
        '-y',
        outputPath
      ]);

      console.log(`[VideoSegmentCompositor] ✅ Concatenated video created: ${path.basename(outputPath)}`);

    } finally {
      // Cleanup concat list file
      try {
        await fs.remove(concatListPath);
      } catch (error) {
        console.warn(`[VideoSegmentCompositor] Could not cleanup concat list:`, error.message);
      }
    }
  }

  /**
   * Execute FFmpeg command
   */
  async executeFFmpeg(command) {
    return new Promise((resolve, reject) => {
      const ffmpegPath = command[0];
      const args = command.slice(1);

      console.log(`[VideoSegmentCompositor] Executing: ${ffmpegPath} ${args.slice(0, 5).join(' ')}...`);

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
          resolve();
        } else {
          console.error(`[VideoSegmentCompositor] ❌ FFmpeg failed with code: ${code}`);
          console.error(stderr.substring(stderr.length - 500)); // Last 500 chars
          reject(new Error(`FFmpeg failed with exit code ${code}`));
        }
      });

      ffmpegProcess.on('error', (error) => {
        console.error('[VideoSegmentCompositor] ❌ FFmpeg spawn error:', error);
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
      }
    } catch (error) {
      console.warn(`[VideoSegmentCompositor] Cleanup warning: ${error.message}`);
    }
  }
}

