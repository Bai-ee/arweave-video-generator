# Local Development Setup

## Quick Start

The local development server is now configured and ready to use.

### Starting the Server

```bash
npm run dev
```

Or:

```bash
npm start
```

### Accessing the Application

Once the server is running, access your application at:

**Main Application**: http://localhost:3003

**Available Pages**:
- Main page: http://localhost:3003/
- Archive: http://localhost:3003/archive.html
- Scanner: http://localhost:3003/scanner.html
- Strategy: http://localhost:3003/strategy.html
- Tracker: http://localhost:3003/tracker.html

### API Endpoints

All API endpoints are available at:
- http://localhost:3003/api/*

For example:
- http://localhost:3003/api/artists
- http://localhost:3003/api/videos
- http://localhost:3003/api/generate-video

### Environment Variables

For full functionality, you'll need to set up environment variables. The server will work for frontend preview, but API endpoints may require:

- `FIREBASE_SERVICE_ACCOUNT_KEY` - Firebase service account JSON (stringified)
- `FIREBASE_STORAGE_BUCKET` - Firebase Storage bucket name
- `ARWEAVE_WALLET_JWK` - Arweave wallet JSON (stringified)
- `OPENAI_API_KEY` - OpenAI API key (for DALL-E fallback)

You can create a `.env.local` file in the root directory with these variables, or set them in your Vercel project settings.

### Stopping the Server

Press `Ctrl+C` in the terminal where the server is running.

### Troubleshooting

**Port 3003 already in use?**
- The server is configured to use port 3003
- If the port is in use, you can change it in package.json scripts or use: `vercel dev -p [PORT]`

**API endpoints not working?**
- Ensure environment variables are set
- Check the terminal for error messages
- Some features require Firebase and Arweave credentials

**Changes not reflecting?**
- The server auto-reloads on file changes
- Hard refresh your browser (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
