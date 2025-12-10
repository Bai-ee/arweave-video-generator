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
    this.type = type; // 'background' | 'image' | 'text' | 'video'
    this.source = source; // file path or text content
    this.position = position; // { x: number, y: number }
    this.size = size; // { width: number, height: number }
    this.opacity = opacity; // 0.0 to 1.0
    this.zIndex = zIndex; // layer order
    this.scale = scale || 1; // scale factor
    this.fontPath = fontPath; // custom font path for text layers (optional)
    this.startTime = startTime; // start time in seconds (optional, for timed overlays)
    this.duration = duration; // duration in seconds (optional, for timed overlays)
    this.blendMode = null; // blend mode: 'overlay', 'multiply', 'screen', etc. (optional)
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

      // Verify image and video layer files exist (text layers don't have files)
      const imageLayers = config.layers.filter(layer => layer.type === 'image');
      const videoLayers = config.layers.filter(layer => layer.type === 'video');
      for (const layer of [...imageLayers, ...videoLayers]) {
        if (!await fs.pathExists(layer.source)) {
          console.warn(`[VideoCompositor] Layer source not found: ${layer.source}, skipping`);
        }
      }

      // Check if audio file has an audio stream
      const hasAudioStream = await this.checkAudioStream(config.audio);
      if (!hasAudioStream) {
        console.warn(`[VideoCompositor] ⚠️  Audio file has no audio stream: ${config.audio}`);
        console.warn(`[VideoCompositor] Video will be created without audio`);
      }

      // Build filter complex
      const filterComplex = this.buildFilterComplex(config);

      // Build FFmpeg command
      const command = this.buildFFmpegCommand(config, filterComplex, hasAudioStream);

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

    // Separate layers by type and by whether they should be added after fade
    const imageLayers = config.layers.filter(layer => layer.type === 'image');
    const videoLayers = config.layers.filter(layer => layer.type === 'video');
    const textLayers = config.layers.filter(layer => layer.type === 'text');

    // IMPORTANT: Separate layers into "before fade" and "after fade" groups
    // Layers with addAfterFade=true should be processed AFTER the fade filter
    const layersBeforeFade = [...imageLayers, ...videoLayers, ...textLayers].filter(layer => !layer.addAfterFade);
    const layersAfterFade = [...imageLayers, ...videoLayers, ...textLayers].filter(layer => layer.addAfterFade === true);
    
    // Sort each group by z-index
    const allLayersBeforeFade = layersBeforeFade.sort((a, b) => a.zIndex - b.zIndex);
    const allLayersAfterFade = layersAfterFade.sort((a, b) => a.zIndex - b.zIndex);
    
    // Track which layers are images vs videos vs text for input indexing
    let imageLayerIndex = 0; // Track image layer index for input numbering
    let videoLayerIndex = 0; // Track video layer index for input numbering
    let textLayerIndex = 0; // Track text layer index for label numbering
    
    // Track created labels as we build the filter complex
    const createdTextLabels = [];
    const createdImageLabels = [];

    // Process layers that should appear BEFORE fade
    allLayersBeforeFade.forEach((layer) => {
      if (layer.type === 'text') {
        // Process text layer
        const outputLabel = `[text_layer${textLayerIndex}]`;

        // Calculate font size based on layer height (or use stored fontSize)
        const fontSize = layer.fontSize || Math.round(layer.size.height * 0.7); // 70% of layer height or stored value

        // Escape text for FFmpeg drawtext filter
        // Need to escape: single quotes, colons, brackets, parentheses, backslashes, and other special chars
        let escapedText = layer.source
          .replace(/\\/g, '\\\\')  // Escape backslashes first
          .replace(/'/g, "\\'")     // Escape single quotes
          .replace(/"/g, '\\"')     // Escape double quotes
          .replace(/:/g, "\\:")     // Escape colons
          .replace(/\[/g, "\\[")    // Escape brackets
          .replace(/\]/g, "\\]")    // Escape brackets
          .replace(/\(/g, "\\(")    // Escape parentheses
          .replace(/\)/g, "\\)")    // Escape parentheses
          .replace(/\$/g, "\\$")    // Escape dollar signs (used in expressions)
          .replace(/\@/g, "\\@");   // Escape @ symbols

        // FFmpeg drawtext uses x,y for top-left corner
        let xPos = layer.position.x;
        let yPos = layer.position.y;
        
        // Check if x is at canvas center (within 10px tolerance)
        const isCentered = Math.abs(xPos - (canvasWidth / 2)) < 10;
        
        // Create drawtext filter with centering if needed
        const opacity = Math.round((layer.opacity || 1.0) * 255);
        
        // Get text color from layer config (default to black)
        const textColor = layer.textColor || '0x000000';
        const actualFontSize = layer.fontSize || fontSize;
        
        // Determine border color based on text color (black border for white text, white border for black text)
        const borderColor = textColor === '0xFFFFFF' ? '0x000000' : '0xFFFFFF';
        const borderWidth = actualFontSize < 30 ? 1 : 2; // Thinner border for small text
        
        // Build drawtext parameters
        // Use escaped text without quotes (FFmpeg will handle it)
        // Add lineheight for line spacing (0.75x font size - half of previous 1.5x)
        const lineHeight = Math.round(actualFontSize * 0.75);
        const drawtextParams = [
          `text='${escapedText}'`, // Single quotes around escaped text (no quotes in content itself)
          `fontsize=${actualFontSize}`,
          `fontcolor=${textColor}`, // Use layer's text color (default black)
          `borderw=${borderWidth}`, // Border width
          `bordercolor=${borderColor}`, // Border color (opposite of text color)
          `line_spacing=${lineHeight}`, // Add line spacing between lines
          isCentered ? `x=(w-text_w)/2` : `x=${xPos}`,
          `y=${yPos}`
        ];
        
        // Add custom font if provided
        if (layer.fontPath && fs.existsSync(layer.fontPath)) {
          const absFontPath = path.resolve(layer.fontPath);
          let escapedFontPath = absFontPath.replace(/\\/g, '/');
          escapedFontPath = escapedFontPath.replace(/:/g, '\\:');
          escapedFontPath = escapedFontPath.replace(/([ '()\[\]])/g, '\\$1');
          drawtextParams.splice(2, 0, `fontfile=${escapedFontPath}`);
          console.log(`[VideoCompositor] ✅ Using custom font: ${path.basename(layer.fontPath)}`);
        }
        
        // Add timing if specified (enable text only at startTime with fade-in)
        let textFilter;
        if (layer.startTime !== null && layer.startTime !== undefined) {
          const endTime = layer.startTime + (layer.duration || config.duration);
          // Round endTime to avoid decimal issues in filter expressions
          const roundedEndTime = Math.round(endTime * 100) / 100;
          // Use enable expression with fade-in: opacity goes from 0 to full over 1 second
          // Use static opacity with enable for timing (more reliable than complex alpha expressions)
          // Complex alpha expressions can cause FFmpeg parsing errors like "Option not found"
          drawtextParams.push(`alpha=${opacity}`); // Use static opacity, control visibility with enable
          // Use gte/lte for enable to control when text appears (more reliable)
          drawtextParams.push(`enable='gte(t\\,${layer.startTime})*lte(t\\,${roundedEndTime})'`);
          textFilter = `${currentInput}drawtext=${drawtextParams.join(':')}${outputLabel}`;
        } else {
          // No timing - add static alpha
          drawtextParams.push(`alpha=${opacity}`);
          textFilter = `${currentInput}drawtext=${drawtextParams.join(':')}${outputLabel}`;
        }
        
        console.log(`[VideoCompositor] Text filter for layer ${textLayerIndex}: ${textFilter.substring(0, 150)}...`);
        filters.push(textFilter);
        currentInput = outputLabel;
        createdTextLabels.push(outputLabel); // Track text label for final output mapping
        textLayerIndex++;
      } else if (layer.type === 'video') {
        // Process video layer with blend mode support
        // Input index: videos come first after base(0) and audio(1), so index = 2 + videoLayerIndex
        const inputIndex = 2 + videoLayerIndex; // +2 because 0=base, 1=audio, then videos
        let outputLabel = `[video_layer${videoLayerIndex}]`;
        
        // Scale video to canvas size
        const finalWidth = Math.round(layer.size.width * (layer.scale || 1));
        const finalHeight = Math.round(layer.size.height * (layer.scale || 1));
        
        // Apply blend mode if specified
        const opacity = layer.opacity || 1.0;
        let overlayFilter;
        
        if (layer.blendMode === 'overlay') {
          // For overlay blend mode, we'll scale and position in the blend step
          const scaleFilter = `[${inputIndex}:v]scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=increase,crop=${finalWidth}:${finalHeight},fps=30[scaled_video${videoLayerIndex}]`;
          filters.push(scaleFilter);
          // Overlay blend mode: use blend filter with overlay mode
          // First, prepare the video with opacity if needed
          let videoInput = `[scaled_video${videoLayerIndex}]`;
          if (opacity < 1.0) {
            filters.push(`[scaled_video${videoLayerIndex}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${opacity}'[scaled_video${videoLayerIndex}_alpha]`);
            videoInput = `[scaled_video${videoLayerIndex}_alpha]`;
          }
          
          // For overlay blend mode: blend the video directly with current input
          // Both inputs need to be the same size for blend filter
          // Scale video to match canvas size, then blend
          const videoScaled = `[video_scaled_for_blend${videoLayerIndex}]`;
          filters.push(`${videoInput}scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight},fps=30${videoScaled}`);
          
          // Blend the scaled video with the current input using overlay blend mode
          const blendOutput = `[video_blend${videoLayerIndex}]`;
          
          // For blend mode with timing, we need to handle it differently
          // Since blend filter doesn't work well with enable expressions, we'll use a workaround:
          // For timed overlays, we'll apply the blend for the full duration
          // The timing will be controlled by trimming the video input in the filter chain
          if (layer.startTime !== null && layer.startTime !== undefined) {
            const endTime = layer.startTime + (layer.duration || config.duration);
            // Trim the video input to only the time window we want
            const trimmedVideo = `[trimmed_video${videoLayerIndex}]`;
            filters.push(`${videoScaled}trim=start=${layer.startTime}:end=${endTime},setpts=PTS-STARTPTS${trimmedVideo}`);
            
            // Blend the trimmed video with current input
            filters.push(`${currentInput}${trimmedVideo}blend=all_mode=overlay:all_opacity=${opacity}${blendOutput}`);
            currentInput = blendOutput;
            outputLabel = blendOutput;
            overlayFilter = null;
          } else {
            // No timing - blend directly
            filters.push(`${currentInput}${videoScaled}blend=all_mode=overlay:all_opacity=${opacity}${blendOutput}`);
            currentInput = blendOutput;
            outputLabel = blendOutput;
            overlayFilter = null;
          }
        } else {
          // No blend mode - simple overlay
          const scaleFilter = `[${inputIndex}:v]scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=increase,crop=${finalWidth}:${finalHeight},fps=30[scaled_video${videoLayerIndex}]`;
          filters.push(scaleFilter);
          
            if (opacity < 1.0) {
              filters.push(`[scaled_video${videoLayerIndex}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${opacity}'[scaled_video${videoLayerIndex}_alpha]`);
              if (layer.startTime !== null && layer.startTime !== undefined) {
                const endTime = layer.startTime + (layer.duration || config.duration);
                const roundedEndTime = Math.round(endTime * 100) / 100;
                overlayFilter = `${currentInput}[scaled_video${videoLayerIndex}_alpha]overlay=${layer.position.x}:${layer.position.y}:enable='gte(t\\,${layer.startTime})*lte(t\\,${roundedEndTime})'${outputLabel}`;
              } else {
                overlayFilter = `${currentInput}[scaled_video${videoLayerIndex}_alpha]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
              }
            } else {
              if (layer.startTime !== null && layer.startTime !== undefined) {
                const endTime = layer.startTime + (layer.duration || config.duration);
                const roundedEndTime = Math.round(endTime * 100) / 100;
                overlayFilter = `${currentInput}[scaled_video${videoLayerIndex}]overlay=${layer.position.x}:${layer.position.y}:enable='gte(t\\,${layer.startTime})*lte(t\\,${roundedEndTime})'${outputLabel}`;
              } else {
                overlayFilter = `${currentInput}[scaled_video${videoLayerIndex}]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
              }
            }
        }
        if (overlayFilter) {
          filters.push(overlayFilter);
          currentInput = outputLabel;
        }
        // If blend mode was used and no overlay filter, currentInput was already updated above
        videoLayerIndex++;
        } else {
          // Process image layer
          // Input index: images come after videos, so index = 2 + videoLayers.length + imageLayerIndex
          const inputIndex = 2 + videoLayers.length + imageLayerIndex; // +2 because 0=base, 1=audio, then videos, then images
          const outputLabel = `[layer${imageLayerIndex}]`;

        // Calculate final size with scale
        const finalWidth = Math.round(layer.size.width * (layer.scale || 1));
        const finalHeight = Math.round(layer.size.height * (layer.scale || 1));

        // Scale filter - maintain aspect ratio for images
        const scaleFilter = `[${inputIndex}:v]scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=decrease[scaled${imageLayerIndex}]`;
        filters.push(scaleFilter);

        // Overlay filter with opacity and optional timing
        const opacity = layer.opacity || 1.0;
        
        let overlayFilter;
        if (opacity < 1.0) {
          // For opacity < 1.0, add alpha channel and adjust it
          filters.push(`[scaled${imageLayerIndex}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${opacity}'[scaled${imageLayerIndex}_alpha]`);
          
          // Add timing if specified (enable overlay only at startTime)
          if (layer.startTime !== null && layer.startTime !== undefined) {
            const endTime = layer.startTime + (layer.duration || config.duration);
            const roundedEndTime = Math.round(endTime * 100) / 100;
            overlayFilter = `${currentInput}[scaled${imageLayerIndex}_alpha]overlay=${layer.position.x}:${layer.position.y}:enable='gte(t\\,${layer.startTime})*lte(t\\,${roundedEndTime})'${outputLabel}`;
          } else {
            overlayFilter = `${currentInput}[scaled${imageLayerIndex}_alpha]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
          }
        } else {
          // Full opacity - simple overlay
          if (layer.startTime !== null && layer.startTime !== undefined) {
            const endTime = layer.startTime + (layer.duration || config.duration);
            const roundedEndTime = Math.round(endTime * 100) / 100;
            overlayFilter = `${currentInput}[scaled${imageLayerIndex}]overlay=${layer.position.x}:${layer.position.y}:enable='gte(t\\,${layer.startTime})*lte(t\\,${roundedEndTime})'${outputLabel}`;
          } else {
            overlayFilter = `${currentInput}[scaled${imageLayerIndex}]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
          }
        }
        filters.push(overlayFilter);
        currentInput = outputLabel;
        imageLayerIndex++;
      }
    });

    // OLD CODE - REMOVED: Separate processing of image and text layers
    // This caused z-index ordering issues
    /*
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
          const roundedEndTime = Math.round(endTime * 100) / 100;
          // Use overlay with enable expression to show only at specific time
          overlayFilter = `${currentInput}[scaled${index}_alpha]overlay=${layer.position.x}:${layer.position.y}:enable='gte(t\\,${layer.startTime})*lte(t\\,${roundedEndTime})'${outputLabel}`;
        } else {
          overlayFilter = `${currentInput}[scaled${index}_alpha]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
        }
      } else {
        // Full opacity - simple overlay
        if (layer.startTime !== null && layer.startTime !== undefined) {
          const endTime = layer.startTime + (layer.duration || config.duration);
          const roundedEndTime = Math.round(endTime * 100) / 100;
          // Use overlay with enable expression to show only at specific time
          overlayFilter = `${currentInput}[scaled${index}]overlay=${layer.position.x}:${layer.position.y}:enable='gte(t\\,${layer.startTime})*lte(t\\,${roundedEndTime})'${outputLabel}`;
        } else {
          overlayFilter = `${currentInput}[scaled${index}]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
        }
      }
      filters.push(overlayFilter);

      currentInput = outputLabel;
    });
    */

    // Apply video fade to black (22-25 seconds: fade out over 3 seconds, starting 8 seconds before end)
    // For 30 second video: start at 22s, fade duration 3s (ends at 25s)
    const videoFadeStart = config.duration - 8; // 22 seconds for 30s video
    const videoFadeDuration = 3; // 3 second fade
    let finalVideoLabel = currentInput; // Track final video label after fade
    const hasTextBeforeFade = allLayersBeforeFade.some(layer => layer.type === 'text');
    if (videoFadeStart > 0 && videoFadeDuration > 0) {
      const fadeOutFilter = `${currentInput}fade=t=out:st=${videoFadeStart}:d=${videoFadeDuration}[faded_video]`;
      filters.push(fadeOutFilter);
      currentInput = '[faded_video]';
      finalVideoLabel = '[faded_video]';
      // If text was processed before fade, the faded_video contains the text, so use it as final output
      if (hasTextBeforeFade) {
        // Remove text labels from tracking since they're now part of faded_video
        // The final output will be faded_video which includes the text
        createdTextLabels.length = 0; // Clear text labels - they're in faded_video now
      }
      console.log(`[VideoCompositor] Adding video fade to black: ${videoFadeStart}s-${videoFadeStart + videoFadeDuration}s`);
    }

    // Process layers that should appear AFTER fade (these won't fade out)
    if (allLayersAfterFade.length > 0) {
      console.log(`[VideoCompositor] Processing ${allLayersAfterFade.length} layer(s) after fade (won't fade out)`);
      allLayersAfterFade.forEach((layer) => {
        if (layer.type === 'text') {
          // Process text layer (same as before, but on faded video)
          const outputLabel = `[text_layer_after${textLayerIndex}]`;
          const fontSize = layer.fontSize || Math.round(layer.size.height * 0.7);
          // Escape text for FFmpeg drawtext filter (same as above)
          let escapedText = layer.source
            .replace(/\\/g, '\\\\')  // Escape backslashes first
            .replace(/'/g, "\\'")     // Escape single quotes
            .replace(/"/g, '\\"')     // Escape double quotes
            .replace(/:/g, "\\:")     // Escape colons
            .replace(/\[/g, "\\[")    // Escape brackets
            .replace(/\]/g, "\\]")    // Escape brackets
            .replace(/\(/g, "\\(")    // Escape parentheses
            .replace(/\)/g, "\\)")    // Escape parentheses
            .replace(/\$/g, "\\$")    // Escape dollar signs (used in expressions)
            .replace(/\@/g, "\\@");   // Escape @ symbols
          let xPos = layer.position.x;
          let yPos = layer.position.y;
          const isCentered = Math.abs(xPos - (canvasWidth / 2)) < 10;
          const opacity = Math.round((layer.opacity || 1.0) * 255);
          const textColor = layer.textColor || '0x000000';
          const actualFontSize = layer.fontSize || fontSize;
          const borderColor = textColor === '0xFFFFFF' ? '0x000000' : '0xFFFFFF';
          const borderWidth = actualFontSize < 30 ? 1 : 2;
          
          // Add lineheight for line spacing (0.75x font size - half of previous 1.5x)
          const lineHeight = Math.round(actualFontSize * 0.75);
          const drawtextParams = [
            `text='${escapedText}'`, // Single quotes around escaped text (no quotes in content itself)
            `fontsize=${actualFontSize}`,
            `fontcolor=${textColor}`,
            `borderw=${borderWidth}`,
            `bordercolor=${borderColor}`,
            `line_spacing=${lineHeight}`, // Add line spacing between lines
            isCentered ? `x=(w-text_w)/2` : `x=${xPos}`,
            `y=${yPos}`
          ];
          
          if (layer.fontPath && fs.existsSync(layer.fontPath)) {
            const absFontPath = path.resolve(layer.fontPath);
            let escapedFontPath = absFontPath.replace(/\\/g, '/');
            escapedFontPath = escapedFontPath.replace(/:/g, '\\:');
            escapedFontPath = escapedFontPath.replace(/([ '()\[\]])/g, '\\$1');
            drawtextParams.splice(2, 0, `fontfile=${escapedFontPath}`);
          }
          
          let textFilter;
          if (layer.startTime !== null && layer.startTime !== undefined) {
            const endTime = layer.startTime + (layer.duration || config.duration);
            // Round endTime to avoid decimal issues in filter expressions
            const roundedEndTime = Math.round(endTime * 100) / 100;
            const fadeDuration = 1.0;
          // Use static opacity with enable for timing (more reliable than complex alpha expressions)
          // Complex alpha expressions can cause FFmpeg parsing errors
          drawtextParams.push(`alpha=${opacity}`); // Use static opacity, control visibility with enable
          // Use gte/lte for enable to control when text appears
          drawtextParams.push(`enable='gte(t\\,${layer.startTime})*lte(t\\,${roundedEndTime})'`);
          // Build filter string carefully to avoid parsing errors
          textFilter = `${currentInput}drawtext=${drawtextParams.join(':')}${outputLabel}`;
          } else {
            drawtextParams.push(`alpha=${opacity}`);
            textFilter = `${currentInput}drawtext=${drawtextParams.join(':')}${outputLabel}`;
          }
          
          filters.push(textFilter);
          currentInput = outputLabel;
          textLayerIndex++;
        } else if (layer.type === 'video') {
          // Process video layer after fade (same as before fade, but on faded video)
          // Input index: videos come first after base(0) and audio(1), so index = 2 + videoLayerIndex
          const inputIndex = 2 + videoLayerIndex; // +2 because 0=base, 1=audio, then videos
          let outputLabel = `[video_layer_after${videoLayerIndex}]`;
          
          // Scale video to canvas size
          const finalWidth = Math.round(layer.size.width * (layer.scale || 1));
          const finalHeight = Math.round(layer.size.height * (layer.scale || 1));
          const scaleFilter = `[${inputIndex}:v]scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=increase,crop=${finalWidth}:${finalHeight},fps=30[scaled_video_after${videoLayerIndex}]`;
          filters.push(scaleFilter);
          
          // Apply blend mode if specified
          const opacity = layer.opacity || 1.0;
          let overlayFilter;
          
          if (layer.blendMode === 'overlay') {
            let videoInput = `[scaled_video_after${videoLayerIndex}]`;
            if (opacity < 1.0) {
              filters.push(`[scaled_video_after${videoLayerIndex}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${opacity}'[scaled_video_after${videoLayerIndex}_alpha]`);
              videoInput = `[scaled_video_after${videoLayerIndex}_alpha]`;
            }
            
            // For overlay blend mode: blend the video directly with current input
            // Both inputs need to be the same size for blend filter
            // Scale video to match canvas size, then blend
            const videoScaled = `[video_scaled_for_blend${videoLayerIndex}]`;
            filters.push(`${videoInput}scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight},fps=30${videoScaled}`);
            
            // Blend the scaled video with the current input using overlay blend mode
            const blendOutput = `[video_blend_after${videoLayerIndex}]`;
            // Blend filter requires both inputs to be same size - currentInput is already canvas size
            filters.push(`${currentInput}${videoScaled}blend=all_mode=overlay:all_opacity=${opacity}${blendOutput}`);
            
            // The blend output becomes the new current input
            overlayFilter = null;
            currentInput = blendOutput;
            outputLabel = blendOutput;
          } else {
            if (opacity < 1.0) {
              filters.push(`[scaled_video_after${videoLayerIndex}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${opacity}'[scaled_video_after${videoLayerIndex}_alpha]`);
              if (layer.startTime !== null && layer.startTime !== undefined) {
                const endTime = layer.startTime + (layer.duration || config.duration);
                const roundedEndTime = Math.round(endTime * 100) / 100;
                overlayFilter = `${currentInput}[scaled_video_after${videoLayerIndex}_alpha]overlay=${layer.position.x}:${layer.position.y}:enable='gte(t\\,${layer.startTime})*lte(t\\,${roundedEndTime})'${outputLabel}`;
              } else {
                overlayFilter = `${currentInput}[scaled_video_after${videoLayerIndex}_alpha]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
              }
            } else {
              if (layer.startTime !== null && layer.startTime !== undefined) {
                const endTime = layer.startTime + (layer.duration || config.duration);
                const roundedEndTime = Math.round(endTime * 100) / 100;
                overlayFilter = `${currentInput}[scaled_video_after${videoLayerIndex}]overlay=${layer.position.x}:${layer.position.y}:enable='gte(t\\,${layer.startTime})*lte(t\\,${roundedEndTime})'${outputLabel}`;
              } else {
                overlayFilter = `${currentInput}[scaled_video_after${videoLayerIndex}]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
              }
            }
          }
          if (overlayFilter) {
            filters.push(overlayFilter);
            currentInput = outputLabel;
          }
          // If blend mode was used, currentInput was already updated above
          videoLayerIndex++;
        } else {
          // Process image layer (same as before, but on faded video)
          // Input index: images come after videos, so index = 2 + videoLayers.length + imageLayerIndex
          const inputIndex = 2 + videoLayers.length + imageLayerIndex; // +2 because 0=base, 1=audio, then videos, then images
          const outputLabel = `[layer_after${imageLayerIndex}]`;
          const finalWidth = Math.round(layer.size.width * (layer.scale || 1));
          const finalHeight = Math.round(layer.size.height * (layer.scale || 1));
          const scaleFilter = `[${inputIndex}:v]scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=decrease[scaled_after${imageLayerIndex}]`;
          filters.push(scaleFilter);
          
          const opacity = layer.opacity || 1.0;
          let overlayFilter;
          if (opacity < 1.0) {
            filters.push(`[scaled_after${imageLayerIndex}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${opacity}'[scaled_after${imageLayerIndex}_alpha]`);
            if (layer.startTime !== null && layer.startTime !== undefined) {
              const endTime = layer.startTime + (layer.duration || config.duration);
              const roundedEndTime = Math.round(endTime * 100) / 100;
              overlayFilter = `${currentInput}[scaled_after${imageLayerIndex}_alpha]overlay=${layer.position.x}:${layer.position.y}:enable='gte(t\\,${layer.startTime})*lte(t\\,${roundedEndTime})'${outputLabel}`;
            } else {
              overlayFilter = `${currentInput}[scaled_after${imageLayerIndex}_alpha]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
            }
          } else {
            if (layer.startTime !== null && layer.startTime !== undefined) {
              const endTime = layer.startTime + (layer.duration || config.duration);
              const roundedEndTime = Math.round(endTime * 100) / 100;
              overlayFilter = `${currentInput}[scaled_after${imageLayerIndex}]overlay=${layer.position.x}:${layer.position.y}:enable='gte(t\\,${layer.startTime})*lte(t\\,${roundedEndTime})'${outputLabel}`;
            } else {
              overlayFilter = `${currentInput}[scaled_after${imageLayerIndex}]overlay=${layer.position.x}:${layer.position.y}${outputLabel}`;
            }
          }
          filters.push(overlayFilter);
          currentInput = outputLabel;
          imageLayerIndex++;
        }
      });
      finalVideoLabel = currentInput; // Update final label to include after-fade layers
    }

    const filterComplex = filters.join(';');
    
    // Store final video label for output mapping
    config._finalVideoLabel = finalVideoLabel;
    console.log(`[VideoCompositor] Filter complex: ${filterComplex.substring(0, 200)}...`);
    
    // Debug: Log all output labels created
    const allLabels = filterComplex.match(/\[[^\]]+\]/g) || [];
    const uniqueLabels = [...new Set(allLabels)];
    console.log(`[VideoCompositor] All labels in filter complex: ${uniqueLabels.join(', ')}`);
    
    // Track labels from the unified processing
    // Combine all layers (before and after fade) for label tracking
    const allLayers = [...allLayersBeforeFade, ...allLayersAfterFade];
    // Track labels from before-fade layers (labels already tracked above)
    allLayersBeforeFade.forEach((layer, idx) => {
      if (layer.type === 'text') {
        const textIdx = allLayersBeforeFade.slice(0, idx).filter(l => l.type === 'text').length;
        createdTextLabels.push(`[text_layer${textIdx}]`);
      } else {
        const imgIdx = allLayersBeforeFade.slice(0, idx).filter(l => l.type !== 'text' && l.type !== 'background').length;
        createdImageLabels.push(`[layer${imgIdx}]`);
      }
    });
    
    // Track labels from after-fade layers (these use different label names)
    allLayersAfterFade.forEach((layer, idx) => {
      if (layer.type === 'text') {
        const textIdx = allLayersAfterFade.slice(0, idx).filter(l => l.type === 'text').length;
        createdTextLabels.push(`[text_layer_after${textIdx}]`);
      } else {
        const imgIdx = allLayersAfterFade.slice(0, idx).filter(l => l.type !== 'text' && l.type !== 'background').length;
        createdImageLabels.push(`[layer_after${imgIdx}]`);
      }
    });
    
    if (createdTextLabels.length > 0) {
      const lastTextLabel = createdTextLabels[createdTextLabels.length - 1];
      console.log(`[VideoCompositor] Text layers created: ${createdTextLabels.length}, final output should be: ${lastTextLabel}`);
    } else if (createdImageLabels.length > 0) {
      console.log(`[VideoCompositor] Image layers: ${createdImageLabels.length}, final output will be: [layer${createdImageLabels.length - 1}]`);
    } else {
      console.log(`[VideoCompositor] No layers, final output will be: [base_scaled]`);
    }
    
    // Store created labels in config for later validation
    config._createdTextLabels = createdTextLabels;
    config._createdImageLabels = createdImageLabels;
    config._finalVideoLabel = finalVideoLabel; // Store final video label (faded_video if fade applied)
    config._hasTextBeforeFade = hasTextBeforeFade; // Track if text was processed before fade
    
    return filterComplex;
  }

  /**
   * Build FFmpeg command array
   */
  buildFFmpegCommand(config, filterComplex, hasAudioStream = true) {
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

    // Input image and video layers (text layers don't need input files)
    const imageLayers = config.layers.filter(layer => layer.type === 'image');
    const videoLayers = config.layers.filter(layer => layer.type === 'video');
    
    // Add video layers first (they don't need looping)
    videoLayers.forEach(layer => {
      command.push('-stream_loop', '-1'); // Loop video if shorter than duration
      command.push('-i', layer.source);
    });
    
    // Add image layers (they need to be looped to create video streams)
    imageLayers.forEach(layer => {
      command.push('-loop', '1');
      command.push('-framerate', '30');
      command.push('-i', layer.source);
    });

    // Filter complex
    if (filterComplex) {
      command.push('-filter_complex', filterComplex);

      // Determine final output label - use the labels that were actually created
      // PRIORITY: Text layers > Image layers > Faded video > Base
      // Text should ALWAYS be on top, even if there are image layers after fade
      let finalOutput;

      // First priority: If text was processed before fade, use faded_video (text is included in fade)
      if (config._hasTextBeforeFade && config._finalVideoLabel && filterComplex.includes(config._finalVideoLabel)) {
        finalOutput = config._finalVideoLabel;
        console.log(`[VideoCompositor] Mapping final output: ${finalOutput} (text processed before fade, now in faded_video)`);
      }
      // Second priority: Check for text layers processed after fade (these stay visible)
      else if (config._createdTextLabels && config._createdTextLabels.length > 0) {
        // Find the last text layer that exists in the filter complex
        for (let i = config._createdTextLabels.length - 1; i >= 0; i--) {
          const textLabel = config._createdTextLabels[i];
          if (filterComplex.includes(textLabel)) {
            finalOutput = textLabel;
            console.log(`[VideoCompositor] Mapping final output: ${finalOutput} (${config._createdTextLabels.length} text layers created, using last valid)`);
            break;
          }
        }
        // If no text label found in filter complex, fall through to next priority
        if (!finalOutput) {
          console.warn(`[VideoCompositor] ⚠️  Text layers tracked but not found in filter complex, falling back to other layers`);
        }
      }
      
      // Third priority: Use final video label (after fade) if no text layers or text not found
      if (!finalOutput && config._finalVideoLabel && filterComplex.includes(config._finalVideoLabel)) {
        finalOutput = config._finalVideoLabel;
        console.log(`[VideoCompositor] Mapping final output: ${finalOutput} (after fade, no text layers)`);
      } 
      
      // Third priority: Image layers
      if (!finalOutput && config._createdImageLabels && config._createdImageLabels.length > 0) {
        // Find the last image layer that exists in the filter complex
        for (let i = config._createdImageLabels.length - 1; i >= 0; i--) {
          const imageLabel = config._createdImageLabels[i];
          if (filterComplex.includes(imageLabel)) {
            finalOutput = imageLabel;
            console.log(`[VideoCompositor] Mapping final output: ${finalOutput} (${config._createdImageLabels.length} image layers created, using last valid)`);
            break;
          }
        }
      }
      
      // Fallback: determine from layer counts
      if (!finalOutput) {
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
      // Map audio from input 1 - REQUIRED (not optional)
      // If audio doesn't exist, FFmpeg will fail, which is better than silent video
      command.push('-map', '1:a'); // Required audio mapping
    } else {
      // No filter complex - map base video directly
      command.push('-map', '0:v');
      command.push('-map', '1:a'); // Required audio mapping
    }

    // Video codec settings
    command.push('-c:v', 'libx264');
    command.push('-preset', 'medium');
    command.push('-crf', '23');
    command.push('-pix_fmt', 'yuv420p');

    // Audio codec and fade out (only if audio stream exists)
    if (hasAudioStream) {
      const audioFadeStart = config.duration - 3; // 27 seconds for 30s video
      const audioFadeDuration = 3; // 3 second fade
      
      if (audioFadeStart > 0 && audioFadeDuration > 0) {
        // Apply audio fade out filter
        command.push('-af', `afade=t=out:st=${audioFadeStart}:d=${audioFadeDuration}`);
        console.log(`[VideoCompositor] Adding audio fade out: ${audioFadeStart}s-${audioFadeStart + audioFadeDuration}s`);
      }
      
      command.push('-c:a', 'aac');
      command.push('-b:a', '192k');
    } else {
      console.log(`[VideoCompositor] Skipping audio codec settings (no audio stream)`);
    }

    // Duration
    command.push('-t', config.duration.toString());

    // Resolution
    command.push('-s', `${config.width}x${config.height}`);

    // Output
    command.push('-y', config.outputPath);

    return command;
  }

  /**
   * Check if audio file has an audio stream using ffprobe
   */
  async checkAudioStream(audioPath) {
    try {
      // Use ffprobe to check for audio streams
      // Try to find ffprobe - it's usually in the same directory as ffmpeg
      let ffprobePath = ffmpegPath.replace('ffmpeg', 'ffprobe');
      
      // If using ffmpeg-static, try ffprobe-static
      if (ffmpegPath.includes('ffmpeg-static')) {
        try {
          const ffprobeStatic = await import('ffprobe-static');
          if (ffprobeStatic && ffprobeStatic.path) {
            ffprobePath = ffprobeStatic.path;
          }
        } catch (e) {
          // Fall back to system ffprobe
        }
      }
      
      const { spawn } = await import('child_process');
      
      // Use spawn instead of execSync to handle paths with spaces properly
      return new Promise((resolve) => {
        const ffprobe = spawn(ffprobePath, [
          '-v', 'error',
          '-select_streams', 'a:0',
          '-show_entries', 'stream=codec_type',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          audioPath
        ], { stdio: 'pipe' });
        
        let output = '';
        ffprobe.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        ffprobe.on('close', (code) => {
          if (code === 0 && output.trim() === 'audio') {
            resolve(true);
          } else {
            resolve(false);
          }
        });
        
        ffprobe.on('error', () => {
          resolve(false);
        });
      });
    } catch (error) {
      console.warn(`[VideoCompositor] Error checking audio stream: ${error.message}`);
      return false; // Default to false if check fails
    }
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
          
          // Log filter complex if it exists (for debugging drawtext/filter errors)
          if (config.videoFilter || (filters && filters.length > 0)) {
            console.error(`[VideoCompositor] Filter complex (first 500 chars): ${filterComplex ? filterComplex.substring(0, 500) : 'N/A'}...`);
          }
          
          // Extract the most relevant error message
          const errorLines = stderr.split('\n').filter(line => 
            line.includes('Error') || 
            line.includes('error') || 
            line.includes('failed') ||
            line.includes('Invalid') ||
            line.includes('not found') ||
            line.includes('Option not found')
          );
          
          const errorMessage = errorLines.length > 0 
            ? errorLines.slice(-5).join('; ') 
            : (stderr.length > 500 ? stderr.substring(stderr.length - 500) : stderr);
          
          reject(new Error(`FFmpeg failed with exit code ${code}: ${errorMessage}`));
        }
      });

      ffmpegProcess.on('error', (error) => {
        console.error('[VideoCompositor] ❌ FFmpeg spawn error:', error);
        reject(error);
      });
    });
  }
}

