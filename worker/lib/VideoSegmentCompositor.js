/**
 * Video Segment Compositor
 * Creates a 30-second video from multiple 5-second video segments
 */

import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs-extra';
import path from 'path';
import { spawn, execSync } from 'child_process';

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
   * Get video duration using ffmpeg (via execSync)
   * Works in both local and GitHub Actions environments
   */
  async getVideoDuration(videoPath) {
    try {
      // Try using ffprobe first (more reliable, available in GitHub Actions)
      try {
        const ffprobePath = process.env.GITHUB_ACTIONS === 'true' ? 'ffprobe' : 'ffprobe';
        const command = `${ffprobePath} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
        const duration = parseFloat(execSync(command, { encoding: 'utf8' }).trim());
        if (!isNaN(duration) && duration > 0) {
          return duration;
        }
      } catch (ffprobeError) {
        // Fall through to ffmpeg method
      }
      
      // Fallback: Use ffmpeg to get duration (works even if ffprobe not available)
      // This method parses ffmpeg output which works in both environments
      const command = `${ffmpegPath} -i "${videoPath}" 2>&1`;
      const output = execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim();
      
      // Extract duration from ffmpeg output: "Duration: HH:MM:SS.mmm"
      const durationMatch = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.?\d*)/);
      if (durationMatch) {
        const hours = parseFloat(durationMatch[1]);
        const minutes = parseFloat(durationMatch[2]);
        const seconds = parseFloat(durationMatch[3]);
        const duration = hours * 3600 + minutes * 60 + seconds;
        
        if (!isNaN(duration) && duration > 0) {
          return duration;
        }
      }
      
      throw new Error('Could not parse duration from ffmpeg output');
    } catch (error) {
      console.error(`[VideoSegmentCompositor] Error getting video duration:`, error.message);
      // Fallback: assume 30 seconds if we can't determine (safe default)
      console.warn(`[VideoSegmentCompositor] Using fallback duration: 30s`);
      return 30;
    }
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
      // Extract segment with video and audio (add silent audio if missing)
      await this.executeFFmpeg([
        ffmpegPath,
        '-i', videoPath,
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-ss', startTime.toString(),
        '-t', segmentDuration.toString(),
        '-filter_complex', '[0:v]scale=720:720:force_original_aspect_ratio=increase,crop=720:720,format=yuv420p[v];[1:a]atrim=0:' + segmentDuration.toString() + '[a]',
        '-map', '[v]',
        '-map', '[a]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
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
   * @param {string[]|Object} videoPaths - Array of source video paths OR grouped object { skyline: [...], chicago: [...] }
   * @param {number} targetDuration - Target duration in seconds (default: 30)
   * @param {number} segmentDuration - Duration of each segment in seconds (default: 5)
   * @returns {Promise<string>} Path to concatenated video
   */
  async createVideoFromSegments(videoPaths, targetDuration = 30, segmentDuration = 5) {
    // Handle grouped structure with any folder combination
    let folderMap = {}; // Dynamic folder map
    let isGrouped = false;
    let isTrackMode = false;

    if (videoPaths && typeof videoPaths === 'object' && !Array.isArray(videoPaths)) {
      // Grouped structure - can have any combination of folders
      isGrouped = true;
      
      // Build dynamic folder map from whatever folders are present
      folderMap = {};
      const allFolderKeys = ['equipment', 'decks', 'skyline', 'chicago', 'neighborhood', 'artist', 'family'];
      
      for (const key of allFolderKeys) {
        if (videoPaths[key] !== undefined && Array.isArray(videoPaths[key])) {
          folderMap[key] = videoPaths[key];
        }
      }
      
      // Determine mode based on available folders
      // If we have more than just skyline/chicago, treat as track mode (equal distribution)
      const hasTrackFolders = folderMap.equipment || folderMap.decks || folderMap.neighborhood || folderMap.artist || folderMap.family;
      isTrackMode = hasTrackFolders || Object.keys(folderMap).length > 2;
      
      const total = Object.values(folderMap).reduce((sum, arr) => sum + arr.length, 0);
      if (total === 0) {
        throw new Error('No video paths provided');
      }
      
      const folderSummary = Object.entries(folderMap)
        .map(([name, arr]) => `${arr.length} ${name}`)
        .join(' + ');
      console.log(`[VideoSegmentCompositor] Using ${isTrackMode ? 'track' : 'mix'} mode: ${folderSummary}`);
    } else if (Array.isArray(videoPaths)) {
      // Flat array (backward compatibility)
      if (videoPaths.length === 0) {
        throw new Error('No video paths provided');
      }
      folderMap.skyline = videoPaths;
      folderMap.chicago = [];
      isGrouped = true;
      isTrackMode = false;
      console.log(`[VideoSegmentCompositor] Using flat array: ${videoPaths.length} videos`);
    } else {
      throw new Error('Invalid videoPaths format');
    }

    const segmentsNeeded = Math.ceil(targetDuration / segmentDuration);
    const folderCount = Object.keys(folderMap).length;
    const distributionType = isTrackMode ? `equal distribution across ${folderCount} folders` : '50/50 distribution';
    console.log(`[VideoSegmentCompositor] Creating ${targetDuration}s video from ${segmentsNeeded} segments with ${distributionType}`);

    // Extract random segments with equal distribution
    const segmentPaths = [];
    const usedVideos = {};
    
    // Initialize usedVideos sets for all folders
    Object.keys(folderMap).forEach(folder => {
      usedVideos[folder] = new Set();
    });

      // Check if we have file references (Firebase File objects) or paths (strings)
      // Check first non-empty folder array
      const firstFolderWithVideos = Object.values(folderMap).find(arr => arr.length > 0);
      const hasFileReferences = firstFolderWithVideos && typeof firstFolderWithVideos[0] !== 'string' && 
                                 typeof firstFolderWithVideos[0]?.name === 'string';
      
      // If we have file references, we need to download them on-demand
      let videoLoader = null;
      if (hasFileReferences) {
        // Lazy import VideoLoader only if needed
        const { VideoLoader } = await import('./VideoLoader.js');
        videoLoader = new VideoLoader();
      }

      for (let i = 0; i < segmentsNeeded; i++) {
      let selectedVideo = null;
      let sourceFolder = '';
      let selectedFileRef = null; // For Firebase file references

      // Convert folderMap to array of folder objects
      const allFolders = Object.entries(folderMap)
        .map(([name, videos]) => ({ name, videos }))
        .filter(f => f.videos.length > 0);

      if (allFolders.length === 0) {
        throw new Error('No valid videos available for segment extraction');
      }

      if (isTrackMode || allFolders.length > 2) {
        // Equal distribution across all folders
        // Randomly select a folder (equal chance for each)
        const selectedFolder = allFolders[Math.floor(Math.random() * allFolders.length)];
        sourceFolder = selectedFolder.name;

        // Select a video from that folder
        let availableVideos = selectedFolder.videos.filter(v => {
          // For file references, compare by name; for paths, compare directly
          if (hasFileReferences) {
            return !usedVideos[sourceFolder].has(v.name);
          } else {
            return !usedVideos[sourceFolder].has(v);
          }
        });
        
        if (availableVideos.length === 0) {
          // All videos from this folder used, reset and reuse
          availableVideos = selectedFolder.videos;
          usedVideos[sourceFolder].clear();
        }
        
        const selectedItem = availableVideos[Math.floor(Math.random() * availableVideos.length)];
        
        if (hasFileReferences) {
          // Store file reference and download on-demand
          selectedFileRef = selectedItem;
          usedVideos[sourceFolder].add(selectedItem.name);
        } else {
          // Use path directly
          selectedVideo = selectedItem;
          usedVideos[sourceFolder].add(selectedItem);
        }
      } else {
        // Mix mode: 50/50 distribution between first two folders (typically skyline and chicago)
        const folder1 = allFolders[0];
        const folder2 = allFolders[1] || folder1;
        
        const useFolder1 = Math.random() < 0.5;
        const selectedFolder = useFolder1 ? folder1 : folder2;
        sourceFolder = selectedFolder.name;
        
        let availableVideos = selectedFolder.videos.filter(v => {
          if (hasFileReferences) {
            return !usedVideos[sourceFolder].has(v.name);
          } else {
            return !usedVideos[sourceFolder].has(v);
          }
        });
        
        if (availableVideos.length === 0) {
          availableVideos = selectedFolder.videos;
          usedVideos[sourceFolder].clear();
        }
        
        const selectedItem = availableVideos[Math.floor(Math.random() * availableVideos.length)];
        
        if (hasFileReferences) {
          selectedFileRef = selectedItem;
          usedVideos[sourceFolder].add(selectedItem.name);
        } else {
          selectedVideo = selectedItem;
          usedVideos[sourceFolder].add(selectedItem);
        }
      }

      try {
        // Download video if we have a file reference
        if (hasFileReferences && selectedFileRef) {
          selectedVideo = await videoLoader.downloadVideoFile(selectedFileRef, sourceFolder);
        }
        
        const segmentPath = await this.extractRandomSegment(selectedVideo, segmentDuration);
        segmentPaths.push(segmentPath);
        console.log(`[VideoSegmentCompositor] Segment ${i + 1}/${segmentsNeeded} extracted from ${sourceFolder} folder`);
      } catch (error) {
        const videoName = hasFileReferences ? (selectedFileRef?.name || 'unknown') : path.basename(selectedVideo || 'unknown');
        console.warn(`[VideoSegmentCompositor] Failed to extract segment from ${videoName}, trying another...`);
        
        // Try another video from the same folder
        let fallbackVideo = null;
        let fallbackFileRef = null;
        const folderVideos = folderMap[sourceFolder] || [];
        if (folderVideos.length > 1) {
          if (hasFileReferences) {
            const otherVideos = folderVideos.filter(v => v.name !== selectedFileRef?.name);
            if (otherVideos.length > 0) {
              fallbackFileRef = otherVideos[Math.floor(Math.random() * otherVideos.length)];
            }
          } else {
            const otherVideos = folderVideos.filter(v => v !== selectedVideo);
            if (otherVideos.length > 0) {
              fallbackVideo = otherVideos[Math.floor(Math.random() * otherVideos.length)];
            }
          }
        }
        
        if (fallbackFileRef) {
          fallbackVideo = await videoLoader.downloadVideoFile(fallbackFileRef, sourceFolder);
          const segmentPath = await this.extractRandomSegment(fallbackVideo, segmentDuration);
          segmentPaths.push(segmentPath);
        } else if (fallbackVideo) {
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
    // Verify all segments exist and are valid
    for (const segPath of segmentPaths) {
      if (!await fs.pathExists(segPath)) {
        throw new Error(`Segment not found: ${segPath}`);
      }
      const stats = await fs.stat(segPath);
      if (stats.size === 0) {
        throw new Error(`Segment is empty: ${segPath}`);
      }
    }

    // Segments are already normalized during extraction (720x720, yuv420p, with audio)
    // Use concat demuxer directly
    const concatListPath = path.join(this.tempDir, `concat_list_${Date.now()}.txt`);
    const concatList = segmentPaths.map(seg => {
      const absPath = path.resolve(seg);
      return `file '${absPath.replace(/'/g, "'\\''")}'`;
    }).join('\n');
    await fs.writeFile(concatListPath, concatList);

    try {
      await this.executeFFmpeg([
        ffmpegPath,
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy', // Can use copy now since all segments are normalized
        '-t', targetDuration.toString(),
        '-y',
        outputPath
      ]);

      // Verify output
      if (!await fs.pathExists(outputPath)) {
        throw new Error('Concatenated video was not created');
      }
      const outputStats = await fs.stat(outputPath);
      if (outputStats.size === 0) {
        throw new Error('Concatenated video is empty');
      }

      console.log(`[VideoSegmentCompositor] ✅ Concatenated video created: ${path.basename(outputPath)} (${(outputStats.size / 1024 / 1024).toFixed(2)}MB)`);

    } catch (error) {
      console.error(`[VideoSegmentCompositor] ❌ Concatenation failed:`, error.message);
      throw error;
    } finally {
      // Cleanup concat list
      try {
        await fs.remove(concatListPath);
      } catch (error) {
        // Ignore cleanup errors
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

