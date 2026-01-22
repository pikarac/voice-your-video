import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import * as fs from 'fs';
import * as path from 'path';

export interface WordTiming {
  word: string;
  startTime: number; // in milliseconds
  endTime: number;   // in milliseconds
}

export interface SentenceTiming {
  sentence: string;
  startTime: number; // in milliseconds
  endTime: number;   // in milliseconds
  index: number;
}

export interface SynthesisOptions {
  text: string;
  voiceName: string;
  subscriptionKey: string;
  subscriptionRegion: string;
  outputFilePath: string;
}

export interface SynthesisResult {
  success: boolean;
  error?: string;
  wordTimings?: WordTiming[];
  sentenceTimings?: SentenceTiming[];
  duration?: number; // in milliseconds
}

// Split text into sentences by period
function splitIntoSentences(text: string): string[] {
  // Split by period, but keep the period with the sentence
  const sentences = text
    .split(/(?<=\.)\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  return sentences;
}

// Synthesize a single sentence and return the audio buffer and duration
async function synthesizeSentence(
  sentence: string,
  voiceName: string,
  subscriptionKey: string,
  subscriptionRegion: string,
  tempFilePath: string
): Promise<{ success: boolean; duration: number; error?: string }> {
  return new Promise((resolve) => {
    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, subscriptionRegion);
      speechConfig.speechSynthesisVoiceName = voiceName;

      const audioConfig = sdk.AudioConfig.fromAudioFileOutput(tempFilePath);
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

      let duration = 0;

      // Track word boundaries to get accurate duration
      synthesizer.wordBoundary = (s, e) => {
        const endTime = (e.audioOffset + e.duration) / 10000; // Convert to ms
        if (endTime > duration) {
          duration = endTime;
        }
      };

      synthesizer.speakTextAsync(
        sentence,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            synthesizer.close();
            
            // If duration wasn't captured via word boundary, estimate from audio
            if (duration === 0 && result.audioDuration) {
              duration = result.audioDuration / 10000; // Convert from 100ns to ms
            }
            
            resolve({ success: true, duration });
          } else if (result.reason === sdk.ResultReason.Canceled) {
            const cancellation = sdk.CancellationDetails.fromResult(result);
            synthesizer.close();
            resolve({
              success: false,
              duration: 0,
              error: `Synthesis canceled: ${cancellation.errorDetails || cancellation.reason}`,
            });
          } else {
            synthesizer.close();
            resolve({
              success: false,
              duration: 0,
              error: `Unexpected result: ${result.reason}`,
            });
          }
        },
        (error) => {
          synthesizer.close();
          resolve({
            success: false,
            duration: 0,
            error: error.toString(),
          });
        }
      );
    } catch (error) {
      resolve({
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

// Read WAV file and return header info and raw audio data
function readWavFile(filePath: string): { header: Buffer; data: Buffer; sampleRate: number; channels: number; bitsPerSample: number; durationMs: number } | null {
  try {
    const buffer = fs.readFileSync(filePath);
    
    // Parse WAV header
    const riff = buffer.toString('ascii', 0, 4);
    if (riff !== 'RIFF') {
      console.error('Not a valid WAV file');
      return null;
    }

    const format = buffer.toString('ascii', 8, 12);
    if (format !== 'WAVE') {
      console.error('Not a valid WAV file');
      return null;
    }

    // Find fmt chunk
    let offset = 12;
    let channels = 1;
    let sampleRate = 16000;
    let bitsPerSample = 16;
    
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      
      if (chunkId === 'fmt ') {
        channels = buffer.readUInt16LE(offset + 10);
        sampleRate = buffer.readUInt32LE(offset + 12);
        bitsPerSample = buffer.readUInt16LE(offset + 22);
      }
      
      if (chunkId === 'data') {
        const dataStart = offset + 8;
        const audioData = buffer.slice(dataStart, dataStart + chunkSize);
        const header = buffer.slice(0, dataStart);
        
        // Calculate actual duration from audio data
        const bytesPerSample = bitsPerSample / 8;
        const bytesPerSecond = sampleRate * channels * bytesPerSample;
        const durationMs = (chunkSize / bytesPerSecond) * 1000;
        
        return { header, data: audioData, sampleRate, channels, bitsPerSample, durationMs };
      }
      
      offset += 8 + chunkSize;
    }
    
    return null;
  } catch (error) {
    console.error('Error reading WAV file:', error);
    return null;
  }
}

// Create a WAV file from combined audio data
function createWavFile(outputPath: string, audioData: Buffer, sampleRate: number, channels: number, bitsPerSample: number): void {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = audioData.length;
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  
  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // audio format (PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  
  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  // Write the combined file
  const outputBuffer = Buffer.concat([header, audioData]);
  fs.writeFileSync(outputPath, outputBuffer);
}

// Main function: synthesize speech sentence by sentence and combine
export async function synthesizeSpeechWithTimings(options: SynthesisOptions): Promise<SynthesisResult> {
  const { text, voiceName, subscriptionKey, subscriptionRegion, outputFilePath } = options;

  try {
    // Split text into sentences
    const sentences = splitIntoSentences(text);
    
    if (sentences.length === 0) {
      return { success: false, error: 'No sentences found in text' };
    }

    console.log(`Processing ${sentences.length} sentence(s) in parallel...`);

    const tempDir = path.dirname(outputFilePath);
    const timestamp = Date.now();
    
    // Create synthesis tasks for all sentences
    const synthesisPromises = sentences.map((sentence, i) => {
      const tempFile = path.join(tempDir, `temp_sentence_${timestamp}_${i}.wav`);
      console.log(`  Queuing sentence ${i + 1}/${sentences.length}: "${sentence.substring(0, 50)}${sentence.length > 50 ? '...' : ''}"`);
      
      return synthesizeSentence(
        sentence,
        voiceName,
        subscriptionKey,
        subscriptionRegion,
        tempFile
      ).then(result => ({
        index: i,
        sentence,
        tempFile,
        result,
      }));
    });

    // Wait for all synthesis tasks to complete in parallel
    console.log('  Synthesizing all sentences in parallel...');
    const startTime = Date.now();
    const synthesisResults = await Promise.all(synthesisPromises);
    const elapsedTime = Date.now() - startTime;
    console.log(`  All sentences synthesized in ${elapsedTime}ms`);

    // Check for any failures
    const failedResult = synthesisResults.find(r => !r.result.success);
    if (failedResult) {
      // Clean up all temp files
      synthesisResults.forEach(r => {
        if (fs.existsSync(r.tempFile)) fs.unlinkSync(r.tempFile);
      });
      return { success: false, error: failedResult.result.error };
    }

    // Sort results by index to maintain original order
    synthesisResults.sort((a, b) => a.index - b.index);

    // Read all audio files and get actual durations from WAV data
    console.log('Reading audio files and calculating durations...');
    
    const audioBuffers: Buffer[] = [];
    const sentenceDurations: { sentence: string; durationMs: number }[] = [];
    let sampleRate = 16000;
    let channels = 1;
    let bitsPerSample = 16;

    for (const { sentence, tempFile, index } of synthesisResults) {
      const wavData = readWavFile(tempFile);
      
      if (wavData) {
        audioBuffers.push(wavData.data);
        sampleRate = wavData.sampleRate;
        channels = wavData.channels;
        bitsPerSample = wavData.bitsPerSample;
        
        sentenceDurations.push({ sentence, durationMs: wavData.durationMs });
        console.log(`  Sentence ${index + 1} duration: ${wavData.durationMs.toFixed(0)}ms`);
      } else {
        console.error(`Failed to read WAV file: ${tempFile}`);
        sentenceDurations.push({ sentence, durationMs: 0 });
      }
    }

    // Create combined WAV file
    const combinedAudio = Buffer.concat(audioBuffers);
    createWavFile(outputFilePath, combinedAudio, sampleRate, channels, bitsPerSample);

    // Calculate sentence timings based on actual audio durations
    const sentenceTimings: SentenceTiming[] = [];
    let currentTime = 0;

    for (let i = 0; i < sentenceDurations.length; i++) {
      const { sentence, durationMs } = sentenceDurations[i];
      
      sentenceTimings.push({
        sentence,
        startTime: currentTime,
        endTime: currentTime + durationMs,
        index: i + 1,
      });

      currentTime += durationMs;
    }

    // Clean up temp files
    synthesisResults.forEach(r => {
      if (fs.existsSync(r.tempFile)) fs.unlinkSync(r.tempFile);
    });

    console.log(`Synthesis completed. Total duration: ${currentTime.toFixed(0)}ms, Sentences: ${sentenceTimings.length}`);

    return {
      success: true,
      sentenceTimings,
      duration: currentTime,
    };
  } catch (error) {
    console.error('Exception during synthesis:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during synthesis',
    };
  }
}

// Alternative method using SSML for more control
export async function synthesizeSpeechWithSSML(options: SynthesisOptions & { ssml?: string }): Promise<SynthesisResult> {
  const { text, voiceName, subscriptionKey, subscriptionRegion, outputFilePath, ssml } = options;

  return new Promise((resolve) => {
    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, subscriptionRegion);
      speechConfig.speechSynthesisVoiceName = voiceName;

      const audioConfig = sdk.AudioConfig.fromAudioFileOutput(outputFilePath);
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

      const wordTimings: WordTiming[] = [];
      let lastWordEndTime = 0;

      synthesizer.wordBoundary = (s, e) => {
        const wordTiming: WordTiming = {
          word: e.text,
          startTime: e.audioOffset / 10000,
          endTime: (e.audioOffset + e.duration) / 10000,
        };
        wordTimings.push(wordTiming);
        lastWordEndTime = wordTiming.endTime;
      };

      // Use SSML if provided, otherwise wrap text in basic SSML
      const ssmlContent = ssml || `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
          <voice name="${voiceName}">
            ${escapeXml(text)}
          </voice>
        </speak>
      `;

      synthesizer.speakSsmlAsync(
        ssmlContent,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            synthesizer.close();
            resolve({
              success: true,
              wordTimings,
              duration: lastWordEndTime,
            });
          } else if (result.reason === sdk.ResultReason.Canceled) {
            const cancellation = sdk.CancellationDetails.fromResult(result);
            synthesizer.close();
            resolve({
              success: false,
              error: `Synthesis canceled: ${cancellation.errorDetails || cancellation.reason}`,
            });
          } else {
            synthesizer.close();
            resolve({
              success: false,
              error: `Unexpected result: ${result.reason}`,
            });
          }
        },
        (error) => {
          synthesizer.close();
          resolve({
            success: false,
            error: error.toString(),
          });
        }
      );
    } catch (error) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
