import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../../../packages/shared/config';

export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
