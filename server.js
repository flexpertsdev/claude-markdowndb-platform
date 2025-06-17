const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { claudeCode } = require('@anthropic-ai/claude-code');
const { MarkdownDB } = require('mddb');
const chokidar = require('chokidar');
const multer = require('multer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Workspace configuration
const WORKSPACES_DIR = path.join(__dirname, 'workspaces');

// Ensure workspaces directory exists
fs.mkdir(WORKSPACES_DIR, { recursive: true }).catch(console.error);

// Initialize MarkdownDB
const mddb = new MarkdownDB({
  client: "sqlite3",
  connection: {
    filename: path.join(__dirname, "workspaces.db")
  }
});

// Initialize MarkdownDB connection
let mddbClient;
mddb.init().then(client => {
  mddbClient = client;
  console.log('MarkdownDB initialized');
});

// File upload configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const userId = req.body.userId || 'anonymous';
    const userDir = path.join(WORKSPACES_DIR, `user-${userId}`, 'uploads');
    await fs.mkdir(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// Ensure user workspace exists
async function ensureUserWorkspace(userId) {
  const userWorkspace = path.join(WORKSPACES_DIR, `user-${userId}`);
  const dirs = ['project', 'docs', 'notes', 'uploads'];
  
  for (const dir of dirs) {
    await fs.mkdir(path.join(userWorkspace, dir), { recursive: true });
  }
  
  // Create initial README if it doesn't exist
  const readmePath = path.join(userWorkspace, 'README.md');
  try {
    await fs.access(readmePath);
  } catch {
    await fs.writeFile(readmePath, `# Workspace for User ${userId}

Welcome to your personal development workspace!

## Folders
- \`project/\` - Your code files
- \`docs/\` - Documentation
- \`notes/\` - Personal notes
- \`uploads/\` - Uploaded files

## Getting Started
Start chatting with Claude to build your application!
`);
  }
  
  // Index the workspace with MarkdownDB
  if (mddbClient) {
    await mddbClient.indexFolder({
      folderPath: userWorkspace,
      watchMode: true
    });
  }
  
  return userWorkspace;
}

// API Routes

// Initialize workspace
app.post('/api/workspace/init', async (req, res) => {
  try {
    const { userId } = req.body;
    const workspace = await ensureUserWorkspace(userId);
    
    res.json({
      success: true,
      workspace: workspace,
      message: 'Workspace initialized'
    });
  } catch (error) {
    console.error('Workspace init error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Chat with Claude
app.post('/api/chat', async (req, res) => {
  try {
    const { userId, message, sessionId } = req.body;
    const userWorkspace = await ensureUserWorkspace(userId);
    
    console.log(`Processing chat for user ${userId}: ${message}`);
    
    // Run Claude Code with user's workspace
    const result = await claudeCode({
      cwd: userWorkspace,
      input: message,
      outputFormat: 'json',
      resume: sessionId,
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
      apiKey: process.env.ANTHROPIC_API_KEY,
      print: true, // Non-interactive mode
      maxTurns: 5 // Limit turns for safety
    });
    
    res.json({
      success: true,
      result: result,
      workspacePath: userWorkspace
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.stack 
    });
  }
});

// Get workspace files
app.get('/api/workspace/:userId/files', async (req, res) => {
  try {
    const { userId } = req.params;
    const userWorkspace = await ensureUserWorkspace(userId);
    
    if (!mddbClient) {
      return res.status(503).json({ error: 'MarkdownDB not ready' });
    }
    
    // Query files from MarkdownDB
    const files = await mddbClient.getFiles({
      folder: `user-${userId}`
    });
    
    res.json({
      success: true,
      files: files,
      workspace: userWorkspace
    });
    
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get file content
app.get('/api/workspace/:userId/file', async (req, res) => {
  try {
    const { userId } = req.params;
    const { path: filePath } = req.query;
    
    const userWorkspace = path.join(WORKSPACES_DIR, `user-${userId}`);
    const fullPath = path.join(userWorkspace, filePath);
    
    // Security check - ensure file is within user workspace
    if (!fullPath.startsWith(userWorkspace)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const content = await fs.readFile(fullPath, 'utf-8');
    res.json({
      success: true,
      content: content,
      path: filePath
    });
    
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload file
app.post('/api/workspace/upload', upload.single('file'), async (req, res) => {
  try {
    const { userId } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    res.json({
      success: true,
      file: {
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size
      }
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search workspace
app.get('/api/workspace/:userId/search', async (req, res) => {
  try {
    const { userId } = req.params;
    const { query, tags } = req.query;
    
    if (!mddbClient) {
      return res.status(503).json({ error: 'MarkdownDB not ready' });
    }
    
    const searchOptions = {
      folder: `user-${userId}`
    };
    
    if (tags) {
      searchOptions.tags = tags.split(',');
    }
    
    const files = await mddbClient.getFiles(searchOptions);
    
    // If query provided, filter by content
    let results = files;
    if (query) {
      results = files.filter(file => 
        file.content?.toLowerCase().includes(query.toLowerCase()) ||
        file.metadata?.title?.toLowerCase().includes(query.toLowerCase())
      );
    }
    
    res.json({
      success: true,
      results: results,
      query: query,
      tags: tags
    });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create example .env file if it doesn't exist
async function createExampleEnv() {
  const envPath = path.join(__dirname, '.env');
  const envExamplePath = path.join(__dirname, '.env.example');
  
  try {
    await fs.access(envPath);
  } catch {
    const envContent = `# Anthropic API Key
ANTHROPIC_API_KEY=your_api_key_here

# Server Port
PORT=3001`;
    
    await fs.writeFile(envExamplePath, envContent);
    console.log('Created .env.example file');
  }
}

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Claude + MarkdownDB Platform running on port ${PORT}`);
  console.log(`Workspaces directory: ${WORKSPACES_DIR}`);
  createExampleEnv();
});