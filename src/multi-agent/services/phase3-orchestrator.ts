import { 
  QueryResult, 
  KnowledgeBase,
  SiteSummary 
} from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export interface CitationGap {
  id: string;
  category: string;
  query: string;
  competitors: string[];
  missingTopics: string[];
  opportunityScore: number;
  priority: 'high' | 'medium' | 'low';
  recommendation: string;
  suggestedContent: string;
}

export interface GapAnalysisResult {
  id: string;
  knowledgeBaseId: string;
  phase2WorkflowId: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  gaps: CitationGap[];
  stats: {
    totalGaps: number;
    highPriorityGaps: number;
    mediumPriorityGaps: number;
    lowPriorityGaps: number;
    avgOpportunityScore: number;
    topCompetitors: string[];
    categoriesAffected: string[];
    estimatedImpact: number;
  };
  recommendations: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export class Phase3Orchestrator {
  private workflows: Map<string, GapAnalysisResult> = new Map();
  private listeners: Map<string, (event: string, data: any) => void> = new Map();

  async startGapAnalysis(knowledgeBaseId: string, phase2WorkflowId?: string): Promise<string> {
    const workflowId = uuidv4();
    
    const kbPath = path.join(process.cwd(), 'knowledge-bases', knowledgeBaseId, 'knowledge-base.json');
    const phase2Path = phase2WorkflowId 
      ? path.join(process.cwd(), 'knowledge-bases', knowledgeBaseId, 'phase2-results.json')
      : path.join(process.cwd(), 'knowledge-bases', knowledgeBaseId, 'phase2-results.json');
    
    if (!fs.existsSync(kbPath)) {
      throw new Error(`Knowledge base not found: ${knowledgeBaseId}`);
    }
    
    const knowledgeBase: KnowledgeBase = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
    
    let queryResults: QueryResult[] = [];
    if (fs.existsSync(phase2Path)) {
      const phase2Data = JSON.parse(fs.readFileSync(phase2Path, 'utf-8'));
      queryResults = phase2Data.queries || [];
    }
    
    const workflow: GapAnalysisResult = {
      id: workflowId,
      knowledgeBaseId,
      phase2WorkflowId: phase2WorkflowId || '',
      status: 'pending',
      gaps: [],
      stats: {
        totalGaps: 0,
        highPriorityGaps: 0,
        mediumPriorityGaps: 0,
        lowPriorityGaps: 0,
        avgOpportunityScore: 0,
        topCompetitors: [],
        categoriesAffected: [],
        estimatedImpact: 0
      },
      recommendations: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.workflows.set(workflowId, workflow);
    this.notifyListeners(workflowId, 'workflowStarted', { workflowId, knowledgeBaseId });
    
    setTimeout(() => this.executeGapAnalysis(workflowId, knowledgeBase, queryResults), 100);
    
    return workflowId;
  }

  private async executeGapAnalysis(workflowId: string, knowledgeBase: KnowledgeBase, queryResults: QueryResult[]): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    try {
      workflow.status = 'running';
      workflow.updatedAt = Date.now();
      this.notifyListeners(workflowId, 'progress', { step: 'analyzing', message: 'Analyzing citation gaps...' });
      
      const gaps: CitationGap[] = [];
      const siteName = knowledgeBase.siteSummary?.name || 'This Site';
      
      if (queryResults.length > 0) {
        const categoryGaps = this.analyzeByCategory(queryResults, siteName, knowledgeBase);
        gaps.push(...categoryGaps);
        
        const competitorGaps = this.analyzeByCompetitor(queryResults, siteName, knowledgeBase);
        gaps.push(...competitorGaps);
        
        const topicGaps = this.analyzeMissingTopics(queryResults, knowledgeBase);
        gaps.push(...topicGaps);
      } else {
        const mockGaps = this.generateMockGaps(knowledgeBase);
        gaps.push(...mockGaps);
      }
      
      const sortedGaps = gaps.sort((a, b) => b.opportunityScore - a.opportunityScore);
      const uniqueGaps = this.deduplicateGaps(sortedGaps);
      
      workflow.gaps = uniqueGaps.slice(0, 50);
      workflow.stats = this.calculateStats(workflow.gaps);
      workflow.recommendations = this.generateRecommendations(workflow.gaps, knowledgeBase);
      
      workflow.status = 'completed';
      workflow.completedAt = Date.now();
      workflow.updatedAt = Date.now();
      
      this.saveResults(workflowId, workflow);
      
      this.notifyListeners(workflowId, 'workflowComplete', {
        workflowId,
        stats: workflow.stats
      });
      
    } catch (error: any) {
      console.error(`[Phase3Orchestrator] Error:`, error);
      workflow.status = 'error';
      workflow.updatedAt = Date.now();
      this.notifyListeners(workflowId, 'error', { error: error.message });
    }
  }

  private analyzeByCategory(queryResults: QueryResult[], siteName: string, knowledgeBase: KnowledgeBase): CitationGap[] {
    const gaps: CitationGap[] = [];
    const categories = this.categorizeQueries(queryResults);
    
    for (const [category, queries] of Object.entries(categories)) {
      const mentioned = queries.filter(q => q.yourSiteMentioned);
      const notMentioned = queries.filter(q => !q.yourSiteMentioned);
      const mentionRate = queries.length > 0 ? mentioned.length / queries.length : 0;
      
      if (mentionRate < 0.5 && notMentioned.length > 0) {
        const competitors = this.extractCompetitors(notMentioned);
        const missingTopics = this.extractMissingTopics(notMentioned, knowledgeBase);
        
        const opportunityScore = this.calculateCategoryOpportunity(mentionRate, competitors.length, queries.length);
        
        gaps.push({
          id: uuidv4(),
          category,
          query: `Low citation rate in ${category} queries`,
          competitors,
          missingTopics,
          opportunityScore,
          priority: this.determinePriority(opportunityScore),
          recommendation: this.generateCategoryRecommendation(category, mentionRate, competitors),
          suggestedContent: this.suggestContentForCategory(category, knowledgeBase, missingTopics)
        });
      }
    }
    
    return gaps;
  }

  private analyzeByCompetitor(queryResults: QueryResult[], siteName: string, knowledgeBase: KnowledgeBase): CitationGap[] {
    const gaps: CitationGap[] = [];
    const competitorQueries = new Map<string, QueryResult[]>();
    
    for (const result of queryResults) {
      for (const competitor of result.competitorsMentioned) {
        if (!competitorQueries.has(competitor)) {
          competitorQueries.set(competitor, []);
        }
        competitorQueries.get(competitor)!.push(result);
      }
    }
    
    for (const [competitor, queries] of competitorQueries) {
      const siteMentionedInAny = queries.some(q => q.yourSiteMentioned);
      const timesCompetitorMentioned = queries.length;
      
      if (!siteMentionedInAny && timesCompetitorMentioned >= 2) {
        const opportunityScore = Math.min(0.9, timesCompetitorMentioned / 10);
        
        gaps.push({
          id: uuidv4(),
          category: 'competition',
          query: `Competitor ${competitor} outranking in ${queries.length} queries`,
          competitors: [competitor],
          missingTopics: queries.slice(0, 5).map(q => q.query),
          opportunityScore,
          priority: this.determinePriority(opportunityScore),
          recommendation: `Create comparison content highlighting advantages over ${competitor}`,
          suggestedContent: `Create "${siteName} vs ${competitor}" comparison page. Focus on unique differentiators, feature comparisons, and pricing transparency. Include user testimonials and case studies.`
        });
      }
    }
    
    return gaps;
  }

  private analyzeMissingTopics(queryResults: QueryResult[], knowledgeBase: KnowledgeBase): CitationGap[] {
    const gaps: CitationGap[] = [];
    const existingTopics = new Set(knowledgeBase.topics?.map(t => t.name.toLowerCase()) || []);
    
    const notMentioned = queryResults.filter(q => !q.yourSiteMentioned);
    const missingTopicQueries = new Map<string, string[]>();
    
    for (const result of notMentioned) {
      const queryLower = result.query.toLowerCase();
      const matchedExisting = Array.from(existingTopics).some(topic => queryLower.includes(topic));
      
      if (!matchedExisting) {
        const keyPhrase = this.extractKeyPhrase(result.query);
        if (keyPhrase) {
          if (!missingTopicQueries.has(keyPhrase)) {
            missingTopicQueries.set(keyPhrase, []);
          }
          missingTopicQueries.get(keyPhrase)!.push(result.query);
        }
      }
    }
    
    for (const [topic, queries] of missingTopicQueries) {
      if (queries.length >= 2) {
        const opportunityScore = Math.min(0.85, queries.length / 8);
        
        gaps.push({
          id: uuidv4(),
          category: 'content_gap',
          query: `Missing content for topic: ${topic}`,
          competitors: this.extractCompetitors(queries.map(q => ({ query: q, competitorsMentioned: [] } as QueryResult))),
          missingTopics: [topic],
          opportunityScore,
          priority: this.determinePriority(opportunityScore),
          recommendation: `Create comprehensive content about ${topic}`,
          suggestedContent: `Develop a dedicated page or section covering "${topic}". Include: overview, use cases, benefits, implementation guide, and FAQs. Target keywords from queries: ${queries.slice(0, 3).join(', ')}.`
        });
      }
    }
    
    return gaps;
  }

  private generateMockGaps(knowledgeBase: KnowledgeBase): CitationGap[] {
    const gaps: CitationGap[] = [];
    const siteName = knowledgeBase.siteSummary?.name || 'This Site';
    const industry = knowledgeBase.siteSummary?.industry || 'business';
    
    const mockGapTemplates = [
      {
        category: 'comparison',
        query: 'Competitor comparison content missing',
        competitors: ['Competitor A', 'Competitor B'],
        missingTopics: ['comparison', 'versus', 'alternative'],
        opportunityScore: 0.85,
        recommendation: 'Create comparison pages with key competitors'
      },
      {
        category: 'reviews',
        query: 'User review content lacking',
        competitors: ['Competitor C'],
        missingTopics: ['reviews', 'testimonials', 'user feedback'],
        opportunityScore: 0.75,
        recommendation: 'Add customer testimonials and review summaries'
      },
      {
        category: 'pricing',
        query: 'Pricing transparency gap',
        competitors: ['Competitor D'],
        missingTopics: ['pricing', 'cost', 'plans'],
        opportunityScore: 0.90,
        recommendation: 'Create detailed pricing page with feature comparisons'
      },
      {
        category: 'features',
        query: 'Feature documentation incomplete',
        competitors: ['Competitor E'],
        missingTopics: ['features', 'capabilities', 'use cases'],
        opportunityScore: 0.70,
        recommendation: 'Develop comprehensive feature documentation'
      },
      {
        category: 'howto',
        query: 'Tutorial and guide content missing',
        competitors: ['Competitor F'],
        missingTopics: ['how to', 'tutorial', 'guide', 'getting started'],
        opportunityScore: 0.65,
        recommendation: 'Create step-by-step tutorials and getting started guides'
      }
    ];
    
    for (const template of mockGapTemplates) {
      gaps.push({
        id: uuidv4(),
        category: template.category,
        query: template.query,
        competitors: template.competitors,
        missingTopics: template.missingTopics,
        opportunityScore: template.opportunityScore,
        priority: this.determinePriority(template.opportunityScore),
        recommendation: template.recommendation,
        suggestedContent: `${template.recommendation}. Focus on ${template.missingTopics.join(', ')}. Research competitor approaches and create more comprehensive content.`
      });
    }
    
    return gaps;
  }

  private categorizeQueries(queryResults: QueryResult[]): Record<string, QueryResult[]> {
    const categories: Record<string, QueryResult[]> = {
      general: [],
      comparison: [],
      recommendations: [],
      howto: [],
      reviews: [],
      pricing: [],
      features: [],
      alternatives: []
    };
    
    for (const result of queryResults) {
      const query = result.query.toLowerCase();
      
      if (query.includes('vs') || query.includes('versus') || query.includes('compare')) {
        categories.comparison.push(result);
      } else if (query.includes('best') || query.includes('top') || query.includes('recommend')) {
        categories.recommendations.push(result);
      } else if (query.includes('how') || query.includes('guide') || query.includes('tutorial')) {
        categories.howto.push(result);
      } else if (query.includes('review') || query.includes('opinion') || query.includes('rating')) {
        categories.reviews.push(result);
      } else if (query.includes('price') || query.includes('cost') || query.includes('pricing')) {
        categories.pricing.push(result);
      } else if (query.includes('feature') || query.includes('capabilities')) {
        categories.features.push(result);
      } else if (query.includes('alternative') || query.includes('competitor')) {
        categories.alternatives.push(result);
      } else {
        categories.general.push(result);
      }
    }
    
    return categories;
  }

  private extractCompetitors(queries: QueryResult[]): string[] {
    const competitors = new Map<string, number>();
    
    for (const query of queries) {
      for (const comp of query.competitorsMentioned || []) {
        competitors.set(comp, (competitors.get(comp) || 0) + 1);
      }
    }
    
    return Array.from(competitors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(e => e[0]);
  }

  private extractMissingTopics(queries: QueryResult[], knowledgeBase: KnowledgeBase): string[] {
    const existingTopics = new Set(knowledgeBase.topics?.map(t => t.name.toLowerCase()) || []);
    const missingTopics: string[] = [];
    
    for (const query of queries) {
      const keyPhrase = this.extractKeyPhrase(query.query);
      if (keyPhrase && !existingTopics.has(keyPhrase.toLowerCase())) {
        missingTopics.push(keyPhrase);
      }
    }
    
    return [...new Set(missingTopics)].slice(0, 10);
  }

  private extractKeyPhrase(query: string): string | null {
    const words = query.toLowerCase()
      .replace(/[?!.]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !['what', 'where', 'which', 'when', 'how', 'does', 'is', 'are', 'the', 'for', 'with', 'about', 'your', 'this', 'that'].includes(w));
    
    return words.slice(0, 2).join(' ') || null;
  }

  private calculateCategoryOpportunity(mentionRate: number, competitorCount: number, queryCount: number): number {
    const gapScore = (1 - mentionRate) * 0.5;
    const competitionScore = Math.min(competitorCount / 5, 1) * 0.3;
    const volumeScore = Math.min(queryCount / 10, 1) * 0.2;
    
    return Math.min(0.95, gapScore + competitionScore + volumeScore);
  }

  private determinePriority(score: number): 'high' | 'medium' | 'low' {
    if (score >= 0.7) return 'high';
    if (score >= 0.4) return 'medium';
    return 'low';
  }

  private generateCategoryRecommendation(category: string, mentionRate: number, competitors: string[]): string {
    const recommendations: Record<string, string> = {
      comparison: `Create detailed comparison pages. Current mention rate: ${(mentionRate * 100).toFixed(1)}%. Focus on differentiating from ${competitors.slice(0, 2).join(' and ')}.`,
      recommendations: `Develop "best of" and recommendation-focused content. Highlight unique selling points and use cases.`,
      howto: `Create comprehensive tutorials and how-to guides. Include step-by-step instructions, screenshots, and examples.`,
      reviews: `Add customer testimonials, case studies, and review summaries. Consider implementing structured data for reviews.`,
      pricing: `Create transparent pricing pages with feature comparisons. Address common pricing-related questions.`,
      features: `Develop detailed feature documentation with use cases, benefits, and implementation guides.`,
      alternatives: `Create "alternatives to" pages positioning your solution against competitors.`,
      general: `Improve general brand awareness content. Ensure key information is clearly presented.`
    };
    
    return recommendations[category] || `Improve content coverage in ${category} category.`;
  }

  private suggestContentForCategory(category: string, knowledgeBase: KnowledgeBase, missingTopics: string[]): string {
    const siteName = knowledgeBase.siteSummary?.name || 'Your Site';
    const industry = knowledgeBase.siteSummary?.industry || 'business';
    
    const templates: Record<string, string> = {
      comparison: `Create a "${siteName} vs Competitors" comparison page. Include feature comparison table, pricing comparison, pros/cons, and user reviews. Target missing topics: ${missingTopics.slice(0, 3).join(', ')}.`,
      recommendations: `Develop "Best ${industry} Solutions" content. Include selection criteria, comparison factors, and why ${siteName} excels in key areas.`,
      howto: `Create "Getting Started with ${siteName}" guide. Include setup instructions, best practices, common use cases, and troubleshooting tips.`,
      reviews: `Build a reviews and testimonials page. Aggregate user feedback, showcase success stories, and address common concerns.`,
      pricing: `Develop comprehensive pricing page. Include plan comparisons, feature breakdown, ROI calculator, and FAQ section.`,
      features: `Create detailed features page. Document all capabilities with examples, use cases, and integration options.`,
      alternatives: `Write "${siteName} Alternatives" page comparing features, pricing, and unique advantages.`,
      general: `Enhance homepage and about pages. Clearly communicate value proposition, target audience, and key differentiators.`
    };
    
    return templates[category] || `Create content addressing ${category} queries.`;
  }

  private deduplicateGaps(gaps: CitationGap[]): CitationGap[] {
    const seen = new Set<string>();
    return gaps.filter(gap => {
      const key = `${gap.category}-${gap.query}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private calculateStats(gaps: CitationGap[]): GapAnalysisResult['stats'] {
    const totalGaps = gaps.length;
    const highPriorityGaps = gaps.filter(g => g.priority === 'high').length;
    const mediumPriorityGaps = gaps.filter(g => g.priority === 'medium').length;
    const lowPriorityGaps = gaps.filter(g => g.priority === 'low').length;
    
    const avgOpportunityScore = totalGaps > 0 
      ? gaps.reduce((sum, g) => sum + g.opportunityScore, 0) / totalGaps 
      : 0;
    
    const competitorCounts = new Map<string, number>();
    for (const gap of gaps) {
      for (const comp of gap.competitors) {
        competitorCounts.set(comp, (competitorCounts.get(comp) || 0) + 1);
      }
    }
    
    const topCompetitors = Array.from(competitorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(e => e[0]);
    
    const categoriesAffected = [...new Set(gaps.map(g => g.category))];
    const estimatedImpact = avgOpportunityScore * totalGaps * 10;
    
    return {
      totalGaps,
      highPriorityGaps,
      mediumPriorityGaps,
      lowPriorityGaps,
      avgOpportunityScore,
      topCompetitors,
      categoriesAffected,
      estimatedImpact: Math.round(estimatedImpact)
    };
  }

  private generateRecommendations(gaps: CitationGap[], knowledgeBase: KnowledgeBase): string[] {
    const recommendations: string[] = [];
    const siteName = knowledgeBase.siteSummary?.name || 'Your Site';
    
    const highPriorityGaps = gaps.filter(g => g.priority === 'high');
    if (highPriorityGaps.length > 0) {
      recommendations.push(`Address ${highPriorityGaps.length} high-priority gaps immediately for maximum impact.`);
    }
    
    const comparisonGaps = gaps.filter(g => g.category === 'comparison');
    if (comparisonGaps.length > 0) {
      recommendations.push(`Create comparison content with top competitors: ${comparisonGaps[0].competitors.slice(0, 3).join(', ')}.`);
    }
    
    const pricingGaps = gaps.filter(g => g.category === 'pricing');
    if (pricingGaps.length > 0) {
      recommendations.push(`Improve pricing transparency and create detailed plan comparisons.`);
    }
    
    const contentGaps = gaps.filter(g => g.category === 'content_gap');
    if (contentGaps.length > 0) {
      recommendations.push(`Develop new content for ${contentGaps.length} missing topics identified.`);
    }
    
    recommendations.push(`Implement structured data (schema.org) for better AI visibility.`);
    recommendations.push(`Create FAQ sections addressing common user questions.`);
    recommendations.push(`Develop case studies and success stories for social proof.`);
    
    return recommendations;
  }

  private saveResults(workflowId: string, workflow: GapAnalysisResult): void {
    const outputDir = path.join(process.cwd(), 'knowledge-bases', workflow.knowledgeBaseId);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(outputDir, 'phase3-results.json'),
      JSON.stringify(workflow, null, 2)
    );
    
    console.log(`[Phase3Orchestrator] Results saved to: ${outputDir}/phase3-results.json`);
  }

  getWorkflow(workflowId: string): GapAnalysisResult | undefined {
    return this.workflows.get(workflowId);
  }

  getAllWorkflows(): GapAnalysisResult[] {
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