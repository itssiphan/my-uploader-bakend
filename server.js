const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { google } = require('googleapis');
const stream = require('stream');
const fs = require('fs');
const path = require('path');
const OAuth2 = google.auth.OAuth2;

const oauth2Client = new OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Multer setup for memory storage
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(cors());

// YouTube API client
const youtube = google.youtube({
  version: 'v3',
  auth: oauth2Client,
});

// Get OAuth2 URL for user authentication
app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.upload'],
  });
  res.redirect(authUrl);
});

// OAuth2 callback route
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    // Save tokens for future use (use environment variable in production)
    fs.writeFileSync(path.join(__dirname, 'tokens.json'), JSON.stringify(tokens));
    res.send('Authentication successful! You can close this tab.');
  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).send('Authentication failed: ' + error.message);
  }
});

// Welcome route for browser
app.get('/', (req, res) => {
  res.send('Welcome to the YouTube Uploader Backend!');
});

// Route to handle file uploads
app.post('/upload', upload.fields([{ name: 'video' }, { name: 'json' }]), async (req, res) => {
  try {
    const tokenPath = path.join(__dirname, 'tokens.json');

if (!fs.existsSync(tokenPath)) {
  return res.status(401).json({
    error: true,
    message: '?? Please authenticate first by visiting /auth',
  });
}

const tokens = JSON.parse(fs.readFileSync(tokenPath));
oauth2Client.setCredentials(tokens);

// Auto-refresh access token if expired
oauth2Client.getAccessToken().catch(async () => {
  try {
    const newTokens = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(newTokens.credentials);

    // Save new tokens to tokens.json
    fs.writeFileSync(tokenPath, JSON.stringify(newTokens.credentials));
    console.log('♻️ Tokens refreshed automatically!');
  } catch (refreshErr) {
    console.error('🔁 Token refresh failed:', refreshErr);
    return res.status(401).json({
      error: true,
      message: 'Token expired & refresh failed. Please authenticate again at /auth',
    });
  }
});


    const videoFile = req.files.video[0];
    const jsonFile = req.files.json[0];

    // Parse JSON from memory
    const metadata = JSON.parse(jsonFile.buffer.toString('utf-8'));
    console.log('Uploaded Metadata:', metadata);
    console.log('Uploaded Video:', videoFile.originalname);

    // Validate JSON
    if (!metadata.title) {
      throw new Error('JSON mein title missing hai!');
    }

    // Create readable stream from video buffer
    const videoStream = new stream.PassThrough();
    videoStream.end(videoFile.buffer);

    // Upload to YouTube
    const response = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: metadata.title,
          description: metadata.description || '',
          tags: metadata.tags || [],
          categoryId: metadata.categoryId || '22',
        },
        status: {
          privacyStatus: metadata.privacyStatus || 'public',
        },
      },
      media: {
        body: videoStream,
      },
    });

    res.status(200).json({
      message: 'Video uploaded to YouTube successfully!',
      title: metadata.title,
      videoId: response.data.id,
    });
  } catch (error) {
    console.error('Error processing files:', error);
    res.status(500).send('Error processing files: ' + error.message);
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is runing port ${port} pe`);
});