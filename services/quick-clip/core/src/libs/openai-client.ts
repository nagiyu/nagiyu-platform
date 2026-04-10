import OpenAI from 'openai';

export const createOpenAIClient = (apiKey: string): OpenAI => new OpenAI({ apiKey, maxRetries: 0 });
