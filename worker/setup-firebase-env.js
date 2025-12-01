/**
 * Helper script to add Firebase credentials to .env file
 * 
 * Usage:
 *   1. Save your Firebase service account JSON to a file (e.g., firebase-key.json)
 *   2. Run: node setup-firebase-env.js firebase-key.json
 * 
 * OR
 * 
 *   1. Run: node setup-firebase-env.js
 *   2. Paste your Firebase service account JSON when prompted
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_FILE = path.join(__dirname, '.env');

async function setupFirebaseEnv(jsonFilePath = null) {
  console.log('\n🔧 Firebase Environment Setup\n');
  console.log('='.repeat(60));

  let serviceAccountJson;

  if (jsonFilePath) {
    // Read from file
    try {
      const jsonContent = await fs.readFile(jsonFilePath, 'utf8');
      serviceAccountJson = JSON.parse(jsonContent);
      console.log(`✅ Loaded Firebase credentials from: ${jsonFilePath}`);
    } catch (error) {
      console.error(`❌ Error reading JSON file: ${error.message}`);
      process.exit(1);
    }
  } else {
    // Read from stdin
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('📋 Please paste your Firebase service account JSON:');
    console.log('   (Press Ctrl+D or Ctrl+Z when done, or type "done" on a new line)\n');

    let jsonLines = [];
    let done = false;

    rl.on('line', (line) => {
      if (line.trim().toLowerCase() === 'done') {
        done = true;
        rl.close();
      } else {
        jsonLines.push(line);
      }
    });

    rl.on('close', () => {
      if (!done && jsonLines.length === 0) {
        console.error('❌ No JSON provided');
        process.exit(1);
      }

      try {
        const jsonString = jsonLines.join('\n');
        serviceAccountJson = JSON.parse(jsonString);
        console.log('✅ JSON parsed successfully');
        addToEnvFile(serviceAccountJson);
      } catch (error) {
        console.error(`❌ Error parsing JSON: ${error.message}`);
        process.exit(1);
      }
    });

    return; // Wait for input
  }

  // If we have the JSON, add it to .env
  addToEnvFile(serviceAccountJson);
}

function addToEnvFile(serviceAccountJson) {
  try {
    // Read existing .env file
    let envContent = '';
    if (fs.existsSync(ENV_FILE)) {
      envContent = fs.readFileSync(ENV_FILE, 'utf8');
    }

    // Convert JSON to string (single line, escaped)
    const jsonString = JSON.stringify(serviceAccountJson);
    
    // Check if FIREBASE_SERVICE_ACCOUNT_KEY already exists
    if (envContent.includes('FIREBASE_SERVICE_ACCOUNT_KEY=')) {
      // Update existing
      envContent = envContent.replace(
        /FIREBASE_SERVICE_ACCOUNT_KEY=.*/,
        `FIREBASE_SERVICE_ACCOUNT_KEY=${jsonString}`
      );
      console.log('✅ Updated existing FIREBASE_SERVICE_ACCOUNT_KEY in .env');
    } else {
      // Add new
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += `FIREBASE_SERVICE_ACCOUNT_KEY=${jsonString}\n`;
      envContent += `FIREBASE_STORAGE_BUCKET=editvideos-63486.firebasestorage.app\n`;
      console.log('✅ Added FIREBASE_SERVICE_ACCOUNT_KEY to .env');
    }

    // Write back to .env
    fs.writeFileSync(ENV_FILE, envContent);
    console.log(`\n✅ Firebase credentials added to: ${ENV_FILE}`);
    console.log('\n✨ Setup complete! You can now run: node upload-chicago-videos.js\n');

  } catch (error) {
    console.error(`❌ Error writing to .env file: ${error.message}`);
    process.exit(1);
  }
}

// Get JSON file path from command line args
const jsonFilePath = process.argv[2] || null;

setupFirebaseEnv(jsonFilePath);


