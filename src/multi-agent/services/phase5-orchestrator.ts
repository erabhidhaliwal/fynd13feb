import OpenAI from 'openai';
import { 
  KnowledgeBase
} from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export interface CitationSnapshot {
  timestamp: number;
  totalQueries: number;
  mentionCount: number;
  mentionPercentage: number;
  categoryStats: Record<string, { total: number; mentions: number; percentage: number }>;
  topCompetitors: { name: string; count: number }[];
  source: 'manual' | 'scheduled' | 'api';
}

export interface TrendAnalysis {
  direction: 'improving' | 'declining' | 'stable';
  changePercentage: number;
  insights: string[];
  recommendations: string[];
}

export interface CompetitorMovement {
  competitor: string;
  previousRank: number;
  currentRank: number;
  change: 'up' | 'down' | 'stable';
  mentionChange: number;
}

export interface Phase5Result {
  id: string;
  knowledgeBaseId: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  currentSnapshot: CitationSnapshot | null;
  previousSnapshot: CitationSnapshot | null;
  trend: TrendAnalysis | null;
  competitorMovements: CompetitorMovement[];
  history: CitationSnapshot[];
  alerts: {
    type: 'warning' | 'info' | 'success';
    message: string;
    timestamp: number;
  }[];
  stats: {
    totalSnapshots: number;
    avgMentionRate: number;
    improvementRate: number;
    daysTracked: number;
  };
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface MonitoringConfig {
  enabled: boolean;
  intervalHours: number;
  alertThresholds: {
    mentionDrop: number;
    competitorGain: number;
  };
}

export class Phase5Orchestrator {
  private workflows: Map<string, Phase5Result> = new Map();
  private listeners: Map<string, (event: string, data: any) => void> = new Map();
  private openai: OpenAI | null = null;
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  async startMonitoring(knowledgeBaseId: string, apiKey?: string): Promise<string> {
    const workflowId = uuidv4();
    
    const kbPath = path.join(process.cwd(), 'knowledge-bases', knowledgeBaseId, 'knowledge-base.json');
    
    if (!fs.existsSync(kbPath)) {
      throw new Error(`Knowledge base not found: ${knowledgeBaseId}`);
    }
    
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
    
    const workflow: Phase5Result = {
      id: workflowId,
      knowledgeBaseId,
      status: 'pending',
      currentSnapshot: null,
      previousSnapshot: null,
      trend: null,
      competitorMovements: [],
      history: [],
      alerts: [],
      stats: {
        totalSnapshots: 0,
        avgMentionRate: 0,
        improvementRate: 0,
        daysTracked: 0
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.workflows.set(workflowId, workflow);
    this.loadHistory(workflowId, knowledgeBaseId);
    this.notifyListeners(workflowId, 'workflowStarted', { workflowId, knowledgeBaseId });
    
    setTimeout(() => this.executeMonitoring(workflowId, knowledgeBaseId), 100);
    
    return workflowId;
  }

  private loadHistory(workflowId: string, knowledgeBaseId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    const historyPath = path.join(process.cwd(), 'knowledge-bases', knowledgeBaseId, 'citation-history.json');
    
    if (fs.existsSync(historyPath)) {
      try {
        const historyData = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        workflow.history = historyData.snapshots || [];
        
        if (workflow.history.length > 0) {
          workflow.previousSnapshot = workflow.history[workflow.history.length - 1];
          workflow.stats.totalSnapshots = workflow.history.length;
          workflow.stats.avgMentionRate = this.calculateAvgMentionRate(workflow.history);
        }
      } catch (error) {
        console.log(`[Phase5Orchestrator] Could not load history: ${error}`);
      }
    }
  }

  private async executeMonitoring(workflowId: string, knowledgeBaseId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    try {
      workflow.status = 'running';
      workflow.updatedAt = Date.now();
      this.notifyListeners(workflowId, 'progress', { step: 'monitoring', message: 'Running citation check...' });
      
      const kbPath = path.join(process.cwd(), 'knowledge-bases', knowledgeBaseId, 'knowledge-base.json');
      const knowledgeBase: KnowledgeBase = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
      
      const snapshot = await this.runCitationCheck(workflowId, knowledgeBase);
      
      workflow.previousSnapshot = workflow.currentSnapshot;
      workflow.currentSnapshot = snapshot;
      workflow.history.push(snapshot);
      
      if (workflow.previousSnapshot) {
        workflow.trend = this.analyzeTrend(workflow.previousSnapshot, snapshot);
        workflow.competitorMovements = this.analyzeCompetitorMovements(workflow.previousSnapshot, snapshot);
        
        if (workflow.trend.direction === 'declining') {
          workflow.alerts.push({
            type: 'warning',
            message: `Citation rate declined by ${Math.abs(workflow.trend.changePercentage).toFixed(1)}%`,
            timestamp: Date.now()
          });
        } else if (workflow.trend.direction === 'improving') {
          workflow.alerts.push({
            type: 'success',
            message: `Citation rate improved by ${workflow.trend.changePercentage.toFixed(1)}%`,
            timestamp: Date.now()
          });
        }
      }
      
      workflow.stats = {
        totalSnapshots: workflow.history.length,
        avgMentionRate: this.calculateAvgMentionRate(workflow.history),
        improvementRate: this.calculateImprovementRate(workflow.history),
        daysTracked: this.calculateDaysTracked(workflow.history)
      };
      
      workflow.status = 'completed';
      workflow.completedAt = Date.now();
      workflow.updatedAt = Date.now();
      
      this.saveResults(workflowId, workflow);
      this.saveHistory(workflowId, knowledgeBaseId);
      
      this.notifyListeners(workflowId, 'workflowComplete', {
        workflowId,
        snapshot: workflow.currentSnapshot,
        trend: workflow.trend,
        stats: workflow.stats
      });
      
    } catch (error: any) {
      console.error(`[Phase5Orchestrator] Error:`, error);
      workflow.status = 'error';
      workflow.updatedAt = Date.now();
      workflow.alerts.push({
        type: 'warning',
        message: `Monitoring error: ${error.message}`,
        timestamp: Date.now()
      });
      this.notifyListeners(workflowId, 'error', { error: error.message });
    }
  }

  private async runCitationCheck(workflowId: string, knowledgeBase: KnowledgeBase): Promise<CitationSnapshot> {
    const siteName = knowledgeBase.siteSummary?.name || 'This Site';
    const industry = knowledgeBase.siteSummary?.industry || 'business';
    
    const queries = this.generateMonitorQueries(siteName, industry);
    const categoryStats: Record<string, { total: number; mentions: number; percentage: number }> = {};
    const competitorCounts: Record<string, number> = {};
    let mentionCount = 0;
    
    this.notifyListeners(workflowId, 'progress', { 
      step: 'querying', 
      message: `Running ${queries.length} queries...`,
      total: queries.length
    });

    for (let i = 0; i < queries.length; i++) {
      const { query, category } = queries[i];
      
      if (!categoryStats[category]) {
        categoryStats[category] = { total: 0, mentions: 0, percentage: 0 };
      }
      categoryStats[category].total++;
      
      let response: string;
      if (this.openai) {
        response = await this.queryLLM(query);
      } else {
        response = this.generateMockResponse(siteName, query);
      }
      
      const mentioned = this.checkMention(response, siteName);
      if (mentioned) {
        mentionCount++;
        categoryStats[category].mentions++;
      }
      
      const competitors = this.extractCompetitors(response, siteName);
      for (const comp of competitors) {
        competitorCounts[comp] = (competitorCounts[comp] || 0) + 1;
      }
      
      if (i % 5 === 0) {
        this.notifyListeners(workflowId, 'progress', { 
          step: 'querying', 
          current: i + 1, 
          total: queries.length 
        });
      }
    }
    
    for (const category of Object.keys(categoryStats)) {
      const stats = categoryStats[category];
      stats.percentage = stats.total > 0 ? (stats.mentions / stats.total) * 100 : 0;
    }
    
    const topCompetitors = Object.entries(competitorCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      timestamp: Date.now(),
      totalQueries: queries.length,
      mentionCount,
      mentionPercentage: (mentionCount / queries.length) * 100,
      categoryStats,
      topCompetitors,
      source: 'manual'
    };
  }

  private generateMonitorQueries(siteName: string, industry: string): { query: string; category: string }[] {
    const queries: { query: string; category: string }[] = [];
    
    const generalQueries = [
      `What is ${siteName}?`,
      `Tell me about ${siteName}`,
      `What does ${siteName} do?`,
      `${siteName} overview`
    ];
    
    const comparisonQueries = [
      `${siteName} vs competitors`,
      `${siteName} alternatives`,
      `Best ${industry} platforms like ${siteName}`,
      `${siteName} comparison`
    ];
    
    const recommendationQueries = [
      `Best ${industry} platforms`,
      `Top ${industry} solutions`,
      `Recommended ${industry} tools`,
      `${industry} platform recommendations`
    ];
    
    const howtoQueries = [
      `How to use ${siteName}`,
      `${siteName} tutorial`,
      `${siteName} getting started guide`,
      `${siteName} documentation`
    ];
    
    const reviewQueries = [
      `${siteName} reviews`,
      `Is ${siteName} good?`,
      `${siteName} testimonials`,
      `${siteName} user feedback`
    ];
    
    const pricingQueries = [
      `${siteName} pricing`,
      `${siteName} cost`,
      `${siteName} plans`,
      `How much does ${siteName} cost?`
    ];
    
    const featureQueries = [
      `${siteName} features`,
      `${siteName} capabilities`,
      `What can ${siteName} do?`,
      `${siteName} functionality`
    ];
    
    for (const q of generalQueries) queries.push({ query: q, category: 'general' });
    for (const q of comparisonQueries) queries.push({ query: q, category: 'comparison' });
    for (const q of recommendationQueries) queries.push({ query: q, category: 'recommendations' });
    for (const q of howtoQueries) queries.push({ query: q, category: 'howto' });
    for (const q of reviewQueries) queries.push({ query: q, category: 'reviews' });
    for (const q of pricingQueries) queries.push({ query: q, category: 'pricing' });
    for (const q of featureQueries) queries.push({ query: q, category: 'features' });
    
    return queries;
  }

  private async queryLLM(query: string): Promise<string> {
    if (!this.openai) {
      return this.generateMockResponse('', query);
    }
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Provide informative responses.' },
          { role: 'user', content: query }
        ],
        temperature: 0.7,
        max_tokens: 500
      });
      
      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      return '';
    }
  }

  private generateMockResponse(siteName: string, query: string): string {
    const competitors = ['HubSpot', 'Salesforce', 'Zapier', 'Airtable', 'Notion', 'Slack', 'Monday.com'];
    const randomCompetitors = competitors.sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 3) + 1);
    const mentioned = Math.random() > 0.4;
    
    const responses: string[] = [];
    
    if (query.toLowerCase().includes('pricing') || query.toLowerCase().includes('cost')) {
      responses.push(`There are several ${siteName ? 'options in this space' : 'pricing options available'}. ${mentioned && siteName ? siteName : randomCompetitors[0]} offers competitive pricing with various plans to suit different needs.`);
    } else if (query.toLowerCase().includes('review') || query.toLowerCase().includes('good')) {
      responses.push(`Based on user reviews, ${mentioned && siteName ? siteName : randomCompetitors[0]} is well-regarded for its ease of use and features. Many users appreciate the intuitive interface and responsive support.`);
    } else if (query.toLowerCase().includes('vs') || query.toLowerCase().includes('comparison') || query.toLowerCase().includes('alternative')) {
      responses.push(`When comparing options, ${mentioned && siteName ? siteName : randomCompetitors[0]} and ${randomCompetitors[1] || 'others'} are popular choices. Each has its strengths depending on your specific needs.`);
    } else if (query.toLowerCase().includes('best') || query.toLowerCase().includes('top') || query.toLowerCase().includes('recommend')) {
      responses.push(`Some of the top solutions include ${mentioned && siteName ? siteName : randomCompetitors[0]}, ${randomCompetitors[1] || 'Platform B'}, and ${randomCompetitors[2] || 'Platform C'}. The best choice depends on your requirements.`);
    } else {
      responses.push(`${mentioned && siteName ? siteName : randomCompetitors[0]} is a platform that offers various features and capabilities. It's known for being user-friendly and providing good value.`);
    }
    
    return responses.join(' ');
  }

  private checkMention(response: string, siteName: string): boolean {
    if (!siteName || !response) return false;
    const lowerResponse = response.toLowerCase();
    const lowerSite = siteName.toLowerCase();
    return lowerResponse.includes(lowerSite) || lowerResponse.includes(lowerSite.replace(/\s+/g, ''));
  }

  private extractCompetitors(response: string, siteName: string): string[] {
    const knownCompetitors = [
      'HubSpot', 'Salesforce', 'Zapier', 'Airtable', 'Notion', 'Slack', 
      'Monday.com', 'Asana', 'Trello', 'Jira', 'ClickUp', 'Wrike',
      'Intercom', 'Zendesk', 'Freshdesk', 'Mailchimp', 'ActiveCampaign',
      'Shopify', 'WooCommerce', 'BigCommerce', 'Stripe', 'Square'
    ];
    
    const found: string[] = [];
    const lowerResponse = response.toLowerCase();
    
    for (const comp of knownCompetitors) {
      if (lowerResponse.includes(comp.toLowerCase()) && comp.toLowerCase() !== siteName.toLowerCase()) {
        found.push(comp);
      }
    }
    
    return found;
  }

  private analyzeTrend(previous: CitationSnapshot, current: CitationSnapshot): TrendAnalysis {
    const changePercentage = current.mentionPercentage - previous.mentionPercentage;
    
    let direction: 'improving' | 'declining' | 'stable';
    if (changePercentage > 2) {
      direction = 'improving';
    } else if (changePercentage < -2) {
      direction = 'declining';
    } else {
      direction = 'stable';
    }
    
    const insights: string[] = [];
    const recommendations: string[] = [];
    
    if (direction === 'improving') {
      insights.push('Citation rate has improved since last check.');
      insights.push('Your optimization efforts are showing results.');
      recommendations.push('Continue current content strategy.');
      recommendations.push('Monitor which categories improved most.');
    } else if (direction === 'declining') {
      insights.push('Citation rate has declined since last check.');
      insights.push('Competitors may have improved their content.');
      recommendations.push('Review competitor content for new additions.');
      recommendations.push('Update and refresh existing content.');
      recommendations.push('Consider creating new targeted content.');
    } else {
      insights.push('Citation rate remains stable.');
      recommendations.push('Maintain current content quality.');
      recommendations.push('Look for opportunities in underperforming categories.');
    }
    
    for (const [category, stats] of Object.entries(current.categoryStats)) {
      const prevStats = previous.categoryStats[category];
      if (prevStats) {
        const categoryChange = stats.percentage - prevStats.percentage;
        if (categoryChange > 10) {
          insights.push(`Strong improvement in ${category} queries (+${categoryChange.toFixed(1)}%).`);
        } else if (categoryChange < -10) {
          insights.push(`Decline in ${category} queries (${categoryChange.toFixed(1)}%).`);
          recommendations.push(`Focus on improving ${category} content.`);
        }
      }
    }
    
    return { direction, changePercentage, insights, recommendations };
  }

  private analyzeCompetitorMovements(previous: CitationSnapshot, current: CitationSnapshot): CompetitorMovement[] {
    const movements: CompetitorMovement[] = [];
    
    const prevCompetitors = previous.topCompetitors || [];
    const currCompetitors = current.topCompetitors || [];
    
    const allCompetitors = new Set([
      ...prevCompetitors.map(c => c.name),
      ...currCompetitors.map(c => c.name)
    ]);
    
    for (const competitor of allCompetitors) {
      const prevRank = prevCompetitors.findIndex(c => c.name === competitor) + 1 || 999;
      const currRank = currCompetitors.findIndex(c => c.name === competitor) + 1 || 999;
      const prevCount = prevCompetitors.find(c => c.name === competitor)?.count || 0;
      const currCount = currCompetitors.find(c => c.name === competitor)?.count || 0;
      
      let change: 'up' | 'down' | 'stable';
      if (currRank < prevRank && currRank !== 999) {
        change = 'up';
      } else if (currRank > prevRank || (prevRank !== 999 && currRank === 999)) {
        change = 'down';
      } else {
        change = 'stable';
      }
      
      movements.push({
        competitor,
        previousRank: prevRank === 999 ? 0 : prevRank,
        currentRank: currRank === 999 ? 0 : currRank,
        change,
        mentionChange: currCount - prevCount
      });
    }
    
    return movements.sort((a, b) => a.currentRank - b.currentRank);
  }

  private calculateAvgMentionRate(history: CitationSnapshot[]): number {
    if (history.length === 0) return 0;
    const total = history.reduce((sum, snap) => sum + snap.mentionPercentage, 0);
    return total / history.length;
  }

  private calculateImprovementRate(history: CitationSnapshot[]): number {
    if (history.length < 2) return 0;
    const first = history[0].mentionPercentage;
    const last = history[history.length - 1].mentionPercentage;
    return last - first;
  }

  private calculateDaysTracked(history: CitationSnapshot[]): number {
    if (history.length < 2) return 0;
    const first = history[0].timestamp;
    const last = history[history.length - 1].timestamp;
    return Math.floor((last - first) / (1000 * 60 * 60 * 24));
  }

  private saveResults(workflowId: string, workflow: Phase5Result): void {
    const outputDir = path.join(process.cwd(), 'knowledge-bases', workflow.knowledgeBaseId);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(outputDir, 'phase5-results.json'),
      JSON.stringify(workflow, null, 2)
    );
    
    console.log(`[Phase5Orchestrator] Results saved to: ${outputDir}/phase5-results.json`);
  }

  private saveHistory(workflowId: string, knowledgeBaseId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    
    const outputDir = path.join(process.cwd(), 'knowledge-bases', knowledgeBaseId);
    
    fs.writeFileSync(
      path.join(outputDir, 'citation-history.json'),
      JSON.stringify({ 
        knowledgeBaseId,
        lastUpdated: Date.now(),
        snapshots: workflow.history 
      }, null, 2)
    );
  }

  getWorkflow(workflowId: string): Phase5Result | undefined {
    return this.workflows.get(workflowId);
  }

  getAllWorkflows(): Phase5Result[] {
    return Array.from(this.workflows.values());
  }

  getHistory(knowledgeBaseId: string): CitationSnapshot[] {
    const historyPath = path.join(process.cwd(), 'knowledge-bases', knowledgeBaseId, 'citation-history.json');
    if (!fs.existsSync(historyPath)) return [];
    
    try {
      const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      return data.snapshots || [];
    } catch {
      return [];
    }
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

  startScheduledMonitoring(knowledgeBaseId: string, intervalHours: number = 24, apiKey?: string): string {
    const workflowId = this.startMonitoring(knowledgeBaseId, apiKey);
    
    const intervalMs = intervalHours * 60 * 60 * 1000;
    const interval = setInterval(() => {
      this.executeMonitoring(workflowId, knowledgeBaseId);
    }, intervalMs);
    
    this.monitoringIntervals.set(workflowId, interval);
    
    return workflowId;
  }

  stopScheduledMonitoring(workflowId: string): void {
    const interval = this.monitoringIntervals.get(workflowId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(workflowId);
    }
  }
}
