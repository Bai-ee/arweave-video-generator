import OpenAI from 'openai';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * DALL-E Image Generator - Generates images using OpenAI DALL-E 3
 */
export class DALLEImageGenerator {
    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            console.warn('[DALLEImageGenerator] OPENAI_API_KEY not set - image generation will fail');
        }

        this.openai = process.env.OPENAI_API_KEY ? new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        }) : null;

        this.outputDir = path.join(process.cwd(), 'outputs', 'dalle-images');
        fs.ensureDirSync(this.outputDir);
    }

    /**
     * Generate a prompt for background image based on artist
     */
    generateBackgroundPrompt(artistName, customPrompt = null) {
        if (customPrompt) {
            return customPrompt;
        }
        
        const basePrompt = `A stunning, cinematic background for underground electronic music. Industrial warehouse aesthetic with dramatic lighting, analog textures, and cinematic realism. The scene should subtly reflect the essence of ${artistName}'s electronic music style. Ultra-high resolution, professional cinematography, moody atmosphere.`;
        return basePrompt;
    }

    /**
     * Generate a random overlay image prompt
     */
    generateRandomOverlayPrompt(artistName) {
        const prompts = [
            `Abstract geometric patterns in ${artistName}'s style, vibrant colors, electronic music aesthetic`,
            `Futuristic neon lights and digital art inspired by ${artistName}, cyberpunk atmosphere`,
            `Underground club scene elements, strobe lights, dance floor energy, ${artistName} vibes`,
            `Minimalist design with bold typography, ${artistName} branding, modern electronic aesthetic`,
            `Retro synthwave visuals, 80s inspired, ${artistName} electronic music theme`
        ];
        
        return prompts[Math.floor(Math.random() * prompts.length)];
    }

    /**
     * Generate background image using DALL-E 3
     */
    async generateBackgroundImage(artistName, prompt = null, width = 720, height = 720) {
        if (!this.openai) {
            console.warn('[DALLEImageGenerator] ❌ OpenAI not initialized - API key missing');
            console.warn('[DALLEImageGenerator] Set OPENAI_API_KEY in .env file or environment variable');
            return null;
        }

        try {
            const imagePrompt = this.generateBackgroundPrompt(artistName, prompt);
            console.log(`[DALLEImageGenerator] 🎨 Generating DALL-E background image...`);
            console.log(`[DALLEImageGenerator] 📝 Prompt: "${imagePrompt.substring(0, 150)}..."`);
            
            // DALL-E 3 size options: "1024x1024", "1792x1024", "1024x1792"
            // For square videos, use 1024x1024 and scale
            let dalleSize = "1024x1024";
            if (width > height) {
                dalleSize = "1792x1024";
            } else if (height > width) {
                dalleSize = "1024x1792";
            }
            
            console.log(`[DALLEImageGenerator] 📐 Size: ${dalleSize} (target: ${width}x${height})`);

            const imageResponse = await this.openai.images.generate({
                model: "dall-e-3",
                prompt: imagePrompt,
                n: 1,
                size: dalleSize,
                quality: "hd",
                style: "natural"
            });

            const imageUrl = imageResponse.data[0].url;
            if (!imageUrl) {
                throw new Error('No image URL received from OpenAI');
            }

            // Download and save the image
            const downloadResponse = await fetch(imageUrl);
            const buffer = await downloadResponse.arrayBuffer();
            const fileName = `bg_${artistName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.png`;
            const filePath = path.join(this.outputDir, fileName);
            
            await fs.writeFile(filePath, Buffer.from(buffer));
            const stats = await fs.stat(filePath);
            console.log(`[DALLEImageGenerator] ✅ Background image generated successfully!`);
            console.log(`[DALLEImageGenerator] 📁 File: ${filePath}`);
            console.log(`[DALLEImageGenerator] 💾 Size: ${(stats.size / 1024).toFixed(2)}KB`);
            return filePath;
        } catch (error) {
            console.error('[DALLEImageGenerator] ❌ Error generating background image:', error.message);
            if (error.response) {
                console.error('[DALLEImageGenerator] API Response:', error.response.status, error.response.statusText);
            }
            return null; // Return null, caller will handle fallback
        }
    }

    /**
     * Generate random overlay image using DALL-E 3
     */
    async generateRandomImage(artistName, width = 400, height = 400) {
        if (!this.openai) {
            console.warn('[DALLEImageGenerator] OpenAI not initialized, returning null');
            return null;
        }

        try {
            const prompt = this.generateRandomOverlayPrompt(artistName);
            console.log(`[DALLEImageGenerator] Generating random overlay image: "${prompt.substring(0, 100)}..."`);
            
            // Use square format for overlay images
            const imageResponse = await this.openai.images.generate({
                model: "dall-e-3",
                prompt: prompt,
                n: 1,
                size: "1024x1024",
                quality: "standard", // Standard quality for overlay images (faster/cheaper)
                style: "vivid" // More vibrant for overlay elements
            });

            const imageUrl = imageResponse.data[0].url;
            if (!imageUrl) {
                throw new Error('No image URL received from OpenAI');
            }

            // Download and save the image
            const downloadResponse = await fetch(imageUrl);
            const buffer = await downloadResponse.arrayBuffer();
            const fileName = `overlay_${uuidv4()}.png`;
            const filePath = path.join(this.outputDir, fileName);
            
            await fs.writeFile(filePath, Buffer.from(buffer));
            console.log(`[DALLEImageGenerator] ✅ Random overlay image generated: ${filePath}`);
            return filePath;
        } catch (error) {
            console.error('[DALLEImageGenerator] Error generating random image:', error.message);
            return null; // Return null, caller will handle gracefully
        }
    }

    /**
     * Generate multiple random overlay images
     */
    async generateRandomImages(artistName, count = 2, width = 400, height = 400) {
        const images = [];
        for (let i = 0; i < count; i++) {
            const imagePath = await this.generateRandomImage(artistName, width, height);
            if (imagePath) {
                images.push(imagePath);
            }
        }
        return images;
    }
}

