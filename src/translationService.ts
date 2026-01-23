import { SentenceTiming } from './speechService';

export interface TranslationResult {
  success: boolean;
  translations?: string[];
  error?: string;
}

export interface TranslatedSentenceTiming extends SentenceTiming {
  translatedSentence: string;
}

// Translate sentences to Chinese using Azure OpenAI
export async function translateSentencesToChinese(
  sentences: string[],
  endpoint: string,
  apiKey: string,
  deploymentName: string
): Promise<TranslationResult> {
  try {
    console.log(`Translating ${sentences.length} sentences to Chinese...`);

    // Translate all sentences in parallel for better performance
    const translationPromises = sentences.map((sentence, index) => 
      translateSingleSentence(sentence, endpoint, apiKey, deploymentName, index)
    );

    const results = await Promise.all(translationPromises);
    
    // Check for any failures
    const failedResult = results.find(r => !r.success);
    if (failedResult) {
      return { success: false, error: failedResult.error };
    }

    // Sort by index and extract translations
    results.sort((a, b) => a.index - b.index);
    const translations = results.map(r => r.translation!);

    console.log(`Translation completed for ${translations.length} sentences`);
    return { success: true, translations };
  } catch (error) {
    console.error('Translation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown translation error',
    };
  }
}

async function translateSingleSentence(
  sentence: string,
  endpoint: string,
  apiKey: string,
  deploymentName: string,
  index: number
): Promise<{ success: boolean; translation?: string; error?: string; index: number }> {
  try {
    const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Translate the given text to Simplified Chinese. Only output the translation, nothing else. Maintain the same tone and style.',
          },
          {
            role: 'user',
            content: sentence,
          },
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Translation API error for sentence ${index + 1}:`, errorText);
      return {
        success: false,
        error: `API error: ${response.status} - ${errorText}`,
        index,
      };
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const translation = data.choices?.[0]?.message?.content?.trim();

    if (!translation) {
      return {
        success: false,
        error: 'No translation returned from API',
        index,
      };
    }

    console.log(`  Translated sentence ${index + 1}: "${sentence.substring(0, 30)}..." → "${translation.substring(0, 30)}..."`);
    return { success: true, translation, index };
  } catch (error) {
    console.error(`Error translating sentence ${index + 1}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      index,
    };
  }
}

// Generate bilingual SRT with original and Chinese translation
export function generateBilingualSRT(
  sentenceTimings: SentenceTiming[],
  translations: string[]
): string {
  if (sentenceTimings.length === 0) {
    return '';
  }

  const lines: string[] = [];

  for (let i = 0; i < sentenceTimings.length; i++) {
    const timing = sentenceTimings[i];
    const translation = translations[i] || '';

    lines.push(`${timing.index}`);
    lines.push(`${formatSRTTime(timing.startTime)} --> ${formatSRTTime(timing.endTime)}`);
    lines.push(timing.sentence);
    lines.push(translation);
    lines.push('');
  }

  return lines.join('\n');
}

// Generate Chinese-only SRT
export function generateChineseSRT(
  sentenceTimings: SentenceTiming[],
  translations: string[]
): string {
  if (sentenceTimings.length === 0) {
    return '';
  }

  const lines: string[] = [];

  for (let i = 0; i < sentenceTimings.length; i++) {
    const timing = sentenceTimings[i];
    const translation = translations[i] || '';

    lines.push(`${timing.index}`);
    lines.push(`${formatSRTTime(timing.startTime)} --> ${formatSRTTime(timing.endTime)}`);
    lines.push(translation);
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
