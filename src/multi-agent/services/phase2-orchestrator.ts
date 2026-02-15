import OpenAI from 'openai';
import { 
  WorkflowState, 
  QueryResult, 
  KnowledgeBase,
  SiteSummary 
} from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

const QUERY_CATEGORIES = [
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
    '{site} alternatives',
    '{site} comparison',
    '{site} pricing vs others',
    '{site} features compared'
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
  { category: 'pricing', templates: [
    '{site} pricing',
    '{site} cost',
    '{site} plans',
    '{site} free trial',
    '{site} subscription',
    'How much does {site} cost?'
  ]},
  { category: 'features', templates: [
    '{site} features',
    '{site} capabilities',
    '{site} benefits',
    'What can {site} do?',
    '{site} integrations',
    '{site} API'
  ]},
  { category: 'alternatives', templates: [
    '{site} alternatives',
    'Sites like {site}',
    'Competitors to {site}',
    'Better than {site}',
    '{site} vs alternatives'
  ]}
];

export interface Phase2WorkflowState {
  id: string;
  knowledgeBaseId: string;
  siteUrl: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  apiKey?: string;
  siteSummary?: SiteSummary;
  queries: QueryResult[];
  stats: {
    totalQueries: number;
    completedQueries: number;
    mentionCount: number;
    mentionPercentage: number;
    topCompetitors: string[];
  };
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export class Phase2Orchestrator {
  private workflows: Map<string, Phase2WorkflowState> = new Map();
  private listeners: Map<string, (event: string, data: any) => void> = new Map();
  private openai: OpenAI | null = null;

  async startQueryAnalysis(knowledgeBaseId: string, apiKey?: string): Promise<string> {
    const workflowId = uuidv4();
    
    const kbPath = path.join(process.cwd(), 'knowledge-bases', knowledgeBaseId, 'knowledge-base.json');
    
    if (!fs.existsSync(kbPath)) {
      throw new Error(`Knowledge base not found: ${knowledgeBaseId}`);
    }
    
    const knowledgeBase: KnowledgeBase = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
    
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
    
    const workflow: Phase2WorkflowState = {
      id: workflowId,
      knowledgeBaseId,
      siteUrl: knowledgeBase.siteSummary.name || '',
      status: 'pending',
      apiKey,
      siteSummary: knowledgeBase.siteSummary,
      queries: [],
      stats: {
        totalQueries: 0,
        completedQueries: 0,
        mentionCount: 0,
        mentionPercentage: 0,
        topCompetitors: []
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.workflows.set(workflowId, workflow);
    this.notifyListeners(workflowId, 'workflowStarted', { workflowId, knowledgeBaseId });
    
    setTimeout(() => this.executeQueries(workflowId, knowledgeBase), 100);
    
    return workflowId;
  }

  private async executeQueries(workflowId: string, knowledgeBase: KnowledgeBase): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    try {
      workflow.status = 'running';
      workflow.updatedAt = Date.now();
      
      const siteName = knowledgeBase.siteSummary.name || 'This Site';
      const industry = knowledgeBase.siteSummary.industry || 'business';
      const queries = this.generateQueries(siteName, industry);
      
      workflow.stats.totalQueries = queries.length;
      this.notifyListeners(workflowId, 'queriesGenerated', { totalQueries: queries.length });
      
      const results: QueryResult[] = [];
      
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        
        try {
          const result = await this.executeQuery(query, siteName, knowledgeBase);
          results.push(result);
          
          workflow.queries = results;
          workflow.stats.completedQueries = i + 1;
          workflow.stats.mentionCount = results.filter(r => r.yourSiteMentioned).length;
          workflow.stats.mentionPercentage = (workflow.stats.mentionCount / results.length) * 100;
          
          if ((i + 1) % 5 === 0 || i === queries.length - 1) {
            this.notifyListeners(workflowId, 'progress', {
              completed: i + 1,
              total: queries.length,
              mentions: workflow.stats.mentionCount,
              percentage: workflow.stats.mentionPercentage
            });
          }
          
        } catch (error: any) {
          console.log(`[Phase2Orchestrator] Query failed: ${query} - ${error.message}`);
          results.push({
            query,
            llmResponse: '',
            citedUrls: [],
            yourSiteMentioned: false,
            competitorsMentioned: []
          });
        }
        
        await this.sleep(300);
      }
      
      const topCompetitors = this.extractTopCompetitors(results);
      workflow.stats.topCompetitors = topCompetitors;
      
      workflow.status = 'completed';
      workflow.completedAt = Date.now();
      workflow.updatedAt = Date.now();
      
      this.saveResults(workflowId, workflow);
      
      this.notifyListeners(workflowId, 'workflowComplete', {
        workflowId,
        stats: workflow.stats
      });
      
    } catch (error: any) {
      console.error(`[Phase2Orchestrator] Error:`, error);
      workflow.status = 'error';
      workflow.updatedAt = Date.now();
      this.notifyListeners(workflowId, 'error', { error: error.message });
    }
  }

  private async executeQuery(query: string, siteName: string, knowledgeBase: KnowledgeBase): Promise<QueryResult> {
    const contextInfo = this.buildContextInfo(knowledgeBase);
    
    if (!this.openai) {
      return this.mockQueryResponse(query, siteName, knowledgeBase);
    }
    
    const systemPrompt = `You are a helpful AI assistant answering questions about websites and services.
When mentioning companies, websites, or services, be specific and informative.
Answer the user's question naturally without explicitly referencing this context information.`;
    
    const userPrompt = `${query}

Context (for reference, do not explicitly cite):
${contextInfo}`;
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      });
      
      const response = completion.choices[0]?.message?.content || '';
      
      return {
        query,
        llmResponse: response,
        citedUrls: this.extractUrls(response),
        yourSiteMentioned: this.checkSiteMention(response, siteName),
        competitorsMentioned: this.extractCompetitorMentions(response, siteName)
      };
      
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  private mockQueryResponse(query: string, siteName: string, knowledgeBase: KnowledgeBase): QueryResult {
    const mentioned = Math.random() > 0.65;
    const competitors = this.getMockCompetitors(knowledgeBase.siteSummary.industry);
    const competitorCount = Math.floor(Math.random() * 3);
    const mentionedCompetitors = competitors.slice(0, competitorCount);
    
    let response = '';
    if (mentioned) {
      response = `${siteName} is a notable provider in the ${knowledgeBase.siteSummary.industry || 'business'} space. `;
      response += `They offer ${knowledgeBase.siteSummary.keyValueProps?.slice(0, 2).join(' and ') || 'various services'}.`;
      if (mentionedCompetitors.length > 0) {
        response += ` Other options include ${mentionedCompetitors.join(', ')}.`;
      }
    } else {
      response = `There are several options in this space. `;
      if (mentionedCompetitors.length > 0) {
        response += `Popular choices include ${mentionedCompetitors.join(', ')}.`;
      } else {
        response += `You may want to research specific providers in this category.`;
      }
    }
    
    return {
      query,
      llmResponse: response,
      citedUrls: mentioned ? [] : mentionedCompetitors.map(c => `https://${c.toLowerCase().replace(/\s/g, '')}.com`),
      yourSiteMentioned: mentioned,
      competitorsMentioned: mentionedCompetitors
    };
  }

  private buildContextInfo(knowledgeBase: KnowledgeBase): string {
    const parts: string[] = [];
    
    if (knowledgeBase.siteSummary) {
      parts.push(`Site: ${knowledgeBase.siteSummary.name}`);
      parts.push(`Industry: ${knowledgeBase.siteSummary.industry}`);
      parts.push(`Purpose: ${knowledgeBase.siteSummary.primaryPurpose}`);
      if (knowledgeBase.siteSummary.keyValueProps?.length) {
        parts.push(`Key Value Props: ${knowledgeBase.siteSummary.keyValueProps.join(', ')}`);
      }
    }
    
    if (knowledgeBase.topics?.length) {
      const topTopics = knowledgeBase.topics.slice(0, 5).map(t => t.name).join(', ');
      parts.push(`Topics: ${topTopics}`);
    }
    
    if (knowledgeBase.qaPairs?.length) {
      const sampleQA = knowledgeBase.qaPairs.slice(0, 3)
        .map(qa => `Q: ${qa.question} A: ${qa.answer.substring(0, 100)}...`)
        .join('\n');
      parts.push(`Sample Q&A:\n${sampleQA}`);
    }
    
    return parts.join('\n');
  }

  private generateQueries(siteName: string, industry: string): string[] {
    const queries: string[] = [];
    
    for (const category of QUERY_CATEGORIES) {
      for (const template of category.templates) {
        const query = template
          .replace(/{site}/g, siteName)
          .replace(/{industry}/g, industry);
        queries.push(query);
      }
    }
    
    const additionalQueries = [
      `${siteName} login`,
      `${siteName} demo`,
      `${siteName} free trial`,
      `${siteName} testimonials`,
      `${siteName} case studies`,
      `${siteName} blog`,
      `${siteName} news`,
      `${siteName} updates`,
      `${siteName} documentation`,
      `${siteName} support`,
      `${siteName} contact`,
      `${siteName} careers`,
      `${siteName} company`,
      `${siteName} security`,
      `${siteName} reliability`
    ];
    
    queries.push(...additionalQueries);
    
    return [...new Set(queries)];
  }

  private extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s\)]+/g;
    const urls = text.match(urlRegex) || [];
    return [...new Set(urls)];
  }

  private checkSiteMention(text: string, siteName: string): boolean {
    const lowerText = text.toLowerCase();
    const lowerName = siteName.toLowerCase();
    
    return lowerText.includes(lowerName) || 
           lowerText.includes(lowerName.replace(/\s/g, '')) ||
           lowerText.includes(lowerName.split(' ')[0]);
  }

  private extractCompetitorMentions(text: string, siteName: string): string[] {
    const competitors: string[] = [];
    const commonCompetitors = [
      'HubSpot', 'Salesforce', 'Zapier', 'Slack', 'Notion',
      'Monday.com', 'Asana', 'Trello', 'Airtable', 'Figma',
      'Canva', 'Stripe', 'Shopify', 'Wix', 'Squarespace',
      'WordPress', 'Webflow', 'Mailchimp', 'Intercom', 'Zendesk',
      'Freshdesk', 'Zoom', 'Google Workspace', 'Microsoft 365',
      'Dropbox', 'Box', 'DocuSign', 'Calendly', 'Typeform',
      'SurveyMonkey', 'Qualtrics', 'Tableau', 'Power BI'
    ];
    
    for (const comp of commonCompetitors) {
      if (text.toLowerCase().includes(comp.toLowerCase()) && 
          comp.toLowerCase() !== siteName.toLowerCase()) {
        competitors.push(comp);
      }
    }
    
    return competitors;
  }

  private getMockCompetitors(industry?: string): string[] {
    const competitorMap: Record<string, string[]> = {
      'SaaS': ['HubSpot', 'Salesforce', 'Zapier'],
      'E-commerce': ['Shopify', 'WooCommerce', 'BigCommerce'],
      'Marketing': ['Mailchimp', 'HubSpot', 'Marketo'],
      'Technology': ['Microsoft', 'Google', 'Amazon'],
      'Finance': ['Stripe', 'Square', 'PayPal'],
      'Healthcare': ['Epic', 'Cerner', 'Athenahealth'],
      'Education': ['Coursera', 'Udemy', 'Khan Academy'],
      'Real Estate': ['Zillow', 'Redfin', 'Realtor.com'],
      'Travel': ['Expedia', 'Booking.com', 'Airbnb']
    };
    
    return competitorMap[industry || ''] || ['Competitor A', 'Competitor B', 'Competitor C'];
  }

  private extractTopCompetitors(results: QueryResult[]): string[] {
    const competitorCount: Map<string, number> = new Map();
    
    for (const result of results) {
      for (const comp of result.competitorsMentioned) {
        competitorCount.set(comp, (competitorCount.get(comp) || 0) + 1);
      }
    }
    
    return Array.from(competitorCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(e => e[0]);
  }

  private saveResults(workflowId: string, workflow: Phase2WorkflowState): void {
    const outputDir = path.join(process.cwd(), 'knowledge-bases', workflow.knowledgeBaseId);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(outputDir, 'phase2-results.json'),
      JSON.stringify({
        workflowId,
        knowledgeBaseId: workflow.knowledgeBaseId,
        queries: workflow.queries,
        stats: workflow.stats,
        completedAt: workflow.completedAt
      }, null, 2)
    );
    
    console.log(`[Phase2Orchestrator] Results saved to: ${outputDir}/phase2-results.json`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getWorkflow(workflowId: string): Phase2WorkflowState | undefined {
    return this.workflows.get(workflowId);
  }

  getAllWorkflows(): Phase2WorkflowState[] {
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