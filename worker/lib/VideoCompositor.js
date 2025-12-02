import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs-extra';
import path from 'path';
import { spawn, execSync } from 'child_process';

// Configure FFmpeg path
// In GitHub Actions, prefer system FFmpeg (has drawtext filter)
// Otherwise use ffmpeg-static
let ffmpegPath = 'ffmpeg'; // Default to system FFmpeg

if (process.env.GITHUB_ACTIONS === 'true') {
  // In GitHub Actions, use system FFmpeg (installed via apt-get)
  // It has drawtext filter support
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    ffmpegPath = 'ffmpeg'; // Use system FFmpeg
    console.log('[VideoCompositor] Using system FFmpeg (GitHub Actions)');
  } catch (error) {
    // Fallback to ffmpeg-static if system FFmpeg not found
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      ffmpegPath = ffmpegStatic;
      console.log('[VideoCompositor] Using ffmpeg-static (fallback)');
    }
  }
} else {
  // Local development: try ffmpeg-static first, fallback to system
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    ffmpegPath = ffmpegStatic;
    ffmpeg.setFfmpegPath(ffmpegStatic);
    console.log('[VideoCompositor] Using ffmpeg-static');
  } else {
    try {
      execSync('ffmpeg -version', { stdio: 'ignore' });
      ffmpegPath = 'ffmpeg';
      console.log('[VideoCompositor] Using system FFmpeg');
    } catch (error) {
      console.warn('[VideoCompositor] No FFmpeg found');
    }
  }
}

/**
 * Layer configuration interface
 */
export class LayerConfig {
  constructor(type, source, position, size, opacity, zIndex, scale = 1, fontPath = null, startTime = null, duration = null) {
    this.type = type; // 'background' | 'image' | 'text'
    this.source = source; // file path or text content
    this.position = position; // { x: number, y: number }
    this.size = size; // { width: number, height: number }
    this.opacity = opacity; // 0.0 to 1.0
    this.zIndex = zIndex; // layer order
    this.scale = scale || 1; // scale factor
    this.fontPath = fontPath; // custom font path for text layers (optional)
    this.startTime = startTime; // start time in seconds (optional, for timed overlays)
    this.duration = duration; // duration in seconds (optional, for timed overlays)
  }
}

/**
 * Composition configuration
 */
export class CompositionConfig {
  constructor(baseVideo, audio, layers, outputPath, duration, width, height, videoFilter = null) {
    this.baseVideo = baseVideo; // background image/video path
    this.audio = audio; // audio file path
    this.layers = layers; // array of LayerConfig
    this.outputPath = outputPath; // output video path
    this.duration = duration; // video duration in seconds
    this.width = width || 720; // canvas width
    this.height = height || 720; // canvas height
    this.videoFilter = videoFilter; // Optional FFmpeg video filter string
  }
}

/**
 * Video Compositor - Multi-layer video composition using FFmpeg
 */
export class VideoCompositor {
  constructor() {
    this.outputDir = path.join(process.cwd(), 'outputs', 'composed-videos');
    fs.ensureDirSync(this.outputDir);
  }

  /**
   * Compose video with multiple layers
   */
  async composeVideo(config) {
    try {
      console.log('[VideoCompositor] Starting video composition...');
      console.log(`[VideoCompositor] Base: ${config.baseVideo}`);
      console.log(`[VideoCompositor] Audio: ${config.audio}`);
      console.log(`[VideoCompositor] Layers: ${config.layers.length}`);
      console.log(`[VideoCompositor] Canvas: ${config.width}x${config.height}`);

      // Verify all input files exist
      if (!await fs.pathExists(config.baseVideo)) {
        throw new Error(`Base video/image not found: ${config.baseVideo}`);
      }
      if (!await fs.pathExists(config.audio)) {
        throw new Error(`Audio file not found: ${config.audio}`);
      }

      // Verify image layer files exist (text layers don't have files)
      const imageLayers = config.layers.filter(layer => layer.type !== 'text');
      for (const layer of imageLayers) {
        if (!await fs.pathExists(layer.source)) {
          console.warn(`[VideoCompositor] Layer source not found: ${layer.source}, skipping`);
        }
      }

      // Build filter complex
      const filterComplex = this.buildFilterComplex(config);

      // Build FFmpeg command
      const command = this.buildFFmpegCommand(config, filterComplex);

      console.log('[VideoCompositor] Executing FFmpeg composition...');

      // Execute FFmpeg using spawn for better control
      return await this.executeFFmpeg(command, config.outputPath);
    } catch (error) {
      console.error('[VideoCompositor] Error composing video:', error);
      throw error;
    }
  }

  /**
   * Build FFmpeg filter complex for multi-layer composition
   */
  buildFilterComplex(config) {
    const filters = [];
    const canvasWidth = config.width;
    const canvasHeight = config.height;

    // Check if base is a video file (not an image)
    const isVideoFile = config.baseVideo.match(/\.(mp4|mov|avi|mkv|webm)$/i);

    // Scale base image/video to canvas size
    // For video backgrounds, the loop will be handled by -stream_loop in the input
    // Apply video filter if provided, otherwise apply default black and white
    let baseFilter;
    
    if (config.videoFilter) {
      // Apply custom video filter
      // Custom filters already include scale/pad operations, so apply directly to input
      baseFilter = `[0:v]${config.videoFilter}[base_scaled]`;
      console.log(`[VideoCompositor] Applying custom video filter: ${config.videoFilter.substring(0, 100)}...`);
    } else {
      // Default: scale to canvas and apply black and white
      baseFilter = `[0:v]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight},hue=s=0[base_scaled]`;
      console.log(`[VideoCompositor] Applying default black and white filter`);
    }
    
    filters.push(baseFilter);

    let currentInput = '[base_scaled]';

    // Separate layers by type
    const imageLayers = config.layers.filter(layer => layer.type !== 'text' && layer.type !== 'background');
    const textLayers = config.layers.filter(layer => layer.type === 'text');

    // Sort image layers by z-index (lower z-index first, so they're rendered in order)
    const sortedImageLayers = imageLayers.sort((a, b) => a.zIndex - b.zIndex);

    // Process image layers
    sortedImageLayers.forEach((layer, index) => {
      const inputIndex = index + 2; // +2 because 0=base, 1=audio
      const outputLabel = `[layer${index}]`;

      // Calculate final size with scale
      const finalWidth = Math.round(layer.size.width * (layer.scale || 1));
      const finalHeight = Math.round(layer.size.height * (layer.scale || 1));

      // Scale filter - maintain aspect ratio for images
      const scaleFilter = `[${inputIndex}:v]scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=decrease[scaled${index}]`;
      filters.push(scaleFilter);

      // Overlay filter with opacity and optional timing
      // FFmpeg overlay handles opacity through format and alpha channel
      const opacity = layer.opacity || 1.0;
      
      let overlayFilter;
      if (opacity < 1.0) {
        // For opacity < 1.0, add alpha channel and adjust it
        // Convert to rgba, then use geq to modify alpha channel
        filters.push(`[scaled${index}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${opacity}'[scaled${index}_alpha]`);
        
        // Add timing if specified (enable overlay only at startTime)
        if (layer.startTime !== null && layer.startTime !== undefined) {
          const endTime = layer.startTime + (layer.duration || config.duration);
          // Use overlay with enable expression to show only at specific time
          overlayFilter = `${currentInput}[scaled${index}_alpha]overlay=${layer.position.x}:${layer.position.y}:enable='between(t,${layer.startTime},${endTime})'${outputLabel}`;
        } else {
          overlayFilter = `${currentInput}[scaled${index}_alpha]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
        }
      } else {
        // Full opacity - simple overlay
        if (layer.startTime !== null && layer.startTime !== undefined) {
          const endTime = layer.startTime + (layer.duration || config.duration);
          // Use overlay with enable expression to show only at specific time
          overlayFilter = `${currentInput}[scaled${index}]overlay=${layer.position.x}:${layer.position.y}:enable='between(t,${layer.startTime},${endTime})'${outputLabel}`;
        } else {
          overlayFilter = `${currentInput}[scaled${index}]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
        }
      }
      filters.push(overlayFilter);

      currentInput = outputLabel;
    });

    // Sort text layers by z-index to ensure proper rendering order
    const sortedTextLayers = textLayers.sort((a, b) => a.zIndex - b.zIndex);

    // Process text layers
    const createdTextLabels = []; // Track which text layer labels were actually created
    sortedTextLayers.forEach((layer, index) => {
      const outputLabel = `[text_layer${index}]`;

      // Calculate font size based on layer height
      const fontSize = Math.round(layer.size.height * 0.7); // 70% of layer height

      // Escape text for FFmpeg
      const escapedText = layer.source.replace(/'/g, "\\'").replace(/:/g, "\\:");

      // FFmpeg drawtext uses x,y for top-left corner
      // If x is at canvas center (width/2), center the text using FFmpeg expression
      let xPos = layer.position.x;
      let yPos = layer.position.y;
      
      // Check if x is at canvas center (within 10px tolerance)
      const isCentered = Math.abs(xPos - (canvasWidth / 2)) < 10;
      
      // Create drawtext filter with centering if needed
      const opacity = Math.round((layer.opacity || 1.0) * 255);
      let textFilter;
      
      // Build drawtext parameters
      // Use black text for better visibility on white paper
      const drawtextParams = [
        `text='${escapedText}'`,
        `fontsize=${fontSize}`,
        `fontcolor=0x000000`, // Black text for visibility on white paper
        `borderw=4`, // Thicker border for better visibility
        `bordercolor=0xFFFFFF`, // White border for contrast
        isCentered ? `x=(w-text_w)/2` : `x=${xPos}`,
        `y=${yPos}`,
        `alpha=${opacity}` // Put alpha last - it's a simple numeric value
      ];
      
      // Add custom font if provided
      if (layer.fontPath && fs.existsSync(layer.fontPath)) {
        // Escape font path for FFmpeg drawtext filter
        // FFmpeg drawtext fontfile parameter needs special escaping:
        // - Use absolute path
        // - Escape colons with \: (for Windows paths)
        // - Escape spaces, parentheses, and single quotes
        // - Don't wrap in quotes - FFmpeg handles the path directly
        const absFontPath = path.resolve(layer.fontPath);
        // Replace backslashes with forward slashes (Windows compatibility)
        let escapedFontPath = absFontPath.replace(/\\/g, '/');
        // Escape colons (needed for Windows paths like C:)
        escapedFontPath = escapedFontPath.replace(/:/g, '\\:');
        // Escape spaces, parentheses, brackets, and other special chars that might break the filter
        escapedFontPath = escapedFontPath.replace(/([ '()\[\]])/g, '\\$1');
        // Add fontfile parameter (no quotes around the path - FFmpeg parses it directly)
        drawtextParams.splice(2, 0, `fontfile=${escapedFontPath}`);
        console.log(`[VideoCompositor] ✅ Using custom font: ${path.basename(layer.fontPath)}`);
        console.log(`[VideoCompositor] Font path (absolute): ${absFontPath}`);
        console.log(`[VideoCompositor] Font path (escaped for FFmpeg): ${escapedFontPath}`);
        console.log(`[VideoCompositor] Font exists: ${fs.existsSync(layer.fontPath)}`);
      } else {
        console.warn(`[VideoCompositor] ⚠️ No font path provided or font not found for text layer ${index}`);
        if (layer.fontPath) {
          console.warn(`[VideoCompositor] Font path was: ${layer.fontPath}`);
        }
      }
      
      textFilter = `${currentInput}drawtext=${drawtextParams.join(':')}${outputLabel}`;
      
      console.log(`[VideoCompositor] Text filter for layer ${index}: ${textFilter.substring(0, 150)}...`);
      filters.push(textFilter);
      createdTextLabels.push(outputLabel); // Track that this label was created

      currentInput = outputLabel;
    });

    // Apply video fade to black (22-25 seconds: fade out over 3 seconds, starting 8 seconds before end)
    // For 30 second video: start at 22s, fade duration 3s (ends at 25s)
    const videoFadeStart = config.duration - 8; // 22 seconds for 30s video
    const videoFadeDuration = 3; // 3 second fade
    let finalVideoLabel = currentInput; // Track final video label after fade
    if (videoFadeStart > 0 && videoFadeDuration > 0) {
      const fadeOutFilter = `${currentInput}fade=t=out:st=${videoFadeStart}:d=${videoFadeDuration}[faded_video]`;
      filters.push(fadeOutFilter);
      currentInput = '[faded_video]';
      finalVideoLabel = '[faded_video]';
      console.log(`[VideoCompositor] Adding video fade to black: ${videoFadeStart}s-${videoFadeStart + videoFadeDuration}s`);
    }

    const filterComplex = filters.join(';');
    
    // Store final video label for output mapping
    config._finalVideoLabel = finalVideoLabel;
    console.log(`[VideoCompositor] Filter complex: ${filterComplex.substring(0, 200)}...`);
    
    // Debug: Log all output labels created
    const allLabels = filterComplex.match(/\[[^\]]+\]/g) || [];
    const uniqueLabels = [...new Set(allLabels)];
    console.log(`[VideoCompositor] All labels in filter complex: ${uniqueLabels.join(', ')}`);
    
    if (createdTextLabels.length > 0) {
      const lastTextLabel = createdTextLabels[createdTextLabels.length - 1];
      console.log(`[VideoCompositor] Text layers created: ${createdTextLabels.length}, final output should be: ${lastTextLabel}`);
    } else if (imageLayers.length > 0) {
      console.log(`[VideoCompositor] Image layers: ${imageLayers.length}, final output will be: [layer${imageLayers.length - 1}]`);
    } else {
      console.log(`[VideoCompositor] No layers, final output will be: [base_scaled]`);
    }
    
    // Store created labels in config for later validation
    config._createdTextLabels = createdTextLabels;
    config._createdImageLabels = imageLayers.map((_, i) => `[layer${i}]`);
    
    return filterComplex;
  }

  /**
   * Build FFmpeg command array
   */
  buildFFmpegCommand(config, filterComplex) {
    // Use the ffmpegPath determined at module load
    // In GitHub Actions, this will be system FFmpeg (has drawtext)
    const command = [ffmpegPath];

    // Input base image/video
    const isImage = config.baseVideo.match(/\.(jpg|jpeg|png|webp)$/i);
    const isVideo = config.baseVideo.match(/\.(mp4|mov|avi|mkv|webm)$/i);
    
    if (isImage) {
      // If it's an image, loop it to create video
      command.push('-loop', '1');
      command.push('-framerate', '30');
    } else if (isVideo) {
      // For video backgrounds, we may need to loop it if it's shorter than duration
      // FFmpeg will handle this with the loop filter in filter_complex
      // Just ensure we read the full video
      command.push('-stream_loop', '-1'); // Loop input video if needed
    }
    command.push('-i', config.baseVideo);

    // Input audio
    command.push('-i', config.audio);

    // Input image layers (text layers don't need input files)
    const imageLayers = config.layers.filter(layer => layer.type !== 'text' && layer.type !== 'background');
    imageLayers.forEach(layer => {
      // Images need to be looped to create video streams
      command.push('-loop', '1');
      command.push('-framerate', '30');
      command.push('-i', layer.source);
    });

    // Filter complex
    if (filterComplex) {
      command.push('-filter_complex', filterComplex);

      // Determine final output label - use the labels that were actually created
      let finalOutput;

      // Use the tracked labels from buildFilterComplex if available
      // Check if fade was applied first (highest priority)
      if (config._finalVideoLabel && filterComplex.includes(config._finalVideoLabel)) {
        finalOutput = config._finalVideoLabel;
        console.log(`[VideoCompositor] Mapping final output: ${finalOutput} (after fade)`);
      } else if (config._createdTextLabels && config._createdTextLabels.length > 0) {
        // Use the last text layer that was actually created
        finalOutput = config._createdTextLabels[config._createdTextLabels.length - 1];
        console.log(`[VideoCompositor] Mapping final output: ${finalOutput} (${config._createdTextLabels.length} text layers created)`);
      } else if (config._createdImageLabels && config._createdImageLabels.length > 0) {
        // Use the last image layer that was actually created
        finalOutput = config._createdImageLabels[config._createdImageLabels.length - 1];
        console.log(`[VideoCompositor] Mapping final output: ${finalOutput} (${config._createdImageLabels.length} image layers created)`);
      } else {
        // Fallback: determine from layer counts
        const textLayers = config.layers.filter(layer => layer.type === 'text');
        const imageLayers = config.layers.filter(layer => layer.type !== 'text' && layer.type !== 'background');
        
        if (textLayers.length > 0) {
          finalOutput = `[text_layer${textLayers.length - 1}]`;
          console.log(`[VideoCompositor] Mapping final output: ${finalOutput} (${textLayers.length} text layers, fallback)`);
        } else if (imageLayers.length > 0) {
          finalOutput = `[layer${imageLayers.length - 1}]`;
          console.log(`[VideoCompositor] Mapping final output: ${finalOutput} (${imageLayers.length} image layers, fallback)`);
        } else {
          finalOutput = '[base_scaled]';
          console.log(`[VideoCompositor] Mapping final output: ${finalOutput} (no layers)`);
        }
      }

      // Map the final output from filter_complex
      // IMPORTANT: When using filter_complex, the output label must be mapped correctly
      // The format is: -map [output_label] where output_label is from filter_complex
      // However, FFmpeg requires the label to be properly defined in the filter graph
      // If the label doesn't exist, we'll get "does not exist in any defined filter graph"
      
      // Verify the output label is in the filter complex
      if (!filterComplex.includes(finalOutput)) {
        console.error(`[VideoCompositor] ⚠️ Output label ${finalOutput} not found in filter complex!`);
        const foundLabels = filterComplex.match(/\[[^\]]+\]/g) || [];
        const uniqueLabels = [...new Set(foundLabels)];
        console.error(`[VideoCompositor] Filter complex contains: ${uniqueLabels.join(', ')}`);
        
        // Try to find the last valid label
        if (config._createdTextLabels && config._createdTextLabels.length > 0) {
          // Try each text label in reverse order
          for (let i = config._createdTextLabels.length - 1; i >= 0; i--) {
            const label = config._createdTextLabels[i];
            if (filterComplex.includes(label)) {
              finalOutput = label;
              console.log(`[VideoCompositor] Using valid text layer label: ${finalOutput}`);
              break;
            }
          }
        }
        
        // If still not found, fallback to base_scaled
        if (!filterComplex.includes(finalOutput)) {
          finalOutput = '[base_scaled]';
          console.log(`[VideoCompositor] Using fallback output: ${finalOutput}`);
        }
      }
      
      command.push('-map', finalOutput);
      command.push('-map', '1:a'); // Map audio from input 1
    } else {
      // No filter complex - map base video directly
      command.push('-map', '0:v');
      command.push('-map', '1:a');
    }

    // Video codec settings
    command.push('-c:v', 'libx264');
    command.push('-preset', 'medium');
    command.push('-crf', '23');
    command.push('-pix_fmt', 'yuv420p');

    // Audio codec and fade out (last 3 seconds: 27-30s for 30s video)
    const audioFadeStart = config.duration - 3; // 27 seconds for 30s video
    const audioFadeDuration = 3; // 3 second fade
    
    if (audioFadeStart > 0 && audioFadeDuration > 0) {
      // Apply audio fade out filter
      command.push('-af', `afade=t=out:st=${audioFadeStart}:d=${audioFadeDuration}`);
      console.log(`[VideoCompositor] Adding audio fade out: ${audioFadeStart}s-${audioFadeStart + audioFadeDuration}s`);
    }
    
    command.push('-c:a', 'aac');
    command.push('-b:a', '192k');

    // Duration
    command.push('-t', config.duration.toString());

    // Resolution
    command.push('-s', `${config.width}x${config.height}`);

    // Output
    command.push('-y', config.outputPath);

    return command;
  }

  /**
   * Execute FFmpeg command using spawn
   */
  async executeFFmpeg(command, outputPath) {
    return new Promise((resolve, reject) => {
      const ffmpegPath = command[0];
      const args = command.slice(1);

      console.log(`[VideoCompositor] FFmpeg command: ${ffmpegPath} ${args.slice(0, 5).join(' ')}...`);

      const ffmpegProcess = spawn(ffmpegPath, args, { stdio: 'pipe' });

      let stdout = '';
      let stderr = '';

      ffmpegProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        // FFmpeg outputs progress to stderr
        if (output.includes('time=')) {
          process.stdout.write('.');
        } else if (output.includes('error') || output.includes('Error') || output.includes('Invalid')) {
          // Log errors immediately
          console.error(`\n[VideoCompositor] FFmpeg Error: ${output.substring(0, 200)}`);
        }
      });

      ffmpegProcess.on('close', (code) => {
        console.log(''); // New line after progress dots

        if (code === 0) {
          if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log(`[VideoCompositor] ✅ Video composition completed: ${path.basename(outputPath)} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            resolve(outputPath);
          } else {
            reject(new Error('Output file was not created'));
          }
        } else {
          console.error(`[VideoCompositor] ❌ FFmpeg failed with code: ${code}`);
          console.error(`[VideoCompositor] Full stderr output:`);
          console.error(stderr);
          // Show last 1000 chars if stderr is very long
          const errorSnippet = stderr.length > 1000 ? stderr.substring(stderr.length - 1000) : stderr;
          reject(new Error(`FFmpeg failed with exit code ${code}: ${errorSnippet}`));
        }
      });

      ffmpegProcess.on('error', (error) => {
        console.error('[VideoCompositor] ❌ FFmpeg spawn error:', error);
        reject(error);
      });
    });
  }
}

