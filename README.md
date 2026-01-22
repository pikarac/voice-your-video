# Voice Your Video 🎙️

A TypeScript-based web application that converts text to speech using Azure Cognitive Services, generating both audio files and synchronized SRT subtitle files.

## Features

- 🎤 Text-to-speech synthesis using Azure Speech Services
- 📝 Automatic SRT subtitle generation with word-level timing
- 🌍 Multiple language and voice support (French, English, German, Spanish, etc.)
- 🎨 Modern, responsive web interface
- ⬇️ Download generated audio (WAV) and subtitle (SRT) files
- 🔊 Built-in audio player for preview

## Prerequisites

- Node.js (v16 or later)
- npm or yarn
- Azure Speech Services subscription key

## Installation

1. Clone the repository:
```bash
cd voice-your-video
```

2. Install dependencies:
```bash
npm install
```

3. Configure Azure Speech Services:

Copy the example environment file and update with your credentials:
```bash
cp .env.example .env
```

Edit `.env` with your Azure Speech Services key and region:
```env
AZURE_SPEECH_KEY=your_subscription_key_here
AZURE_SPEECH_REGION=eastus
```

## Usage

### Development Mode

Run the server in development mode with TypeScript:
```bash
npm run dev
```

### Production Mode

Build and run the compiled JavaScript:
```bash
npm run build
npm start
```

The server will start at `http://localhost:3000`

## API Endpoints

### POST /api/synthesize

Synthesize text to speech with SRT generation.

**Request Body:**
```json
{
  "text": "Your text to synthesize",
  "voiceName": "fr-FR-EloiseNeural",
  "outputFormat": "wav"
}
```

**Response:**
```json
{
  "success": true,
  "audioUrl": "/output/speech_123456_fr_FR_EloiseNeural.wav",
  "srtUrl": "/output/speech_123456_fr_FR_EloiseNeural.srt",
  "audioFilename": "speech_123456_fr_FR_EloiseNeural.wav",
  "srtFilename": "speech_123456_fr_FR_EloiseNeural.srt",
  "audioSize": 123456,
  "srtSize": 789,
  "duration": 5000,
  "wordCount": 25
}
```

### GET /api/voices

Get list of available voices.

### GET /api/health

Health check endpoint.

## Available Voices

The application supports multiple Azure Neural voices including:

| Voice Name | Language | Gender |
|------------|----------|--------|
| fr-FR-EloiseNeural | French (France) | Female |
| fr-FR-HenriNeural | French (France) | Male |
| en-US-JennyNeural | English (US) | Female |
| en-US-GuyNeural | English (US) | Male |
| de-DE-KatjaNeural | German | Female |
| es-ES-ElviraNeural | Spanish | Female |
| And many more... | | |

## Project Structure

```
voice-your-video/
├── src/
│   ├── server.ts          # Express server setup
│   └── speechService.ts   # Azure Speech SDK integration
├── public/
│   ├── index.html         # Web interface
│   ├── styles.css         # Styling
│   └── app.js             # Frontend JavaScript
├── output/                # Generated audio and SRT files
├── package.json
├── tsconfig.json
└── .env                   # Environment configuration
```

## Technologies Used

- **Backend**: Node.js, Express, TypeScript
- **Speech**: Microsoft Cognitive Services Speech SDK
- **Frontend**: Vanilla JavaScript, HTML5, CSS3

## License

MIT
A short‑video creation assistant that generates voiceovers, subtitle timelines, and translated captions from text.
