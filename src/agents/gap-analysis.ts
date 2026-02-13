import { BaseAgent } from './base.js';
import { AgentMessage, QueryResult, CitationGap } from '../types/index.js';

export class GapAnalysisAgent extends BaseAgent {
  constructor() {
    super({
      name: 'GapAnalysisAgent',
      description: 'Identifies citation gaps between your site and competitors',
      capabilities: ['analyzeGaps', 'identifyOpportunities', 'compareCitations']
    });
  }

  async processMessage(message: AgentMessage): Promise<AgentMessage | null> {
    switch (message.type) {
      case 'request':
        if (message.payload.action === 'analyzeGaps') {
          return await this.analyzeGaps(
            message.payload.workflowId,
            message.payload.queryResults,
            message.payload.siteUrl
          );
        }
        break;
    }
    return null;
  }

  async analyzeGaps(workflowId: string, queryResults: QueryResult[], siteUrl: string): Promise<AgentMessage> {
    console.log(`[GapAnalysisAgent] Analyzing citation gaps for ${queryResults.length} query results`);
    
    try {
      const gaps: CitationGap[] = [];
      
      const competitorMentions = new Map<string, Set<string>>();
      const siteMentions = new Set<string>();
      
      for (const result of queryResults) {
        if (result.yourSiteMentioned) {
          siteMentions.add(result.query);
        }
        
        for (const competitor of result.competitorsMentioned) {
          if (!competitorMentions.has(competitor)) {
            competitorMentions.set(competitor, new Set());
          }
          competitorMentions.get(competitor)!.add(result.query);
        }
      }
      
      const queryByCategory = this.categorizeQueries(queryResults);
      
      for (const [category, queries] of Object.entries(queryByCategory)) {
        const siteInCategory = queries.filter(q => siteMentions.has(q.query));
        const competitorsInCategory: Map<string, number> = new Map();
        
        for (const query of queries) {
          for (const competitor of query.competitorsMentioned) {
            competitorsInCategory.set(
              competitor, 
              (competitorsInCategory.get(competitor) || 0) + 1
            );
          }
        }
        
        if (competitorsInCategory.size > 0 && siteInCategory.length < queries.length * 0.5) {
          const topCompetitors = Array.from(competitorsInCategory.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(e => e[0]);
          
          const siteQueries = siteInCategory.map(q => q.query);
          const allQueries = queries.map(q => q.query);
          const missingTopics = allQueries.filter(q => !siteQueries.includes(q));
          
          const opportunityScore = this.calculateOpportunityScore(
            queries.length,
            siteInCategory.length,
            topCompetitors.length,
            competitorMentions.size
          );
          
          if (opportunityScore > 0.3) {
            gaps.push({
              query: category,
              competitors: topCompetitors,
              missingTopics: missingTopics.slice(0, 10),
              opportunityScore
            });
          }
        }
      }
      
      const queryNotMentioned = queryResults.filter(q => !q.yourSiteMentioned && q.competitorsMentioned.length > 0);
      
      const byCompetitor: Map<string, string[]> = new Map();
      for (const result of queryNotMentioned) {
        for (const competitor of result.competitorsMentioned) {
          if (!byCompetitor.has(competitor)) {
            byCompetitor.set(competitor, []);
          }
          byCompetitor.get(competitor)!.push(result.query);
        }
      }
      
      for (const [competitor, queries] of byCompetitor) {
        const gapExists = gaps.find(g => g.competitors.includes(competitor));
        if (!gapExists && queries.length >= 5) {
          gaps.push({
            query: `Competition from ${competitor}`,
            competitors: [competitor],
            missingTopics: queries.slice(0, 10),
            opportunityScore: Math.min(0.9, queries.length / 20)
          });
        }
      }
      
      const sortedGaps = gaps.sort((a, b) => b.opportunityScore - a.opportunityScore);
      const topGaps = sortedGaps.slice(0, 20);
      
      console.log(`[GapAnalysisAgent] Found ${topGaps.length} citation gaps with opportunity score > 0.3`);
      
      return await this.sendMessage('WorkflowManager', 'response', {
        workflowId,
        action: 'gapsAnalyzed',
        gaps: topGaps,
        summary: {
          totalGaps: topGaps.length,
          avgOpportunityScore: topGaps.reduce((sum, g) => sum + g.opportunityScore, 0) / topGaps.length,
          topCompetitors: this.getTopCompetitors(gaps)
        }
      });
      
    } catch (error: any) {
      console.error(`[GapAnalysisAgent] Error:`, error.message);
      
      return await this.sendMessage('WorkflowManager', 'error', {
        workflowId,
        action: 'gapAnalysisFailed',
        error: error.message
      });
    }
  }

  private categorizeQueries(queryResults: QueryResult[]): Record<string, QueryResult[]> {
    const categories: Record<string, QueryResult[]> = {
      'general': [],
      'comparison': [],
      'recommendations': [],
      'howto': [],
      'reviews': [],
      'pricing': [],
      'features': [],
      'alternatives': []
    };
    
    for (const result of queryResults) {
      const query = result.query.toLowerCase();
      
      if (query.includes('vs') || query.includes('versus') || query.includes('compare') || query.includes('comparison')) {
        categories['comparison'].push(result);
      } else if (query.includes('best') || query.includes('top') || query.includes('recommend') || query.includes('popular')) {
        categories['recommendations'].push(result);
      } else if (query.includes('how') || query.includes('guide') || query.includes('tutorial')) {
        categories['howto'].push(result);
      } else if (query.includes('review') || query.includes('opinion') || query.includes('rating') || query.includes('pros')) {
        categories['reviews'].push(result);
      } else if (query.includes('price') || query.includes('cost') || query.includes('pricing') || query.includes('fee')) {
        categories['pricing'].push(result);
      } else if (query.includes('feature') || query.includes('benefit') || query.includes('capability')) {
        categories['features'].push(result);
      } else if (query.includes('alternative') || query.includes('instead') || query.includes('competitor')) {
        categories['alternatives'].push(result);
      } else {
        categories['general'].push(result);
      }
    }
    
    return categories;
  }

  private calculateOpportunityScore(
    totalQueries: number,
    siteMentioned: number,
    competitorCount: number,
    totalCompetitors: number
  ): number {
    const coverageGap = 1 - (siteMentioned / totalQueries);
    const competitionFactor = competitorCount / Math.max(totalCompetitors, 1);
    const normalizedScore = (coverageGap * 0.6 + competitionFactor * 0.4);
    
    return Math.min(1, Math.max(0, normalizedScore));
  }

  private getTopCompetitors(gaps: CitationGap[]): string[] {
    const competitorCount: Map<string, number> = new Map();
    
    for (const gap of gaps) {
      for (const competitor of gap.competitors) {
        competitorCount.set(competitor, (competitorCount.get(competitor) || 0) + 1);
      }
    }
    
    return Array.from(competitorCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(e => e[0]);
  }
}
