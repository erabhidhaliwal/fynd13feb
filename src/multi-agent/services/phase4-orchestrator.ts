import OpenAI from 'openai';
import { 
  CitationGap,
  KnowledgeBase
} from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export interface GeneratedPage {
  id: string;
  title: string;
  content: string;
  targetQuery: string;
  category: string;
  filePath: string;
  frontMatter: Record<string, any>;
}

export interface Phase4Result {
  id: string;
  knowledgeBaseId: string;
  phase3WorkflowId: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  pages: GeneratedPage[];
  middleware: {
    code: string;
    filePath: string;
  };
  stats: {
    totalPages: number;
    categories: string[];
    avgOpportunityScore: number;
    competitorsAddressed: string[];
  };
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export class Phase4Orchestrator {
  private workflows: Map<string, Phase4Result> = new Map();
  private listeners: Map<string, (event: string, data: any) => void> = new Map();
  private openai: OpenAI | null = null;

  async startPageGeneration(knowledgeBaseId: string, phase3WorkflowId?: string, apiKey?: string): Promise<string> {
    const workflowId = uuidv4();
    
    const kbPath = path.join(process.cwd(), 'knowledge-bases', knowledgeBaseId, 'knowledge-base.json');
    const phase3Path = path.join(process.cwd(), 'knowledge-bases', knowledgeBaseId, 'phase3-results.json');
    
    if (!fs.existsSync(kbPath)) {
      throw new Error(`Knowledge base not found: ${knowledgeBaseId}`);
    }
    
    const knowledgeBase: KnowledgeBase = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
    
    let gaps: CitationGap[] = [];
    if (fs.existsSync(phase3Path)) {
      const phase3Data = JSON.parse(fs.readFileSync(phase3Path, 'utf-8'));
      gaps = phase3Data.gaps || [];
    }
    
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
    
    const workflow: Phase4Result = {
      id: workflowId,
      knowledgeBaseId,
      phase3WorkflowId: phase3WorkflowId || '',
      status: 'pending',
      pages: [],
      middleware: { code: '', filePath: '' },
      stats: {
        totalPages: 0,
        categories: [],
        avgOpportunityScore: 0,
        competitorsAddressed: []
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.workflows.set(workflowId, workflow);
    this.notifyListeners(workflowId, 'workflowStarted', { workflowId, knowledgeBaseId });
    
    setTimeout(() => this.executePageGeneration(workflowId, knowledgeBase, gaps), 100);
    
    return workflowId;
  }

  private async executePageGeneration(workflowId: string, knowledgeBase: KnowledgeBase, gaps: CitationGap[]): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    try {
      workflow.status = 'running';
      workflow.updatedAt = Date.now();
      this.notifyListeners(workflowId, 'progress', { step: 'generating', message: 'Generating optimized pages...' });
      
      const siteName = knowledgeBase.siteSummary?.name || 'This Site';
      const siteUrl = knowledgeBase.siteSummary?.name || 'example.com';
      const outputDir = path.join(process.cwd(), 'generated-pages', workflow.knowledgeBaseId);
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const pages: GeneratedPage[] = [];
      const topGaps = gaps.length > 0 ? gaps.slice(0, 15) : this.generateDefaultGaps(knowledgeBase);
      
      for (let i = 0; i < topGaps.length; i++) {
        const gap = topGaps[i];
        
        try {
          const page = await this.generatePage(gap, knowledgeBase, outputDir, siteName, siteUrl);
          if (page) {
            pages.push(page);
            
            this.notifyListeners(workflowId, 'progress', {
              step: 'generating',
              current: i + 1,
              total: topGaps.length,
              page: page.title
            });
          }
        } catch (error: any) {
          console.log(`[Phase4Orchestrator] Failed to generate page: ${error.message}`);
        }
      }
      
      const middlewareCode = this.generateMiddleware(workflow.knowledgeBaseId, siteUrl);
      const middlewarePath = path.join(outputDir, 'middleware.js');
      fs.writeFileSync(middlewarePath, middlewareCode);
      
      workflow.pages = pages;
      workflow.middleware = { code: middlewareCode, filePath: middlewarePath };
      workflow.stats = {
        totalPages: pages.length,
        categories: [...new Set(pages.map(p => p.category))],
        avgOpportunityScore: topGaps.reduce((sum, g) => sum + (g.opportunityScore || 0), 0) / topGaps.length,
        competitorsAddressed: [...new Set(topGaps.flatMap(g => g.competitors || []))]
      };
      
      workflow.status = 'completed';
      workflow.completedAt = Date.now();
      workflow.updatedAt = Date.now();
      
      this.saveResults(workflowId, workflow);
      
      this.notifyListeners(workflowId, 'workflowComplete', {
        workflowId,
        stats: workflow.stats
      });
      
    } catch (error: any) {
      console.error(`[Phase4Orchestrator] Error:`, error);
      workflow.status = 'error';
      workflow.updatedAt = Date.now();
      this.notifyListeners(workflowId, 'error', { error: error.message });
    }
  }

  private async generatePage(gap: CitationGap, knowledgeBase: KnowledgeBase, outputDir: string, siteName: string, siteUrl: string): Promise<GeneratedPage | null> {
    const pageId = uuidv4();
    const sanitizedCategory = gap.category?.replace(/[^a-zA-Z0-9]/g, '-') || 'general';
    const fileName = `${sanitizedCategory}-${pageId.substring(0, 8)}.md`;
    const filePath = path.join(outputDir, fileName);
    
    let content: string;
    
    if (this.openai) {
      content = await this.generateWithAI(gap, knowledgeBase, siteName);
    } else {
      content = this.generateTemplate(gap, knowledgeBase, siteName);
    }
    
    const frontMatter = {
      title: this.generateTitle(gap, siteName),
      description: this.generateDescription(gap, siteName),
      keywords: this.generateKeywords(gap, siteName),
      category: gap.category || 'general',
      targetQuery: gap.query,
      opportunityScore: gap.opportunityScore,
      competitors: gap.competitors || [],
      generatedAt: new Date().toISOString(),
      siteUrl
    };
    
    const frontMatterStr = `---
title: "${frontMatter.title}"
description: "${frontMatter.description}"
keywords: ${JSON.stringify(frontMatter.keywords)}
category: "${frontMatter.category}"
targetQuery: "${frontMatter.targetQuery}"
opportunityScore: ${frontMatter.opportunityScore}
generatedAt: "${frontMatter.generatedAt}"
---

`;
    
    const fullContent = frontMatterStr + content;
    fs.writeFileSync(filePath, fullContent);
    
    return {
      id: pageId,
      title: frontMatter.title,
      content: fullContent,
      targetQuery: gap.query,
      category: gap.category || 'general',
      filePath,
      frontMatter
    };
  }

  private async generateWithAI(gap: CitationGap, knowledgeBase: KnowledgeBase, siteName: string): Promise<string> {
    if (!this.openai) {
      return this.generateTemplate(gap, knowledgeBase, siteName);
    }
    
    const competitors = gap.competitors?.slice(0, 3).join(', ') || 'other providers';
    const topics = gap.missingTopics?.slice(0, 5).join(', ') || '';
    const valueProps = knowledgeBase.siteSummary?.keyValueProps?.slice(0, 3).join(', ') || '';
    
    const prompt = `Create SEO-optimized content for ${siteName} to address this citation gap:

Gap: ${gap.query}
Category: ${gap.category}
Competitors to address: ${competitors}
Missing topics: ${topics}
Key value props: ${valueProps}

Create comprehensive content (800-1200 words) that will help ${siteName} get cited in AI responses. Include:
1. Engaging introduction with key value proposition
2. Detailed features and benefits section
3. Comparison with competitors (highlighting advantages)
4. Use cases and examples
5. Pricing/plan overview (if relevant)
6. FAQ section with 3-5 common questions
7. Strong conclusion with call to action

Write in professional, informative tone. Use proper markdown formatting with headers.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert SEO content writer specializing in AI citation optimization (GEO). Write clear, informative content that AI systems will cite.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });
      
      return completion.choices[0]?.message?.content || this.generateTemplate(gap, knowledgeBase, siteName);
    } catch (error: any) {
      console.log(`[Phase4Orchestrator] AI generation failed: ${error.message}`);
      return this.generateTemplate(gap, knowledgeBase, siteName);
    }
  }

  private generateTemplate(gap: CitationGap, knowledgeBase: KnowledgeBase, siteName: string): string {
    const competitors = gap.competitors?.slice(0, 3) || [];
    const topics = gap.missingTopics?.slice(0, 5) || [];
    const valueProps = knowledgeBase.siteSummary?.keyValueProps || [];
    const industry = knowledgeBase.siteSummary?.industry || 'business';
    
    let content = '';
    
    content += `# ${this.generateTitle(gap, siteName)}\n\n`;
    
    content += `${siteName} is a leading ${industry} platform that delivers exceptional value. `;
    content += `This comprehensive guide covers everything you need to know about our ${gap.category || 'solutions'}.\n\n`;
    
    content += `## Overview\n\n`;
    content += `In the ${industry} space, ${siteName} stands out with its innovative approach. `;
    if (competitors.length > 0) {
      content += `While ${competitors.slice(0, 2).join(' and ')} offer similar services, our platform provides unique advantages.\n\n`;
    } else {
      content += `Our platform provides unique advantages that set us apart.\n\n`;
    }
    
    content += `## Key Features\n\n`;
    if (valueProps.length > 0) {
      for (const prop of valueProps.slice(0, 5)) {
        content += `- **${prop}** - Delivering exceptional value to our users\n`;
      }
    } else {
      content += `- **Advanced Technology** - Cutting-edge solutions\n`;
      content += `- **User-Friendly Interface** - Intuitive design\n`;
      content += `- **24/7 Support** - Always here to help\n`;
      content += `- **Competitive Pricing** - Best value for money\n`;
    }
    content += `\n`;
    
    if (topics.length > 0) {
      content += `## Topics We Cover\n\n`;
      content += `Our platform addresses key areas including:\n\n`;
      for (const topic of topics) {
        content += `- ${topic}\n`;
      }
      content += `\n`;
    }
    
    if (competitors.length > 0) {
      content += `## ${siteName} vs Competitors\n\n`;
      content += `When comparing ${siteName} to ${competitors.slice(0, 2).join(' and ')}, several key advantages emerge:\n\n`;
      content += `| Feature | ${siteName} | ${competitors[0] || 'Others'} |\n`;
      content += `|---------|-------------|----------------|\n`;
      content += `| Ease of Use | Excellent | Good |\n`;
      content += `| Value for Money | Superior | Standard |\n`;
      content += `| Customer Support | 24/7 Priority | Limited |\n`;
      content += `| Features | Comprehensive | Basic |\n\n`;
    }
    
    content += `## Pricing\n\n`;
    content += `${siteName} offers flexible pricing plans to suit every need:\n\n`;
    content += `- **Starter**: Perfect for individuals and small teams\n`;
    content += `- **Professional**: Ideal for growing businesses\n`;
    content += `- **Enterprise**: Custom solutions for large organizations\n\n`;
    content += `Contact us for detailed pricing information.\n\n`;
    
    content += `## Frequently Asked Questions\n\n`;
    content += `### What makes ${siteName} different?\n`;
    content += `${siteName} combines advanced technology with exceptional user experience, `;
    content += `delivering results that exceed expectations.\n\n`;
    
    content += `### How does the pricing work?\n`;
    content += `We offer tiered pricing based on features and usage. `;
    content += `Our team can help you choose the right plan.\n\n`;
    
    content += `### Is there a free trial?\n`;
    content += `Yes! We offer a free trial so you can experience the full potential of ${siteName}.\n\n`;
    
    content += `### What kind of support do you provide?\n`;
    content += `We provide 24/7 support through multiple channels including chat, email, and phone.\n\n`;
    
    content += `## Get Started Today\n\n`;
    content += `Ready to transform your ${industry} operations? `;
    content += `${siteName} is here to help. Contact us to learn more or start your free trial.\n`;
    
    return content;
  }

  private generateDefaultGaps(knowledgeBase: KnowledgeBase): CitationGap[] {
    const siteName = knowledgeBase.siteSummary?.name || 'This Site';
    const industry = knowledgeBase.siteSummary?.industry || 'business';
    
    return [
      {
        query: `${siteName} overview and features`,
        category: 'general',
        competitors: ['Competitor A', 'Competitor B'],
        missingTopics: ['overview', 'features', 'benefits'],
        opportunityScore: 0.85
      },
      {
        query: `${siteName} vs competitors comparison`,
        category: 'comparison',
        competitors: ['Competitor C', 'Competitor D'],
        missingTopics: ['comparison', 'versus', 'advantages'],
        opportunityScore: 0.80
      },
      {
        query: `${siteName} reviews and testimonials`,
        category: 'reviews',
        competitors: ['Competitor E'],
        missingTopics: ['reviews', 'testimonials', 'ratings'],
        opportunityScore: 0.75
      },
      {
        query: `${siteName} pricing and plans`,
        category: 'pricing',
        competitors: ['Competitor F'],
        missingTopics: ['pricing', 'cost', 'plans', 'subscription'],
        opportunityScore: 0.90
      },
      {
        query: `How to use ${siteName}`,
        category: 'howto',
        competitors: [],
        missingTopics: ['tutorial', 'guide', 'how to', 'getting started'],
        opportunityScore: 0.70
      }
    ];
  }

  private generateTitle(gap: CitationGap, siteName: string): string {
    const categoryTitles: Record<string, string> = {
      general: `${siteName} - Complete Overview & Guide`,
      comparison: `${siteName} vs Competitors - Which is Better?`,
      recommendations: `Why ${siteName} is the Top Choice`,
      howto: `How to Use ${siteName} - Step-by-Step Guide`,
      reviews: `${siteName} Reviews - What Users Say`,
      pricing: `${siteName} Pricing - Plans & Value Analysis`,
      features: `${siteName} Features - Complete Capability Guide`,
      alternatives: `${siteName} Alternatives - Better Options?`,
      competition: `${siteName} vs ${gap.competitors?.[0] || 'Competitors'}`,
      content_gap: `${siteName} - ${gap.query}`
    };
    
    return categoryTitles[gap.category || 'general'] || `${siteName} - ${gap.query}`;
  }

  private generateDescription(gap: CitationGap, siteName: string): string {
    const competitors = gap.competitors?.slice(0, 2).join(' and ') || 'competitors';
    
    switch (gap.category) {
      case 'comparison':
        return `Compare ${siteName} vs ${competitors}. Detailed analysis of features, pricing, and value.`;
      case 'reviews':
        return `Read authentic ${siteName} reviews. Real user experiences and ratings.`;
      case 'pricing':
        return `${siteName} pricing breakdown. Compare plans and find the best value.`;
      case 'features':
        return `Explore ${siteName} features. Complete guide to capabilities and benefits.`;
      default:
        return `Complete guide to ${siteName}. Learn about features, pricing, and how we compare.`;
    }
  }

  private generateKeywords(gap: CitationGap, siteName: string): string[] {
    const keywords: string[] = [siteName.toLowerCase()];
    
    keywords.push(gap.category || 'guide');
    keywords.push(gap.query.toLowerCase());
    
    if (gap.competitors) {
      keywords.push(...gap.competitors.slice(0, 2).map(c => c.toLowerCase()));
    }
    
    keywords.push('ai citation', 'llm optimization');
    
    return [...new Set(keywords.filter(k => k.length > 2))];
  }

  private generateMiddleware(knowledgeBaseId: string, siteUrl: string): string {
    return `/**
 * GEO Middleware - AI Bot Detection & Optimized Content Serving
 * Generated by Fynd AI Phase 4
 * 
 * This middleware serves AI-optimized content only to AI bots
 * (ChatGPT, Claude, Gemini, Perplexity, etc.)
 * 
 * Usage in Express:
 *   const geoMiddleware = require('./middleware');
 *   app.use(geoMiddleware());
 * 
 * Usage in Next.js (middleware.js):
 *   import geoMiddleware from './middleware';
 *   export default geoMiddleware();
 */

const fs = require('fs');
const path = require('path');

const GENERATED_DIR = path.join(__dirname);

const AI_BOT_USER_AGENTS = [
  'ChatGPT-User',
  'GPTBot',
  'Claude-Web',
  'claudebot',
  'Google-Extended',
  'GoogleOther',
  'Bard',
  'Applebot-Extended',
  'OAI-SearchBot',
  'Bytespider',
  'CCBot',
  'anthropic-ai',
  'PerplexityBot',
  'YouBot',
  'cohere-ai'
];

function isAIBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return AI_BOT_USER_AGENTS.some(bot => ua.includes(bot.toLowerCase()));
}

function getMatchingPage(requestPath) {
  const pathParts = requestPath.split('/').filter(Boolean);
  const slug = pathParts[pathParts.length - 1] || 'index';
  
  const possibleFiles = [
    path.join(GENERATED_DIR, slug + '.md'),
    path.join(GENERATED_DIR, slug, 'index.md'),
    path.join(GENERATED_DIR, 'general', slug + '.md')
  ];
  
  for (const filePath of possibleFiles) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  
  const allFiles = fs.readdirSync(GENERATED_DIR).filter(f => f.endsWith('.md'));
  if (allFiles.length > 0) {
    return path.join(GENERATED_DIR, allFiles[Math.floor(Math.random() * allFiles.length)]);
  }
  
  return null;
}

function parseFrontMatter(content) {
  const match = content.match(/^---\\n([\\s\\S]*?)\\n---/);
  if (!match) return {};
  
  const frontMatter = {};
  const lines = match[1].split('\\n');
  
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();
      
      if (value.startsWith('[') && value.endsWith(']')) {
        value = JSON.parse(value);
      } else if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      
      frontMatter[key] = value;
    }
  }
  
  return frontMatter;
}

function geoMiddleware() {
  return (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    
    if (!isAIBot(userAgent)) {
      return next();
    }
    
    const pagePath = getMatchingPage(req.path);
    
    if (!pagePath) {
      return next();
    }
    
    try {
      const content = fs.readFileSync(pagePath, 'utf-8');
      const frontMatter = parseFrontMatter(content);
      
      res.setHeader('X-GEO-Served', 'true');
      res.setHeader('X-GEO-Page', path.basename(pagePath));
      
      if (frontMatter.title) {
        res.setHeader('X-GEO-Title', frontMatter.title);
      }
      if (frontMatter.description) {
        res.setHeader('X-GEO-Description', frontMatter.description);
      }
      
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.send(content);
      
    } catch (error) {
      console.error('[GEO Middleware] Error:', error.message);
      next();
    }
  };
}

module.exports = geoMiddleware;
`;
  }

  private saveResults(workflowId: string, workflow: Phase4Result): void {
    const outputDir = path.join(process.cwd(), 'knowledge-bases', workflow.knowledgeBaseId);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(outputDir, 'phase4-results.json'),
      JSON.stringify(workflow, null, 2)
    );
    
    console.log(`[Phase4Orchestrator] Results saved to: ${outputDir}/phase4-results.json`);
  }

  getWorkflow(workflowId: string): Phase4Result | undefined {
    return this.workflows.get(workflowId);
  }

  getAllWorkflows(): Phase4Result[] {
    return Array.from(this.workflows.values());
  }

  addListener(workflowId: string, callback: (event: string, data: any) => void): void {
    this.listeners.set(workflowId, callback);
  }

  removeListener(workflowId: string): void {
    this.listeners.delete(workflowId);
  }

  private notifyListeners(workflowId: string, event: string, data: any): void {
    const listener = this.listeners.get(workflowId);
    if (listener) {
      listener(event, data);
    }
  }
}