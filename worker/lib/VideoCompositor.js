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
  constructor(type, source, position, size, opacity, zIndex, scale = 1) {
    this.type = type; // 'background' | 'image' | 'text'
    this.source = source; // file path or text content
    this.position = position; // { x: number, y: number }
    this.size = size; // { width: number, height: number }
    this.opacity = opacity; // 0.0 to 1.0
    this.zIndex = zIndex; // layer order
    this.scale = scale || 1; // scale factor
  }
}

/**
 * Composition configuration
 */
export class CompositionConfig {
  constructor(baseVideo, audio, layers, outputPath, duration, width, height) {
    this.baseVideo = baseVideo; // background image/video path
    this.audio = audio; // audio file path
    this.layers = layers; // array of LayerConfig
    this.outputPath = outputPath; // output video path
    this.duration = duration; // video duration in seconds
    this.width = width || 720; // canvas width
    this.height = height || 720; // canvas height
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
    filters.push(`[0:v]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight}[base_scaled]`);

    let currentInput = '[base_scaled]';

    // Separate layers by type
    const imageLayers = config.layers.filter(layer => layer.type !== 'text' && layer.type !== 'background');
    const textLayers = config.layers.filter(layer => layer.type === 'text');

    // Sort image layers by z-index
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

      // Overlay filter with opacity
      // FFmpeg overlay handles opacity through format and alpha channel
      const opacity = layer.opacity || 1.0;
      
      let overlayFilter;
      if (opacity < 1.0) {
        // For opacity < 1.0, add alpha channel and adjust it
        // Convert to rgba, then use geq to modify alpha channel
        filters.push(`[scaled${index}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${opacity}'[scaled${index}_alpha]`);
        overlayFilter = `${currentInput}[scaled${index}_alpha]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
      } else {
        // Full opacity - simple overlay
        overlayFilter = `${currentInput}[scaled${index}]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
      }
      filters.push(overlayFilter);

      currentInput = outputLabel;
    });

    // Process text layers
    textLayers.forEach((layer, index) => {
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
      
      // CRITICAL: In FFmpeg filter_complex, the output label must be properly separated
      // The format is: [input]filter=params[output]
      // The issue: FFmpeg parses bordercolor=value[output] as color 'value[output]'
      // Solution: Put border parameters in the MIDDLE of the param list, not at the end
      // This ensures the output label comes after a parameter that FFmpeg can clearly parse
      const drawtextParams = [
        `text='${escapedText}'`,
        `fontsize=${fontSize}`,
        `fontcolor=0xFFFFFF`,
        `borderw=2`, // Move border params earlier to avoid parsing issues
        `bordercolor=0x000000`, // Use hex format without alpha
        isCentered ? `x=(w-text_w)/2` : `x=${xPos}`,
        `y=${yPos}`,
        `alpha=${opacity}` // Put alpha last - it's a simple numeric value
      ].join(':');
      
      textFilter = `${currentInput}drawtext=${drawtextParams}${outputLabel}`;
      
      filters.push(textFilter);

      currentInput = outputLabel;
    });

    const filterComplex = filters.join(';');
    console.log(`[VideoCompositor] Filter complex: ${filterComplex.substring(0, 200)}...`);
    
    // Debug: Log all output labels created
    const textLayers = config.layers.filter(layer => layer.type === 'text');
    const imageLayers = config.layers.filter(layer => layer.type !== 'text' && layer.type !== 'background');
    if (textLayers.length > 0) {
      console.log(`[VideoCompositor] Text layers: ${textLayers.length}, final output will be: [text_layer${textLayers.length - 1}]`);
    } else if (imageLayers.length > 0) {
      console.log(`[VideoCompositor] Image layers: ${imageLayers.length}, final output will be: [layer${imageLayers.length - 1}]`);
    } else {
      console.log(`[VideoCompositor] No layers, final output will be: [base_scaled]`);
    }
    
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

      // Determine final output label
      const textLayers = config.layers.filter(layer => layer.type === 'text');
      const imageLayers = config.layers.filter(layer => layer.type !== 'text' && layer.type !== 'background');
      let finalOutput;

      if (textLayers.length > 0) {
        // Use the last text layer (index is length - 1)
        finalOutput = `[text_layer${textLayers.length - 1}]`;
        console.log(`[VideoCompositor] Mapping final output: ${finalOutput} (${textLayers.length} text layers)`);
      } else if (imageLayers.length > 0) {
        finalOutput = `[layer${imageLayers.length - 1}]`;
        console.log(`[VideoCompositor] Mapping final output: ${finalOutput} (${imageLayers.length} image layers)`);
      } else {
        finalOutput = '[base_scaled]';
        console.log(`[VideoCompositor] Mapping final output: ${finalOutput} (no layers)`);
      }

      // Map the final output from filter_complex
      // The output label from filter_complex becomes a stream that can be mapped
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

    // Audio codec
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

