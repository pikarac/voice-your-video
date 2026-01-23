import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { synthesizeSpeechWithTimings, SentenceTiming } from './speechService';
import { translateSentencesToChinese, generateChineseSRT, generateBilingualSRT } from './translationService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Ensure output directory exists
const outputDir = path.join(__dirname, '../output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Serve output files
app.use('/output', express.static(outputDir));

// API endpoint to synthesize speech
app.post('/api/synthesize', async (req: Request, res: Response) => {
  try {
    const { text, voiceName = 'fr-FR-EloiseNeural', outputFormat = 'wav', translateToChinese = false } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({ error: 'Text is required and must be a non-empty string' });
      return;
    }

    const subscriptionKey = process.env.AZURE_SPEECH_KEY;
    const subscriptionRegion = process.env.AZURE_SPEECH_REGION;

    if (!subscriptionKey || !subscriptionRegion) {
      res.status(500).json({ error: 'Azure Speech Services not configured. Please set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION environment variables.' });
      return;
    }

    console.log(`Processing text (${text.length} characters) with voice: ${voiceName}, translate: ${translateToChinese}`);

    // Generate unique filename
    const timestamp = Date.now();
    const safeVoiceName = voiceName.replace(/[^a-zA-Z0-9]/g, '_');
    const baseFilename = `speech_${timestamp}_${safeVoiceName}`;
    const audioFilename = `${baseFilename}.${outputFormat}`;
    const srtFilename = `${baseFilename}.srt`;
    const chineseSrtFilename = `${baseFilename}_chinese.srt`;
    const bilingualSrtFilename = `${baseFilename}_bilingual.srt`;
    const audioFilePath = path.join(outputDir, audioFilename);
    const srtFilePath = path.join(outputDir, srtFilename);
    const chineseSrtFilePath = path.join(outputDir, chineseSrtFilename);
    const bilingualSrtFilePath = path.join(outputDir, bilingualSrtFilename);

    // Synthesize speech with sentence timings (sentence by sentence, then combine)
    const result = await synthesizeSpeechWithTimings({
      text: text.trim(),
      voiceName,
      subscriptionKey,
      subscriptionRegion,
      outputFilePath: audioFilePath,
    });

    if (!result.success) {
      res.status(500).json({ error: result.error || 'Speech synthesis failed' });
      return;
    }

    // Generate SRT file from sentence timings
    const srtContent = generateSRTFromSentences(result.sentenceTimings || []);
    fs.writeFileSync(srtFilePath, srtContent, 'utf8');

    // Response object
    const response: any = {
      success: true,
      audioUrl: `/output/${audioFilename}`,
      srtUrl: `/output/${srtFilename}`,
      audioFilename,
      srtFilename,
      audioSize: fs.statSync(audioFilePath).size,
      srtSize: fs.statSync(srtFilePath).size,
      duration: result.duration,
      sentenceCount: result.sentenceTimings?.length || 0,
    };

    // If translation is requested, translate to Chinese
    if (translateToChinese && result.sentenceTimings && result.sentenceTimings.length > 0) {
      const openaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
      const openaiApiKey = process.env.AZURE_OPENAI_API_KEY;
      const openaiDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

      if (!openaiEndpoint || !openaiApiKey || !openaiDeployment) {
        res.status(500).json({ 
          error: 'Azure OpenAI not configured for translation. Please set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT_NAME environment variables.' 
        });
        return;
      }

      // Extract sentences for translation
      const sentences = result.sentenceTimings.map(t => t.sentence);
      
      // Translate sentences to Chinese
      const translationResult = await translateSentencesToChinese(
        sentences,
        openaiEndpoint,
        openaiApiKey,
        openaiDeployment
      );

      if (!translationResult.success || !translationResult.translations) {
        res.status(500).json({ error: translationResult.error || 'Translation failed' });
        return;
      }

      // Generate Chinese-only SRT
      const chineseSrtContent = generateChineseSRT(result.sentenceTimings, translationResult.translations);
      fs.writeFileSync(chineseSrtFilePath, chineseSrtContent, 'utf8');

      // Generate bilingual SRT (original + Chinese)
      const bilingualSrtContent = generateBilingualSRT(result.sentenceTimings, translationResult.translations);
      fs.writeFileSync(bilingualSrtFilePath, bilingualSrtContent, 'utf8');

      // Add translation info to response
      response.chineseSrtUrl = `/output/${chineseSrtFilename}`;
      response.chineseSrtFilename = chineseSrtFilename;
      response.chineseSrtSize = fs.statSync(chineseSrtFilePath).size;
      response.bilingualSrtUrl = `/output/${bilingualSrtFilename}`;
      response.bilingualSrtFilename = bilingualSrtFilename;
      response.bilingualSrtSize = fs.statSync(bilingualSrtFilePath).size;
      response.translations = translationResult.translations;
    }

    res.json(response);
  } catch (error) {
    console.error('Synthesis error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'An unexpected error occurred' });
  }
});

// API endpoint to get available voices
app.get('/api/voices', async (req: Request, res: Response) => {
  // Return French and English Azure Neural voices
  const voices = [
    { name: 'fr-FR-VivienneMultilingualNeural', language: 'French (France)', gender: 'Female' },
    { name: 'fr-FR-EloiseNeural', language: 'French (France)', gender: 'Female' },
    { name: 'fr-FR-HenriNeural', language: 'French (France)', gender: 'Male' },
    { name: 'fr-FR-DeniseNeural', language: 'French (France)', gender: 'Female' },
    { name: 'fr-CA-SylvieNeural', language: 'French (Canada)', gender: 'Female' },
    { name: 'en-US-JennyNeural', language: 'English (US)', gender: 'Female' },
    { name: 'en-US-GuyNeural', language: 'English (US)', gender: 'Male' },
    { name: 'en-US-AriaNeural', language: 'English (US)', gender: 'Female' },
    { name: 'en-GB-SoniaNeural', language: 'English (UK)', gender: 'Female' },
    { name: 'en-GB-RyanNeural', language: 'English (UK)', gender: 'Male' },
  ];

  res.json({ voices });
});

// Generate SRT content from sentence timings
function generateSRTFromSentences(sentenceTimings: SentenceTiming[]): string {
  if (sentenceTimings.length === 0) {
    return '';
  }

  const lines: string[] = [];

  for (const timing of sentenceTimings) {
    lines.push(`${timing.index}`);
    lines.push(`${formatSRTTime(timing.startTime)} --> ${formatSRTTime(timing.endTime)}`);
    lines.push(timing.sentence);
    lines.push('');
  }

  return lines.join('\n');
}

function formatSRTTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ms = Math.floor(milliseconds % 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    configured: !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION)
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Azure Speech configured: ${!!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION)}`);
});
