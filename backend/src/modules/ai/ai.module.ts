import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIService } from './ai.service';
import { PromptService } from './prompt.service';
import { OpenAIProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { ClaudeProvider } from './providers/claude.provider';

@Module({
  imports: [ConfigModule],
  providers: [OpenAIProvider, GeminiProvider, ClaudeProvider, AIService, PromptService],
  exports: [AIService, PromptService],
})
export class AIModule {}
