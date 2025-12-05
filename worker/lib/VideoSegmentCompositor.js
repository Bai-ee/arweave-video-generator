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
   * Extract a 5-second segment from a video, optionally aligned to a beat
   * @param {string} videoPath - Path to source video
   * @param {number} segmentDuration - Duration of segment in seconds (default: 5)
   * @param {number} targetTime - Optional target start time (for beat alignment)
   * @param {number[]} beatPositions - Optional array of beat positions for alignment
   * @returns {Promise<string>} Path to extracted segment
   */
  async extractRandomSegment(videoPath, segmentDuration = 5, targetTime = null, beatPositions = []) {
    try {
      const videoDuration = await this.getVideoDuration(videoPath);
      
      // If video is shorter than segment duration, use the whole video
      if (videoDuration <= segmentDuration) {
        console.log(`[VideoSegmentCompositor] Video is ${videoDuration.toFixed(1)}s, using entire video`);
        return videoPath;
      }

      // Calculate start time
      let startTime;
      if (targetTime !== null && beatPositions.length > 0) {
        // Align to nearest beat
        startTime = this.alignToBeat(targetTime, beatPositions, true);
        // Ensure we don't exceed video duration
        startTime = Math.min(startTime, videoDuration - segmentDuration);
        startTime = Math.max(0, startTime);
      } else {
        // Random start time (leave room for segment duration)
        const maxStartTime = videoDuration - segmentDuration;
        startTime = Math.random() * maxStartTime;
      }

      // Generate output path
      const segmentPath = path.join(
        this.tempDir,
        `segment_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`
      );

      console.log(`[VideoSegmentCompositor] Extracting ${segmentDuration}s segment from ${path.basename(videoPath)} (start: ${startTime.toFixed(1)}s)`);

      // Extract segment using FFmpeg
      // Re-encode to ensure compatibility with concatenation and consistent frame rate
      // Extract segment with video and audio (add silent audio if missing)
      // Normalize to 30fps for consistent timebase (required for xfade transitions)
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
      ]);

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
      
      // Track as used
      const videoKey = hasFileReferences ? selectedItem.name : selectedItem;
      usedAllVideos.add(videoKey);
      
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
        console.warn(`[VideoSegmentCompositor] Trying another video...`);
        
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
      throw new Error('No valid segments to concatenate');
    }
    
    if (validSegments.length < segmentPaths.length) {
      console.warn(`[VideoSegmentCompositor] ⚠️  Only ${validSegments.length}/${segmentPaths.length} segments are valid`);
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
      
      await this.executeFFmpeg(command);
      
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
          currentOutputLabel = `v${i}`;
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
              fadeOffset = this.alignToBeat(offset, beatPositions, false);
              fadeOffset = Math.max(0, fadeOffset);
            }
            
            // Normalize timebase for xfade compatibility
            const normalizedCurrent = `v${i}_norm_prev`;
            const normalizedNext = `v${i}_norm_next`;
            filterParts.push(`[${currentOutputLabel}]setpts=PTS-STARTPTS[${normalizedCurrent}]`);
            filterParts.push(`[v${i}]setpts=PTS-STARTPTS[${normalizedNext}]`);
            
            const nextLabel = `v${i}_out`;
            filterParts.push(`[${normalizedCurrent}][${normalizedNext}]xfade=transition=fade:duration=${fadeDuration.toFixed(3)}:offset=${fadeOffset.toFixed(3)}[${nextLabel}]`);
            currentOutputLabel = nextLabel;
            currentTime += segmentDuration - fadeDuration;
          } else {
            // Quick-cut: use concat filter (normalize timebase first)
            const normalizedCurrent = `v${i}_cut_prev`;
            const normalizedNext = `v${i}_cut_next`;
            filterParts.push(`[${currentOutputLabel}]setpts=PTS-STARTPTS[${normalizedCurrent}]`);
            filterParts.push(`[v${i}]setpts=PTS-STARTPTS[${normalizedNext}]`);
            
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
      
      await this.executeFFmpeg(command);
    }

    // Verify output
    if (!await fs.pathExists(outputPath)) {
      throw new Error('Concatenated video was not created');
    }
    const outputStats = await fs.stat(outputPath);
    if (outputStats.size === 0) {
      throw new Error('Concatenated video is empty');
    }

      console.log(`[VideoSegmentCompositor] ✅ Concatenated video with transitions created: ${path.basename(outputPath)} (${(outputStats.size / 1024 / 1024).toFixed(2)}MB)`);
    } catch (error) {
      console.error(`[VideoSegmentCompositor] ❌ Concatenation with transitions failed:`, error.message);
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

