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
      // Verify file exists first
      if (!await fs.pathExists(videoPath)) {
        throw new Error(`Video file does not exist: ${videoPath}`);
      }
      
      // Try using ffprobe first (more reliable, available in GitHub Actions)
      try {
        const ffprobePath = process.env.GITHUB_ACTIONS === 'true' ? 'ffprobe' : 'ffprobe';
        const command = `${ffprobePath} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
        const duration = parseFloat(execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim());
        if (!isNaN(duration) && duration > 0) {
          return duration;
        }
      } catch (ffprobeError) {
        // ffprobe not available or failed, fall through to ffmpeg method
      }
      
      // Fallback: Use ffmpeg to get duration (works even if ffprobe not available)
      // Use spawn instead of execSync to properly capture stderr
      return new Promise((resolve, reject) => {
        const ffmpegProcess = spawn(ffmpegPath, ['-i', videoPath], { stdio: ['ignore', 'pipe', 'pipe'] });
        
        let stderr = '';
        let stdout = '';
        
        ffmpegProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        ffmpegProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        ffmpegProcess.on('close', (code) => {
          // FFmpeg always exits with non-zero when using -i without output, but stderr contains the info
          const output = stderr || stdout;
          
          // Extract duration from ffmpeg output: "Duration: HH:MM:SS.mmm"
          const durationMatch = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.?\d*)/);
          if (durationMatch) {
            const hours = parseFloat(durationMatch[1]);
            const minutes = parseFloat(durationMatch[2]);
            const seconds = parseFloat(durationMatch[3]);
            const duration = hours * 3600 + minutes * 60 + seconds;
            
            if (!isNaN(duration) && duration > 0) {
              resolve(duration);
              return;
            }
          }
          
          // If we can't parse duration, check if video has any streams
          if (output.includes('Stream #') && output.includes('Video:')) {
            // Video has streams but we can't get duration - might be corrupted or unusual format
            reject(new Error('Video has streams but duration cannot be determined - may be corrupted'));
          } else {
            reject(new Error('Video file appears to have no video streams or is corrupted'));
          }
        });
        
        ffmpegProcess.on('error', (error) => {
          reject(new Error(`FFmpeg error: ${error.message}`));
        });
      });
    } catch (error) {
      console.error(`[VideoSegmentCompositor] Error getting video duration:`, error.message);
      throw new Error(`Cannot determine video duration for ${path.basename(videoPath)}: ${error.message}`);
    }
  }

  /**
   * Extract a 5-second segment from a video, optionally aligned to a beat
   * @param {string} videoPath - Path to source video
   * @param {number} segmentDuration - Duration of segment in seconds (default: 5)
   * @param {number} targetTime - Optional target start time (for beat alignment)
   * @param {number[]} beatPositions - Optional array of beat positions for alignment
   * @returns {Promise<string>} Path to extracted segment
   */
  async extractRandomSegment(videoPath, segmentDuration = 5, targetTime = null, beatPositions = []) {
    try {
      // Verify video file exists and is readable
      if (!await fs.pathExists(videoPath)) {
        throw new Error(`Video file does not exist: ${videoPath}`);
      }
      
      const stats = await fs.stat(videoPath);
      if (stats.size < 1024) { // Less than 1KB is definitely invalid
        throw new Error(`Video file is too small (${stats.size} bytes) - likely corrupted`);
      }
      
      let videoDuration;
      try {
        videoDuration = await this.getVideoDuration(videoPath);
      } catch (durationError) {
        // If we can't get duration, this video is problematic - skip it
        throw new Error(`Cannot extract from video (duration detection failed): ${durationError.message}`);
      }
      
      // If video is shorter than segment duration, use the whole video
      if (videoDuration <= segmentDuration) {
        console.log(`[VideoSegmentCompositor] Video is ${videoDuration.toFixed(1)}s, using entire video`);
        return videoPath;
      }

      // Calculate start time
      let startTime;
      if (targetTime !== null && beatPositions.length > 0) {
        // Align to nearest beat
        const originalTime = targetTime;
        startTime = this.alignToBeat(targetTime, beatPositions, true);
        const beatOffset = Math.abs(startTime - originalTime);
        if (beatOffset > 0.01) {
          console.log(`[VideoSegmentCompositor] 🎵 Beat alignment: ${originalTime.toFixed(3)}s → ${startTime.toFixed(3)}s (offset: ${beatOffset.toFixed(3)}s)`);
        } else {
          console.log(`[VideoSegmentCompositor] 🎵 Beat alignment: ${startTime.toFixed(3)}s (already on beat)`);
        }
        // Ensure we don't exceed video duration
        startTime = Math.min(startTime, videoDuration - segmentDuration);
        startTime = Math.max(0, startTime);
      } else {
        // Random start time (leave room for segment duration)
        const maxStartTime = videoDuration - segmentDuration;
        startTime = Math.random() * maxStartTime;
        if (beatPositions.length > 0) {
          console.log(`[VideoSegmentCompositor] ⚠️  No targetTime provided, using random start (not beat-aligned)`);
        }
      }

      // Generate output path
      const segmentPath = path.join(
        this.tempDir,
        `segment_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`
      );

      // Ensure startTime is within valid bounds
      const maxStartTime = Math.max(0, videoDuration - segmentDuration);
      if (startTime > maxStartTime) {
        startTime = Math.max(0, maxStartTime);
        console.warn(`[VideoSegmentCompositor] ⚠️  Adjusted startTime to ${startTime.toFixed(1)}s (video is ${videoDuration.toFixed(1)}s)`);
      }
      
      // If video is too short, use what we can
      if (videoDuration < segmentDuration) {
        console.warn(`[VideoSegmentCompositor] ⚠️  Video is only ${videoDuration.toFixed(1)}s, extracting ${videoDuration.toFixed(1)}s segment instead of ${segmentDuration}s`);
      }

      console.log(`[VideoSegmentCompositor] Extracting ${segmentDuration}s segment from ${path.basename(videoPath)} (start: ${startTime.toFixed(1)}s, video duration: ${videoDuration.toFixed(1)}s)`);

      // Extract segment using FFmpeg
      // Re-encode to ensure compatibility with concatenation and consistent frame rate
      // Extract segment with video and audio (add silent audio if missing)
      // Normalize to 30fps for consistent timebase (required for xfade transitions)
      try {
        await this.executeFFmpeg([
          ffmpegPath,
          '-i', videoPath,
          '-f', 'lavfi',
          '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-ss', startTime.toString(),
          '-t', segmentDuration.toString(),
          '-filter_complex', '[0:v]scale=720:720:force_original_aspect_ratio=increase,crop=720:720,fps=30,format=yuv420p[v];[1:a]atrim=0:' + segmentDuration.toString() + '[a]',
          '-map', '[v]',
          '-map', '[a]',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-r', '30', // Ensure 30fps output
          '-g', '30', // GOP size for better seeking
          '-c:a', 'aac',
          '-b:a', '128k',
          '-avoid_negative_ts', 'make_zero',
          '-y',
          segmentPath
        ], segmentPath, 100 * 1024); // Minimum 100KB for a 5s segment
      } catch (ffmpegError) {
        // Clean up invalid output file if it exists
        if (await fs.pathExists(segmentPath)) {
          await fs.remove(segmentPath).catch(() => {});
        }
        throw new Error(`FFmpeg extraction failed: ${ffmpegError.message}`);
      }

      // Validate output file was created and is valid
      if (!await fs.pathExists(segmentPath)) {
        throw new Error(`Segment file was not created: ${segmentPath}`);
      }
      
      const segmentStats = await fs.stat(segmentPath);
      if (segmentStats.size < 10240) { // Less than 10KB is definitely invalid
        await fs.remove(segmentPath).catch(() => {});
        throw new Error(`Segment file is too small (${segmentStats.size} bytes) - FFmpeg extraction likely failed`);
      }

      return segmentPath;

    } catch (error) {
      console.error(`[VideoSegmentCompositor] Error extracting segment:`, error.message);
      throw error;
    }
  }

  /**
   * Align a time to the nearest beat position
   * @param {number} time - Time in seconds
   * @param {number[]} beatPositions - Array of beat positions
   * @param {boolean} strict - If true, always align; if false, allow ±0.2s deviation
   * @returns {number} Aligned time
   */
  alignToBeat(time, beatPositions, strict = true) {
    if (beatPositions.length === 0) return time;
    
    const nearestBeat = beatPositions.reduce((prev, curr) => 
      Math.abs(curr - time) < Math.abs(prev - time) ? curr : prev
    );
    const deviation = Math.abs(nearestBeat - time);
    
    if (strict || deviation < 0.2) {
      return nearestBeat;
    }
    return time; // Allow deviation for fades
  }

  /**
   * Detect BPM from audio file using FFmpeg
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<number>} Detected BPM (defaults to 120 if detection fails)
   */
  async detectBPM(audioPath) {
    try {
      if (!await fs.pathExists(audioPath)) {
        console.warn(`[VideoSegmentCompositor] Audio file not found for BPM detection: ${audioPath}`);
        return 120; // Default BPM
      }

      // Use FFmpeg's silencedetect to find audio events/peaks
      // Analyze the gaps between events to estimate BPM
      const command = [
        ffmpegPath,
        '-i', audioPath,
        '-af', 'silencedetect=noise=-50dB:duration=0.1',
        '-f', 'null',
        '-'
      ];

      return new Promise((resolve) => {
        let stderr = '';
        const ffmpegProcess = spawn(ffmpegPath, command.slice(1), { stdio: 'pipe' });

        ffmpegProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        ffmpegProcess.on('close', (code) => {
          // Parse silence_detect output to find audio events
          const silenceMatches = stderr.match(/silence_start: ([\d.]+)/g);
          const silenceEnds = stderr.match(/silence_end: ([\d.]+)/g);
          
          if (silenceMatches && silenceMatches.length > 2) {
            // Extract timestamps
            const starts = silenceMatches.map(m => parseFloat(m.match(/[\d.]+/)[0]));
            const ends = silenceEnds ? silenceEnds.map(m => parseFloat(m.match(/[\d.]+/)[0])) : [];
            
            // Calculate intervals between events
            const intervals = [];
            for (let i = 1; i < starts.length; i++) {
              intervals.push(starts[i] - starts[i - 1]);
            }
            
            if (intervals.length > 0) {
              // Find most common interval (likely beat interval)
              const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
              const bpm = 60 / avgInterval;
              
              // Clamp to reasonable range (60-180 BPM)
              const clampedBPM = Math.max(60, Math.min(180, Math.round(bpm)));
              console.log(`[VideoSegmentCompositor] Detected BPM: ${clampedBPM} (from ${intervals.length} intervals)`);
              resolve(clampedBPM);
              return;
            }
          }
          
          // Fallback: Try analyzing audio peaks with astats
          console.warn(`[VideoSegmentCompositor] Could not detect BPM from silence, using default 120 BPM`);
          resolve(120);
        });

        ffmpegProcess.on('error', () => {
          console.warn(`[VideoSegmentCompositor] FFmpeg error during BPM detection, using default 120 BPM`);
          resolve(120);
        });
      });
    } catch (error) {
      console.warn(`[VideoSegmentCompositor] BPM detection error: ${error.message}, using default 120 BPM`);
      return 120;
    }
  }

  /**
   * Create a 30-second video from multiple 5-second segments with transitions and beat sync
   * @param {string[]|Object} videoPaths - Array of source video paths OR grouped object { skyline: [...], chicago: [...] }
   * @param {number} targetDuration - Target duration in seconds (default: 30)
   * @param {number} segmentDuration - Duration of each segment in seconds (default: 5)
   * @param {string} audioPath - Optional path to audio file for BPM detection
   * @returns {Promise<string>} Path to concatenated video
   */
  async createVideoFromSegments(videoPaths, targetDuration = 30, segmentDuration = 5, audioPath = null) {
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

    // Detect BPM if audio path provided
    let bpm = 120;
    let beatPositions = [];
    let beatInterval = 0.5; // Default: 120 BPM = 0.5s per beat
    
    if (audioPath) {
      console.log(`[VideoSegmentCompositor] Detecting BPM from audio: ${audioPath}`);
      bpm = await this.detectBPM(audioPath);
      beatInterval = 60 / bpm;
      
      // Generate beat positions for the entire duration
      for (let beat = 0; beat <= targetDuration; beat += beatInterval) {
        beatPositions.push(beat);
      }
      console.log(`[VideoSegmentCompositor] BPM: ${bpm}, Beat interval: ${beatInterval.toFixed(3)}s, ${beatPositions.length} beats`);
    }

    // Extract random segments with equal distribution
    const segmentPaths = [];
    const transitionTypes = []; // Store transition type for each segment boundary
    const usedAllVideos = new Set(); // Global tracking across all folders
    
    // Collect all videos for tracking (regardless of folder)
    const allVideosList = [];
    Object.values(folderMap).forEach(videos => {
      videos.forEach(v => {
        if (typeof v === 'string') {
          allVideosList.push(v);
        } else if (v && v.name) {
          allVideosList.push(v.name);
        }
      });
    });
    
    const totalVideosAvailable = allVideosList.length;
    console.log(`[VideoSegmentCompositor] Total videos available: ${totalVideosAvailable}`);

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

      // Select video from any folder (global tracking, no repeats until all used)
      let availableVideos = [];
      
      // Collect all available videos from all folders
      for (const folder of allFolders) {
        for (const v of folder.videos) {
          const videoKey = hasFileReferences ? v.name : v;
          if (!usedAllVideos.has(videoKey)) {
            availableVideos.push({ video: v, folder: folder.name });
          }
        }
      }
      
      // If no available videos, check if all have been used
      if (availableVideos.length === 0) {
        if (usedAllVideos.size >= totalVideosAvailable && totalVideosAvailable > 0) {
          // All videos used, reset and allow repeats
          console.log(`[VideoSegmentCompositor] All ${totalVideosAvailable} videos used, resetting and allowing repeats`);
          usedAllVideos.clear();
          // Re-collect all videos
          for (const folder of allFolders) {
            for (const v of folder.videos) {
              availableVideos.push({ video: v, folder: folder.name });
            }
          }
        } else {
          throw new Error(`Not enough unique videos available. Need ${segmentsNeeded} segments but only ${totalVideosAvailable} videos available.`);
        }
      }
      
      // Randomly select from available videos
      const selected = availableVideos[Math.floor(Math.random() * availableVideos.length)];
      sourceFolder = selected.folder;
      const selectedItem = selected.video;
      
      // Track as used (prevent repeats)
      const videoKey = hasFileReferences ? selectedItem.name : selectedItem;
      usedAllVideos.add(videoKey);
      
      // Log selection to verify no repeats
      const videoDisplayName = hasFileReferences ? selectedItem.name : path.basename(selectedItem);
      console.log(`[VideoSegmentCompositor] 🎬 Selected video ${i + 1}/${segmentsNeeded}: ${videoDisplayName} from ${sourceFolder} (${usedAllVideos.size}/${totalVideosAvailable} used)`);
      
      if (hasFileReferences) {
        selectedFileRef = selectedItem;
      } else {
        selectedVideo = selectedItem;
      }

      try {
        // Download video if we have a file reference
        if (hasFileReferences && selectedFileRef) {
          console.log(`[VideoSegmentCompositor] Downloading video: ${selectedFileRef.name} from ${sourceFolder}...`);
          selectedVideo = await videoLoader.downloadVideoFile(selectedFileRef, sourceFolder);
          if (!selectedVideo || !await fs.pathExists(selectedVideo)) {
            throw new Error(`Downloaded video file not found: ${selectedVideo}`);
          }
          console.log(`[VideoSegmentCompositor] ✅ Video downloaded: ${path.basename(selectedVideo)}`);
        }
        
        if (!selectedVideo) {
          throw new Error('No video selected for segment extraction');
        }
        
        if (!await fs.pathExists(selectedVideo)) {
          throw new Error(`Video file does not exist: ${selectedVideo}`);
        }
        
        // Calculate target time for beat alignment
        const segmentStartTime = i * segmentDuration;
        const targetTime = beatPositions.length > 0 ? segmentStartTime : null;
        
        console.log(`[VideoSegmentCompositor] Extracting segment ${i + 1}/${segmentsNeeded} from ${path.basename(selectedVideo)}...`);
        const segmentPath = await this.extractRandomSegment(selectedVideo, segmentDuration, targetTime, beatPositions);
        
        // Determine transition type for this segment boundary (random: quick-cut or quick-fade)
        if (i < segmentsNeeded - 1) { // No transition after last segment
          const useFade = Math.random() < 0.5; // 50% chance of fade
          const fadeDuration = useFade ? 0.5 + Math.random() * 0.5 : 0; // 0.5-1.0s for fades
          transitionTypes.push({
            type: useFade ? 'fade' : 'cut',
            duration: fadeDuration
          });
        }
        
        if (!segmentPath || !await fs.pathExists(segmentPath)) {
          throw new Error(`Extracted segment file not found: ${segmentPath}`);
        }
        
        // Validate segment size (must be at least 10KB to be valid)
        const segmentStats = await fs.stat(segmentPath);
        if (segmentStats.size < 10240) {
          console.warn(`[VideoSegmentCompositor] ⚠️  Segment ${i + 1} is too small (${segmentStats.size} bytes), retrying...`);
          // Remove invalid segment and try again with a different video
          await fs.remove(segmentPath).catch(() => {});
          throw new Error(`Segment too small: ${segmentStats.size} bytes`);
        }
        
        segmentPaths.push(segmentPath);
        console.log(`[VideoSegmentCompositor] ✅ Segment ${i + 1}/${segmentsNeeded} extracted from ${sourceFolder} folder (${(segmentStats.size / 1024).toFixed(1)}KB)`);
      } catch (error) {
        const videoName = hasFileReferences ? (selectedFileRef?.name || 'unknown') : path.basename(selectedVideo || 'unknown');
        console.error(`[VideoSegmentCompositor] ❌ Failed to extract segment from ${videoName}`);
        console.error(`[VideoSegmentCompositor] Error: ${error.message}`);
        console.warn(`[VideoSegmentCompositor] Trying another video (ensuring no repeats)...`);
        
        // Try another video from ANY folder, but ensure it hasn't been used yet
        let fallbackVideo = null;
        let fallbackFileRef = null;
        let fallbackFolder = null;
        
        // Collect all unused videos from all folders (not just the same folder)
        const unusedVideos = [];
        for (const folder of allFolders) {
          for (const v of folder.videos) {
            const videoKey = hasFileReferences ? v.name : v;
            // Skip if already used OR if it's the one that just failed
            if (usedAllVideos.has(videoKey)) continue;
            if (hasFileReferences && selectedFileRef && v.name === selectedFileRef.name) continue;
            if (!hasFileReferences && selectedVideo && v === selectedVideo) continue;
            
            unusedVideos.push({ video: v, folder: folder.name });
          }
        }
        
        if (unusedVideos.length > 0) {
          // Randomly select from unused videos
          const fallback = unusedVideos[Math.floor(Math.random() * unusedVideos.length)];
          fallbackFolder = fallback.folder;
          
          if (hasFileReferences) {
            fallbackFileRef = fallback.video;
          } else {
            fallbackVideo = fallback.video;
          }
        }
        
        // Try fallback videos with retry logic (up to 3 attempts)
        let fallbackSuccess = false;
        let attempts = 0;
        const maxFallbackAttempts = 3;
        
        while (!fallbackSuccess && attempts < maxFallbackAttempts && unusedVideos.length > 0) {
          attempts++;
          
          // Select a random unused video
          const fallbackIndex = Math.floor(Math.random() * unusedVideos.length);
          const fallback = unusedVideos[fallbackIndex];
          fallbackFolder = fallback.folder;
          
          // Remove from unused list to prevent retrying same video
          unusedVideos.splice(fallbackIndex, 1);
          
          let fallbackKey = null;
          try {
            if (hasFileReferences) {
              fallbackFileRef = fallback.video;
              fallbackKey = fallbackFileRef.name;
              // Mark as used BEFORE downloading to prevent race conditions
              usedAllVideos.add(fallbackKey);
              
              fallbackVideo = await videoLoader.downloadVideoFile(fallbackFileRef, fallbackFolder);
            } else {
              fallbackVideo = fallback.video;
              fallbackKey = fallbackVideo;
              // Mark as used
              usedAllVideos.add(fallbackKey);
            }
            
            const segmentPath = await this.extractRandomSegment(fallbackVideo, segmentDuration);
            
            // Validate segment
            const segmentStats = await fs.stat(segmentPath);
            if (segmentStats.size < 10240) {
              // Segment too small, remove from used set and try another
              usedAllVideos.delete(fallbackKey);
              console.warn(`[VideoSegmentCompositor] ⚠️  Fallback attempt ${attempts}: segment too small (${segmentStats.size} bytes), trying another...`);
              await fs.remove(segmentPath).catch(() => {});
              continue; // Try next video
            }
            
            // Success! Add segment
            segmentPaths.push(segmentPath);
            const folderName = fallbackFolder || 'unknown';
            console.log(`[VideoSegmentCompositor] ✅ Fallback segment ${i + 1}/${segmentsNeeded} extracted from ${folderName} folder (${(segmentStats.size / 1024).toFixed(1)}KB) - attempt ${attempts}`);
            fallbackSuccess = true;
          } catch (fallbackError) {
            // If this fallback failed, remove from used set and try another
            if (fallbackKey) {
              usedAllVideos.delete(fallbackKey);
            }
            console.warn(`[VideoSegmentCompositor] ⚠️  Fallback attempt ${attempts} failed: ${fallbackError.message}, trying another...`);
            // Continue to next attempt
          }
        }
        
        if (!fallbackSuccess) {
          throw new Error(`Failed to extract segment after ${attempts} fallback attempts. No valid unused videos available.`);
        }
      }
    }

    // Concatenate segments with transitions
    const outputPath = path.join(
      this.tempDir,
      `concatenated_${Date.now()}.mp4`
    );

    console.log(`[VideoSegmentCompositor] Concatenating ${segmentPaths.length} segments with transitions...`);
    console.log(`[VideoSegmentCompositor] Transitions: ${transitionTypes.map(t => t.type).join(', ')}`);
    await this.concatenateSegmentsWithTransitions(segmentPaths, outputPath, targetDuration, transitionTypes, beatPositions);

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
   * Concatenate video segments with transitions (quick-cuts and quick-fades)
   */
  async concatenateSegmentsWithTransitions(segmentPaths, outputPath, targetDuration, transitionTypes, beatPositions = []) {
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

    // Verify segments are valid before concatenation
    console.log(`[VideoSegmentCompositor] Verifying ${segmentPaths.length} segments before concatenation...`);
    const validSegments = [];
    for (const segPath of segmentPaths) {
      const stats = await fs.stat(segPath);
      if (stats.size < 1000) { // Less than 1KB is likely corrupted
        console.warn(`[VideoSegmentCompositor] ⚠️  Skipping segment ${path.basename(segPath)}: too small (${stats.size} bytes)`);
        continue;
      }
      validSegments.push(segPath);
    }
    
    if (validSegments.length === 0) {
      const errorMsg = `No valid segments to concatenate (all ${segmentPaths.length} segments failed or were too small)`;
      console.error(`[VideoSegmentCompositor] ❌ ${errorMsg}`);
      console.error(`[VideoSegmentCompositor] 💡 This usually means:`);
      console.error(`[VideoSegmentCompositor]    1. Videos in selected folders are corrupted or too short`);
      console.error(`[VideoSegmentCompositor]    2. Videos are shorter than ${segmentDuration}s and can't extract segments`);
      console.error(`[VideoSegmentCompositor]    3. FFmpeg extraction is failing for all videos`);
      throw new Error(errorMsg);
    }
    
    if (validSegments.length < segmentPaths.length) {
      const missingCount = segmentPaths.length - validSegments.length;
      console.warn(`[VideoSegmentCompositor] ⚠️  Only ${validSegments.length}/${segmentPaths.length} segments are valid (${missingCount} failed)`);
      console.warn(`[VideoSegmentCompositor] ⚠️  Video will be shorter than target duration (${targetDuration}s)`);
      
      // Calculate actual duration we'll get
      const actualDuration = validSegments.length * segmentDuration;
      if (actualDuration < targetDuration * 0.5) {
        console.error(`[VideoSegmentCompositor] ❌ Too few valid segments (${validSegments.length}) for target duration (${targetDuration}s)`);
        console.error(`[VideoSegmentCompositor] ❌ Actual duration would be only ${actualDuration}s (${((actualDuration / targetDuration) * 100).toFixed(0)}% of target)`);
        throw new Error(`Insufficient valid segments: only ${validSegments.length}/${segmentPaths.length} segments valid, would result in ${actualDuration}s video (need at least ${Math.ceil(targetDuration * 0.5)}s)`);
      }
    }

    // Check if we have any fades - if all are cuts, use simpler concat demuxer
    const hasFades = transitionTypes.some(t => t.type === 'fade');
    
    try {
      if (!hasFades) {
      // All quick-cuts: use simple concat demuxer (faster and simpler)
      console.log(`[VideoSegmentCompositor] All transitions are quick-cuts, using concat demuxer...`);
      const concatListPath = path.join(this.tempDir, `concat_list_${Date.now()}.txt`);
      const concatList = validSegments.map(seg => {
        const absPath = path.resolve(seg);
        return `file '${absPath.replace(/'/g, "'\\''")}'`;
      }).join('\n');
      await fs.writeFile(concatListPath, concatList);
      
      const command = [
        ffmpegPath,
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-t', targetDuration.toString(),
        '-y',
        outputPath
      ];
      
      await this.executeFFmpeg(command, outputPath, 5 * 1024 * 1024); // Minimum 5MB for 30s video
      
      // Cleanup
      try {
        await fs.remove(concatListPath);
      } catch (e) {
        // Ignore
      }
    } else {
      // Mix of cuts and fades: use filter_complex with xfade
      console.log(`[VideoSegmentCompositor] Building filter_complex with fades and cuts...`);
      
      const numSegments = validSegments.length;
      const filterParts = [];
      let currentOutputLabel = '';
      let currentTime = 0;
      const segmentDuration = 5;

      // Scale and normalize all segments first (with consistent frame rate and timebase for xfade)
      for (let i = 0; i < numSegments; i++) {
        filterParts.push(`[${i}:v]scale=720:720:force_original_aspect_ratio=increase,crop=720:720,fps=30,format=yuv420p[v${i}]`);
      }

      // Chain segments with transitions
      for (let i = 0; i < numSegments; i++) {
        if (i === 0) {
          // First segment: normalize framerate and timebase
          filterParts.push(`[v${i}]fps=30,setpts=PTS-STARTPTS[v${i}_start]`);
          currentOutputLabel = `v${i}_start`;
        } else {
          const transition = transitionTypes[i - 1] || { type: 'cut', duration: 0 };
          
          if (transition.type === 'fade') {
            // Quick-fade: crossfade transition
            // Normalize timebase first to avoid xfade errors
            const fadeDuration = transition.duration;
            const offset = Math.max(0, currentTime + segmentDuration - fadeDuration);
            
            // Align fade start to beat if possible (flexible sync)
            let fadeOffset = offset;
            if (beatPositions.length > 0) {
              const originalOffset = fadeOffset;
              fadeOffset = this.alignToBeat(offset, beatPositions, false);
              fadeOffset = Math.max(0, fadeOffset);
              const beatOffset = Math.abs(fadeOffset - originalOffset);
              if (beatOffset > 0.01) {
                console.log(`[VideoSegmentCompositor] 🎵 Transition beat alignment: ${originalOffset.toFixed(3)}s → ${fadeOffset.toFixed(3)}s (offset: ${beatOffset.toFixed(3)}s)`);
              }
            }
            
            // Normalize timebase and framerate for xfade compatibility
            // xfade requires consistent timebase (1/30) and framerate (30fps)
            const normalizedCurrent = `v${i}_norm_prev`;
            const normalizedNext = `v${i}_norm_next`;
            filterParts.push(`[${currentOutputLabel}]fps=30,setpts=PTS-STARTPTS[${normalizedCurrent}]`);
            filterParts.push(`[v${i}]fps=30,setpts=PTS-STARTPTS[${normalizedNext}]`);
            
            const nextLabel = `v${i}_out`;
            filterParts.push(`[${normalizedCurrent}][${normalizedNext}]xfade=transition=fade:duration=${fadeDuration.toFixed(3)}:offset=${fadeOffset.toFixed(3)}[${nextLabel}]`);
            currentOutputLabel = nextLabel;
            currentTime += segmentDuration - fadeDuration;
          } else {
            // Quick-cut: use concat filter (normalize timebase and framerate first)
            const normalizedCurrent = `v${i}_cut_prev`;
            const normalizedNext = `v${i}_cut_next`;
            filterParts.push(`[${currentOutputLabel}]fps=30,setpts=PTS-STARTPTS[${normalizedCurrent}]`);
            filterParts.push(`[v${i}]fps=30,setpts=PTS-STARTPTS[${normalizedNext}]`);
            
            const nextLabel = `v${i}_out`;
            filterParts.push(`[${normalizedCurrent}][${normalizedNext}]concat=n=2:v=1:a=0[${nextLabel}]`);
            currentOutputLabel = nextLabel;
            currentTime += segmentDuration;
          }
        }
      }

      const filterComplex = filterParts.join(';');
      const finalOutput = `[${currentOutputLabel}]`;
      
      console.log(`[VideoSegmentCompositor] Filter complex length: ${filterComplex.length} chars`);
      
      const command = [
        ffmpegPath,
        ...validSegments.flatMap(seg => ['-i', seg]),
        '-filter_complex', filterComplex,
        '-map', finalOutput,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-t', targetDuration.toString(),
        '-y',
        outputPath
      ];
      
      await this.executeFFmpeg(command, outputPath, 5 * 1024 * 1024); // Minimum 5MB for 30s video
    }

    // Verify output (executeFFmpeg already validated size, but double-check)
    if (!await fs.pathExists(outputPath)) {
      throw new Error('Concatenated video was not created');
    }
    const outputStats = await fs.stat(outputPath);
    const minSize = 5 * 1024 * 1024; // 5MB minimum for 30s video
    if (outputStats.size < minSize) {
      throw new Error(`Concatenated video too small: ${(outputStats.size / 1024 / 1024).toFixed(2)}MB (minimum: 5MB)`);
    }

    console.log(`[VideoSegmentCompositor] ✅ Concatenated video with transitions created: ${path.basename(outputPath)} (${(outputStats.size / 1024 / 1024).toFixed(2)}MB)`);
    } catch (error) {
      console.error(`[VideoSegmentCompositor] ❌ Concatenation with transitions failed:`, error.message);
      console.error(`[VideoSegmentCompositor] Error details:`, error.stack);
      // If any concatenation fails (filter_complex, xfade, or other), try simple concat as fallback
      // This handles cases where complex transitions fail due to codec/format issues
      if (hasFades || error.message.includes('FFmpeg failed')) {
        console.warn(`[VideoSegmentCompositor] ⚠️  Complex concatenation failed, trying simple concat fallback...`);
        try {
          // Fallback to simple concat demuxer
          const concatListPath = path.join(this.tempDir, `concat_list_fallback_${Date.now()}.txt`);
          const concatList = validSegments.map(seg => {
            const absPath = path.resolve(seg);
            return `file '${absPath.replace(/'/g, "'\\''")}'`;
          }).join('\n');
          await fs.writeFile(concatListPath, concatList);
          
          const fallbackCommand = [
            ffmpegPath,
            '-f', 'concat',
            '-safe', '0',
            '-i', concatListPath,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-t', targetDuration.toString(),
            '-y',
            outputPath
          ];
          
          await this.executeFFmpeg(fallbackCommand, outputPath, 5 * 1024 * 1024); // Minimum 5MB for 30s video
          
          // Cleanup
          await fs.remove(concatListPath).catch(() => {});
          
          // Verify fallback output (executeFFmpeg already validated size, but double-check)
          if (await fs.pathExists(outputPath)) {
            const fallbackStats = await fs.stat(outputPath);
            const minSize = 5 * 1024 * 1024; // 5MB minimum for 30s video
            if (fallbackStats.size >= minSize) {
              console.log(`[VideoSegmentCompositor] ✅ Fallback concatenation successful: ${path.basename(outputPath)} (${(fallbackStats.size / 1024 / 1024).toFixed(2)}MB)`);
              return; // Success with fallback
            } else {
              throw new Error(`Fallback concatenation produced file too small: ${(fallbackStats.size / 1024 / 1024).toFixed(2)}MB (minimum: 5MB)`);
            }
          } else {
            throw new Error('Fallback concatenation did not produce output file');
          }
        } catch (fallbackError) {
          console.error(`[VideoSegmentCompositor] ❌ Fallback concatenation also failed:`, fallbackError.message);
        }
      }
      throw error;
    }
  }

  /**
   * Concatenate video segments using FFmpeg (legacy method, kept for backward compatibility)
   */
  async concatenateSegments(segmentPaths, outputPath, targetDuration) {
    // Fallback to old method if needed
    return this.concatenateSegmentsWithTransitions(segmentPaths, outputPath, targetDuration, [], []);
  }

  /**
   * Execute FFmpeg command
   * @param {Array} command - FFmpeg command array
   * @param {string} outputPath - Optional output path to validate after execution
   * @param {number} minSizeBytes - Minimum expected file size in bytes (default: 1MB)
   */
  async executeFFmpeg(command, outputPath = null, minSizeBytes = 1024 * 1024) {
    return new Promise(async (resolve, reject) => {
      const ffmpegPath = command[0];
      const args = command.slice(1);

      // Extract output path from command if not provided
      if (!outputPath) {
        const outputIndex = args.indexOf('-y');
        if (outputIndex >= 0 && outputIndex < args.length - 1) {
          outputPath = args[outputIndex + 1];
        } else {
          // Last argument is usually output path
          outputPath = args[args.length - 1];
        }
      }

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

      ffmpegProcess.on('close', async (code) => {
        console.log(''); // New line after progress dots

        if (code === 0) {
          // Validate output file if path provided
          if (outputPath && await fs.pathExists(outputPath)) {
            try {
              const stats = await fs.stat(outputPath);
              if (stats.size < minSizeBytes) {
                const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
                const minMB = (minSizeBytes / 1024 / 1024).toFixed(2);
                console.error(`[VideoSegmentCompositor] ❌ Output file too small: ${sizeMB}MB (minimum: ${minMB}MB)`);
                console.error(`[VideoSegmentCompositor] ❌ This indicates FFmpeg produced a corrupted or incomplete file`);
                reject(new Error(`FFmpeg output file too small: ${sizeMB}MB (expected at least ${minMB}MB)`));
                return;
              }
              console.log(`[VideoSegmentCompositor] ✅ Output file validated: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
            } catch (statError) {
              console.warn(`[VideoSegmentCompositor] ⚠️  Could not validate output file: ${statError.message}`);
            }
          }
          resolve();
        } else {
          console.error(`[VideoSegmentCompositor] ❌ FFmpeg failed with code: ${code}`);
          // Show more of the error (last 1000 chars for better debugging)
          const errorSnippet = stderr.length > 1000 ? stderr.substring(stderr.length - 1000) : stderr;
          console.error(`[VideoSegmentCompositor] FFmpeg error output:\n${errorSnippet}`);
          reject(new Error(`FFmpeg failed with exit code ${code}: ${errorSnippet.split('\n').slice(-3).join(' ')}`));
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

