import { BaseAgent } from './base.js';
import { AgentMessage, QueryResult } from '../types/index.js';
import OpenAI from 'openai';

const DEFAULT_QUERIES = [
  { category: 'general', templates: [
    'What is {site} about?',
    'Tell me about {site}',
    'What does {site} do?',
    'Who is {site}?',
    'How does {site} work?',
    'What services does {site} offer?',
    'What products does {site} have?',
    'Is {site} good?',
    'What are the best {industry} companies?',
    'Top {industry} websites'
  ]},
  { category: 'comparison', templates: [
    '{site} vs competitors',
    '{site} or {competitor}',
    'Better than {site}',
    'Alternatives to {site}',
    '{site} comparison',
    '{site} pricing vs others',
    '{site} features compared to competitors'
  ]},
  { category: 'recommendations', templates: [
    'Best {industry} platform',
    'Recommend {industry} service',
    'What {industry} should I use?',
    'Good {industry} options',
    'Popular {industry} websites',
    'Trusted {industry} companies',
    'Leading {industry} providers'
  ]},
  { category: 'howto', templates: [
    'How to use {site}',
    'How does {site} work?',
    'Getting started with {site}',
    'How to sign up for {site}',
    '{site} tutorial',
    '{site} guide'
  ]},
  { category: 'reviews', templates: [
    '{site} review',
    '{site} opinions',
    '{site} feedback',
    'User experience with {site}',
    '{site} pros and cons',
    'Is {site} worth it?',
    '{site} ratings'
  ]},
  { category: 'industry_specific', templates: [
    '{industry} solutions',
    '{industry} tools',
    '{industry} software',
    'Enterprise {industry}',
    '{industry} for business',
    'B2B {industry}',
    '{industry} trends 2024',
    '{industry} best practices'
  ]}
];

export class QueryAgent extends BaseAgent {
  private openai: OpenAI | null = null;
  private queries: any[] = [];
  private delayMs: number = 500;

  constructor() {
    super({
      name: 'QueryAgent',
      description: 'Runs queries on LLM to check if site appears in citations',
      capabilities: ['queryLLM', 'checkCitations', 'analyzePresence']
    });
  }

  setApiKey(apiKey: string): void {
    this.openai = new OpenAI({ apiKey });
  }

  async processMessage(message: AgentMessage): Promise<AgentMessage | null> {
    switch (message.type) {
      case 'request':
        if (message.payload.action === 'runQueries') {
          return await this.runQueries(
            message.payload.workflowId,
            message.payload.siteUrl,
            message.payload.markdown,
            message.payload.competitors || []
          );
        }
        break;
    }
    return null;
  }

  async runQueries(workflowId: string, siteUrl: string, markdown: string, competitors: string[]): Promise<AgentMessage> {
    console.log(`[QueryAgent] Starting query execution for: ${siteUrl}`);
    
    try {
      const siteName = this.extractSiteName(siteUrl);
      const industry = this.detectIndustry(markdown);
      this.queries = this.generateQueries(siteName, industry, competitors);
      
      const results: QueryResult[] = [];
      
      for (let i = 0; i < this.queries.length; i++) {
        const query = this.queries[i];
        
        try {
          const result = await this.executeQuery(query, siteUrl, markdown);
          results.push(result);
        } catch (error: any) {
          console.log(`[QueryAgent] Query failed: ${query} - ${error.message}`);
          results.push({
            query,
            llmResponse: '',
            citedUrls: [],
            yourSiteMentioned: false,
            competitorsMentioned: []
          });
        }
        
        if (i % 10 === 0) {
          console.log(`[QueryAgent] Progress: ${i + 1}/${this.queries.length} queries completed`);
        }
        
        if (this.delayMs > 0) {
          await this.sleep(this.delayMs);
        }
      }
      
      const mentionCount = results.filter(r => r.yourSiteMentioned).length;
      console.log(`[QueryAgent] Completed ${results.length} queries. Site mentioned in ${mentionCount} responses`);
      
      return await this.sendMessage('WorkflowManager', 'response', {
        workflowId,
        action: 'queriesComplete',
        results,
        stats: {
          totalQueries: results.length,
          mentions: mentionCount,
          percentage: (mentionCount / results.length) * 100
        }
      });
      
    } catch (error: any) {
      console.error(`[QueryAgent] Error:`, error.message);
      
      return await this.sendMessage('WorkflowManager', 'error', {
        workflowId,
        action: 'queriesFailed',
        error: error.message
      });
    }
  }

  private async executeQuery(query: string, siteUrl: string, markdown: string): Promise<QueryResult> {
    if (!this.openai) {
      return this.mockQueryResponse(query, siteUrl);
    }
    
    const systemPrompt = `You are a helpful AI assistant. You have knowledge about various websites and companies. 
When you mention websites or companies in your response, provide the source URL if available.
The user is asking about a specific site. Be informative and mention relevant sources.`;
    
    const userPrompt = `${query}\n\nContext about the site: ${markdown.substring(0, 3000)}`;
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      });
      
      const response = completion.choices[0]?.message?.content || '';
      const citedUrls = this.extractUrls(response);
      const siteMentioned = this.checkSiteMention(response, siteUrl);
      const competitors = this.checkCompetitorMentions(response, siteUrl);
      
      return {
        query,
        llmResponse: response,
        citedUrls,
        yourSiteMentioned: siteMentioned,
        competitorsMentioned: competitors
      };
      
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  private mockQueryResponse(query: string, siteUrl: string): QueryResult {
    const siteName = this.extractSiteName(siteUrl);
    const mentioned = Math.random() > 0.7;
    const competitorCount = Math.floor(Math.random() * 3);
    const competitors: string[] = [];
    
    for (let i = 0; i < competitorCount; i++) {
      competitors.push(`competitor${i + 1}.com`);
    }
    
    return {
      query,
      llmResponse: mentioned 
        ? `${siteName} is a notable provider in this space. They offer various services...`
        : `There are several options in this space including competitor1.com and competitor2.com`,
      citedUrls: mentioned ? [siteUrl] : competitors,
      yourSiteMentioned: mentioned,
      competitorsMentioned: competitors
    };
  }

  private generateQueries(siteName: string, industry: string, competitors: string[]): string[] {
    const queries: string[] = [];
    
    for (const category of DEFAULT_QUERIES) {
      for (const template of category.templates) {
        let query = template
          .replace(/{site}/g, siteName)
          .replace(/{industry}/g, industry);
        
        if (competitors.length > 0 && template.includes('{competitor}')) {
          for (const comp of competitors.slice(0, 3)) {
            queries.push(template.replace(/{site}/g, siteName).replace(/{competitor}/g, comp));
          }
        } else {
          queries.push(query);
        }
      }
    }
    
    const additionalQueries = [
      `${siteName} login`,
      `${siteName} pricing`,
      `${siteName} features`,
      `${siteName} demo`,
      `${siteName} free trial`,
      `${siteName} alternatives`,
      `${siteName} vs`,
      `${siteName} review`,
      `${siteName} testimonials`,
      `${siteName} case studies`,
      `${siteName} blog`,
      `${siteName} news`,
      `${siteName} updates`,
      `${siteName} integrations`,
      `${siteName} API`,
      `${siteName} documentation`,
      `${siteName} support`,
      `${siteName} contact`,
      `${siteName} careers`,
      `${siteName} company`
    ];
    
    queries.push(...additionalQueries);
    
    return [...new Set(queries)].slice(0, 120);
  }

  private extractSiteName(url: string): string {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');
      return hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
    } catch {
      return 'This Website';
    }
  }

  private detectIndustry(markdown: string): string {
    const content = markdown.toLowerCase();
    
    const industries: Record<string, string[]> = {
      'SaaS': ['software', 'platform', 'solution', 'service', 'cloud', 'app'],
      'E-commerce': ['shop', 'store', 'product', 'buy', 'cart', 'checkout', 'order'],
      'Finance': ['finance', 'banking', 'payment', 'investment', 'trading', 'crypto'],
      'Healthcare': ['health', 'medical', 'doctor', 'patient', 'hospital', 'wellness'],
      'Education': ['education', 'learning', 'course', 'tutorial', 'training', 'school'],
      'Marketing': ['marketing', 'seo', 'advertising', 'campaign', 'analytics', 'brand'],
      'Technology': ['tech', 'developer', 'api', 'code', 'software', 'it', 'solution'],
      'Real Estate': ['real estate', 'property', 'housing', 'apartment', 'rent', 'buy'],
      'Travel': ['travel', 'hotel', 'booking', 'flight', 'vacation', 'tourism'],
      'Food': ['restaurant', 'food', 'delivery', 'catering', 'menu', 'chef']
    };
    
    for (const [industry, keywords] of Object.entries(industries)) {
      const matches = keywords.filter(kw => content.includes(kw)).length;
      if (matches >= 2) return industry;
    }
    
    return 'business';
  }

  private extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s\)]+/g;
    const urls = text.match(urlRegex) || [];
    return [...new Set(urls)];
  }

  private checkSiteMention(text: string, siteUrl: string): boolean {
    const siteName = this.extractSiteName(siteUrl).toLowerCase();
    const hostname = new URL(siteUrl).hostname.toLowerCase();
    
    return text.toLowerCase().includes(siteName.toLowerCase()) || 
           text.toLowerCase().includes(hostname);
  }

  private checkCompetitorMentions(text: string, siteUrl: string): string[] {
    const competitors: string[] = [];
    const urlRegex = /https?:\/\/([^\/]+)/g;
    const matches = text.match(urlRegex) || [];
    
    const siteHostname = new URL(siteUrl).hostname;
    
    for (const match of matches) {
      try {
        const hostname = new URL(match).hostname;
        if (hostname !== siteHostname && !competitors.includes(hostname)) {
          competitors.push(hostname);
        }
      } catch {}
    }
    
    return competitors;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
