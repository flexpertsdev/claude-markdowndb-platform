# Claude + MarkdownDB Platform

A scalable platform for AI-powered development using Claude Code SDK and MarkdownDB.

## Architecture

- **Real file system** - Each user gets a workspace folder
- **Claude Code SDK** - Runs Claude as a subprocess with full file access
- **MarkdownDB** - Indexes and queries markdown files
- **Simple API** - No containers, just files and processes

## Structure

```
/workspaces/
  /user-{id}/
    /project/     # User's code files
    /docs/        # Markdown documentation
    /notes/       # Personal notes
```

## Features

- Real file operations (Claude can run npm, create files, etc.)
- Queryable workspace (find files by tags, metadata, content)
- Live file watching and indexing
- No Docker/containers needed
- Scales with simple file storage

## Setup

1. Install dependencies: `npm install`
2. Create `.env` file with your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=your_key_here
   ```
3. Run the server: `npm start`
4. Open http://localhost:3000 in your browser

## Deployment

### Deploy to Railway (Recommended)

1. Fork or clone this repository to your GitHub account
2. Connect your GitHub account to Railway
3. Create a new project in Railway and select this repository
4. Add the required environment variable:
   - `ANTHROPIC_API_KEY` - Your Anthropic API key
5. Railway will automatically deploy your app

### Deploy to Other Platforms

This app can be deployed to any Node.js hosting platform (Render, Fly.io, Heroku, etc.). 
Just ensure you:
1. Set the `ANTHROPIC_API_KEY` environment variable
2. The platform supports persistent file storage (for workspaces)
3. Use the default start command: `npm start`

## Environment Variables

- `ANTHROPIC_API_KEY` (required) - Your Anthropic API key for Claude Code SDK
- `PORT` (optional) - Port number (defaults to 3000)