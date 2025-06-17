import express from 'express';
import cors from 'cors';
import path from 'path';
import { promises as fs } from 'fs';
import { query as claudeCode } from '@anthropic-ai/claude-code';
import { MarkdownDB } from 'mddb';
import multer from 'multer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend.html'));
});

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
}).catch(err => {
  console.error('MarkdownDB init error:', err);
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
  
  // Index the workspace with MarkdownDB if available
  if (mddbClient) {
    try {
      await mddbClient.indexFolder({
        folderPath: userWorkspace,
        watchMode: true
      });
    } catch (err) {
      console.error('Error indexing folder:', err);
    }
  }
  
  return userWorkspace;
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Claude + MarkdownDB Platform is running' });
});

// Initialize workspace
app.post('/api/workspace/init', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
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
    
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ 
        error: 'ANTHROPIC_API_KEY not configured',
        details: 'Please set the ANTHROPIC_API_KEY environment variable'
      });
    }
    
    const userWorkspace = await ensureUserWorkspace(userId);
    
    console.log(`Processing chat for user ${userId}: ${message}`);
    
    // Run Claude Code with user's workspace
    const iterator = claudeCode({
      prompt: message,
      options: {
        cwd: userWorkspace,
        outputFormat: 'json',
        resume: sessionId,
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
        apiKey: process.env.ANTHROPIC_API_KEY,
        print: true, // Non-interactive mode
        maxTurns: 5 // Limit turns for safety
      }
    });
    
    // Collect the response
    let result = null;
    for await (const chunk of iterator) {
      result = chunk;
    }
    
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
    
    // For now, just list files manually since MarkdownDB might not be ready
    const files = [];
    
    async function scanDir(dir, basePath = '') {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(basePath, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scanDir(fullPath, relativePath);
        } else if (entry.isFile()) {
          files.push({
            file_path: relativePath,
            name: entry.name
          });
        }
      }
    }
    
    await scanDir(userWorkspace);
    
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Claude + MarkdownDB Platform running on http://localhost:${PORT}`);
  console.log(`Workspaces directory: ${WORKSPACES_DIR}`);
  
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  WARNING: ANTHROPIC_API_KEY not set in .env file');
  }
});