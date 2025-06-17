const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve the frontend HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend.html'));
});

app.listen(PORT, () => {
    console.log(`Frontend server running at http://localhost:${PORT}`);
    console.log(`Backend API should be running at http://localhost:3001`);
});