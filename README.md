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