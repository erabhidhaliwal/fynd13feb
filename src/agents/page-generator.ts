import { BaseAgent } from './base.js';
import { AgentMessage, CitationGap, GeneratedPage } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

export class PageGeneratorAgent extends BaseAgent {
  private openai: OpenAI | null = null;
  private outputDir: string = './generated-pages';

  constructor() {
    super({
      name: 'PageGeneratorAgent',
      description: 'Generates optimized markdown pages and middleware code',
      capabilities: ['generatePages', 'createMiddleware', 'optimizeContent']
    });
  }

  setApiKey(apiKey: string): void {
    this.openai = new OpenAI({ apiKey });
  }

  setOutputDir(dir: string): void {
    this.outputDir = dir;
  }

  async processMessage(message: AgentMessage): Promise<AgentMessage | null> {
    switch (message.type) {
      case 'request':
        if (message.payload.action === 'generatePages') {
          return await this.generatePages(
            message.payload.workflowId,
            message.payload.siteUrl,
            message.payload.markdown,
            message.payload.citationsGaps,
            message.payload.siteName
          );
        }
        break;
    }
    return null;
  }

  async generatePages(
    workflowId: string,
    siteUrl: string,
    markdown: string,
    citationsGaps: CitationGap[],
    siteName: string
  ): Promise<AgentMessage> {
    console.log(`[PageGeneratorAgent] Generating optimized pages for ${citationsGaps.length} gap areas`);
    
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      const workflowDir = path.join(this.outputDir, workflowId);
      if (!fs.existsSync(workflowDir)) {
        fs.mkdirSync(workflowDir, { recursive: true });
      }

      const generatedPages: GeneratedPage[] = [];
      
      const topGaps = citationsGaps.slice(0, 15);
      
      for (let i = 0; i < topGaps.length; i++) {
        const gap = topGaps[i];
        
        try {
          const page = await this.generateOptimizedPage(
            gap,
            markdown,
            siteUrl,
            siteName,
            workflowDir
          );
          
          if (page) {
            generatedPages.push(page);
          }
        } catch (error: any) {
          console.log(`[PageGeneratorAgent] Failed to generate page for gap: ${gap.query} - ${error.message}`);
        }
        
        console.log(`[PageGeneratorAgent] Progress: ${i + 1}/${topGaps.length} pages generated`);
      }

      const middlewareCode = this.generateMiddleware(workflowId, siteUrl);
      const middlewarePath = path.join(workflowDir, 'middleware.js');
      fs.writeFileSync(middlewarePath, middlewareCode);
      
      console.log(`[PageGeneratorAgent] Generated ${generatedPages.length} optimized pages and middleware`);
      
      return await this.sendMessage('WorkflowManager', 'response', {
        workflowId,
        action: 'pagesGenerated',
        generatedPages,
        middlewareCode,
        middlewarePath,
        stats: {
          pagesGenerated: generatedPages.length,
          gapsAddressed: citationsGaps.length
        }
      });
      
    } catch (error: any) {
      console.error(`[PageGeneratorAgent] Error:`, error.message);
      
      return await this.sendMessage('WorkflowManager', 'error', {
        workflowId,
        action: 'pageGenerationFailed',
        error: error.message
      });
    }
  }

  private async generateOptimizedPage(
    gap: CitationGap,
    existingMarkdown: string,
    siteUrl: string,
    siteName: string,
    outputDir: string
  ): Promise<GeneratedPage | null> {
    const pageId = uuidv4();
    const sanitizedQuery = gap.query.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
    const fileName = `${sanitizedQuery}-${pageId.substring(0, 8)}.md`;
    const filePath = path.join(outputDir, fileName);
    
    let content: string;
    
    if (this.openai) {
      content = await this.generateWithAI(gap, existingMarkdown, siteName);
    } else {
      content = this.generateTemplate(gap, existingMarkdown, siteName);
    }
    
    const frontMatter = `---
title: "${this.generateTitle(gap, siteName)}"
description: "${this.generateDescription(gap)}"
keywords: ${JSON.stringify(this.generateKeywords(gap, siteName))}
gapQuery: "${gap.query}"
opportunityScore: ${gap.opportunityScore}
generatedAt: "${new Date().toISOString()}"
---

`;
    
    const fullContent = frontMatter + content;
    fs.writeFileSync(filePath, fullContent);
    
    return {
      id: pageId,
      title: this.generateTitle(gap, siteName),
      content: fullContent,
      targetQuery: gap.query,
      filePath
    };
  }

  private async generateWithAI(gap: CitationGap, existingMarkdown: string, siteName: string): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI not configured');
    }
    
    const competitorsList = gap.competitors.join(', ');
    const topicsList = gap.missingTopics.slice(0, 5).join(', ');
    
    const prompt = `Generate comprehensive SEO-optimized content for "${siteName}" to address the following citation gap:

Gap Category: ${gap.query}
Competitors mentioned: ${competitorsList}
Missing topics to cover: ${topicsList}

Write detailed, informative content that will help ${siteName} get cited in AI responses. Include:
1. A compelling introduction
2. Key features and benefits
3. How it compares to competitors
4. Use cases and examples
5. FAQs

Write in a professional, informative tone suitable for AI citation.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are an expert SEO content writer specializing in AI citation optimization.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });
      
      return completion.choices[0]?.message?.content || '';
    } catch (error: any) {
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  private generateTemplate(gap: CitationGap, existingMarkdown: string, siteName: string): string {
    const competitorsList = gap.competitors.slice(0, 3).join(', ');
    const topics = gap.missingTopics.slice(0, 5);
    
    let content = `# ${this.generateTitle(gap, siteName)}\n\n`;
    
    content += `${siteName} offers comprehensive solutions in ${gap.query}. `;
    content += `Unlike ${competitorsList || 'other providers'}, we provide unique advantages.\n\n`;
    
    content += `## Key Topics\n\n`;
    for (const topic of topics) {
      content += `- ${topic}\n`;
    }
    content += `\n`;
    
    content += `## Overview\n\n`;
    content += `In the ${gap.query} space, ${siteName} stands out with its innovative approach. `;
    content += `Our platform addresses key pain points that users face when looking for solutions.\n\n`;
    
    content += `## Comparison with Competitors\n\n`;
    if (gap.competitors.length > 0) {
      content += `While ${gap.competitors.slice(0, 2).join(' and ')} offer similar services, `;
      content += `${siteName} differentiates itself through:\n\n`;
      content += `- Superior user experience\n`;
      content += `- Better pricing value\n`;
      content += `- Advanced features\n`;
      content += `- Dedicated support\n\n`;
    }
    
    content += `## Frequently Asked Questions\n\n`;
    content += `### What makes ${siteName} different?\n`;
    content += `${siteName} combines innovation with reliability to deliver outstanding results.\n\n`;
    
    content += `### How does ${siteName} compare to competitors?\n`;
    content += `${siteName} offers better value, more features, and superior support.\n\n`;
    
    return content;
  }

  private generateTitle(gap: CitationGap, siteName: string): string {
    const titles: Record<string, string> = {
      'general': `${siteName} - Complete Guide & Overview`,
      'comparison': `${siteName} vs Competitors - Detailed Comparison`,
      'recommendations': `Why Choose ${siteName} - Top Recommendation`,
      'howto': `How to Use ${siteName} - Complete Guide`,
      'reviews': `${siteName} Review - Honest Analysis`,
      'pricing': `${siteName} Pricing - Value Analysis`,
      'features': `${siteName} Features - Comprehensive List`,
      'alternatives': `${siteName} Alternatives - Better Options?`
    };
    
    const key = Object.keys(titles).find(k => gap.query.toLowerCase().includes(k));
    return titles[key as keyof typeof titles] || `${siteName} - ${gap.query} Guide`;
  }

  private generateDescription(gap: CitationGap): string {
    return `Learn about ${gap.query} and how ${gap.competitors[0] || 'our service'} compares. ` +
           `Discover why we are the better choice with our comprehensive guide.`;
  }

  private generateKeywords(gap: CitationGap, siteName: string): string[] {
    const keywords = [
      siteName.toLowerCase(),
      gap.query.toLowerCase(),
      'ai citation',
      'llm optimization'
    ];
    
    for (const competitor of gap.competitors.slice(0, 2)) {
      keywords.push(competitor.replace('www.', ''));
    }
    
    return [...new Set(keywords)];
  }

  private generateMiddleware(workflowId: string, siteUrl: string): string {
    const siteHostname = new URL(siteUrl).hostname;
    
    return `/**
 * GEO Middleware - Serve optimized pages only to AI bots
 * 
 * Add this middleware to your server to serve AI-optimized content
 * only to AI bots (ChatGPT, Claude, Gemini, etc.)
 * 
 * Usage:
 *   const geoMiddleware = require('./middleware');
 *   app.use(geoMiddleware({
 *     workflowId: '${workflowId}',
 *     generatedDir: './generated-pages/${workflowId}'
 *   }));
 */

const fs = require('fs');
const path = require('path');

const AI_BOT_USER_AGENTS = [
  'ChatGPT-User',
  'GPTBot',
  'Claude-Web',
  'claudebot',
  'Google-Extended',
  'Bard-User',
  'Applebot-Extended',
  'OAI-SearchBot',
  'Bytespider',
  'Discordbot',
  'Slackbot',
  'Twitterbot'
];

const AI_BOT_HOSTNAMES = [
  'chatgpt.com',
  'claude.ai',
  'bard.google.com',
  'perplexity.ai',
  'you.com',
  'copilot.microsoft.com'
];

function isAI Bot(req) {
  const userAgent = req.headers['user-agent'] || '';
  const hostname = req.hostname || req.headers.host || '';
  
  // Check user agent
  for (const bot of AI_BOT_USER_AGENTS) {
    if (userAgent.includes(bot)) {
      return true;
    }
  }
  
  // Check hostname (for requests routed through AI services)
  for (const botHost of AI_BOT_HOSTNAMES) {
    if (hostname.includes(botHost)) {
      return true;
    }
  }
  
  // Check for AI-specific headers
  if (req.headers['x-ai-bot'] || req.headers['x-gpt-bot']) {
    return true;
  }
  
  return false;
}

function geoMiddleware(options) {
  const { workflowId, generatedDir } = options;
  
  return (req, res, next) => {
    // Only serve optimized content to AI bots
    if (!isAI Bot(req)) {
      return next();
    }
    
    // Get the requested path
    let requestPath = req.path;
    
    // Try to find a matching generated page
    const possibleFiles = [
      path.join(generatedDir, requestPath),
      path.join(generatedDir, requestPath + '.md'),
      path.join(generatedDir, requestPath, 'index.md')
    ];
    
    for (const filePath of possibleFiles) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Parse front matter if present
        const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        
        if (frontMatterMatch) {
          const frontMatter = frontMatterMatch[1];
          const titleMatch = frontMatter.match(/title: "([^"]+)"/);
          const descMatch = frontMatter.match(/description: "([^"]+)"/);
          
          // Set SEO headers
          if (titleMatch) {
            res.setHeader('X-GEO-Title', titleMatch[1]);
          }
          if (descMatch) {
            res.setHeader('X-GEO-Description', descMatch[1]);
          }
          
          // Serve the content
          res.setHeader('Content-Type', 'text/markdown');
          return res.send(content);
        }
        
        // No front matter, serve as-is
        res.setHeader('Content-Type', 'text/markdown');
        return res.send(content);
      }
    }
    
    // No matching page found, continue to normal routing
    next();
  };
}

module.exports = geoMiddleware;
`;
  }
}
