const express = require('express');
const AWS = require('aws-sdk');
const cors = require('cors');
const path = require('path');
const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/src', express.static('src'));

// Configure AWS (uses your existing CLI credentials)
const polly = new AWS.Polly({
    region: 'eu-west-2'
});

// TTS endpoint
app.post('/tts', async (req, res) => {
    try {
        const { text } = req.body;
        
        const params = {
            Text: text,
            OutputFormat: 'mp3',
            VoiceId: 'Geraint', // or any voice you prefer
            Engine: 'standard', // for better quality
            SampleRate: '22050',
            TextType: 'text',
            LanguageCode: 'en-GB'
        };

        const result = await polly.synthesizeSpeech(params).promise();
        
        res.set('Content-Type', 'audio/mpeg');
        res.send(result.AudioStream);
    } catch (error) {
        console.error('TTS Error:', error);
        res.status(500).json({ error: 'TTS failed' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});