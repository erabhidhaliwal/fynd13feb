export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'notification' | 'error';
  payload: any;
  timestamp: number;
}

export interface WorkflowState {
  id: string;
  websiteUrl: string;
  status: 'pending' | 'crawling' | 'querying' | 'analyzing' | 'generating' | 'completed' | 'error';
  markdown: string;
  queryResults: QueryResult[];
  citationsGaps: CitationGap[];
  generatedPages: GeneratedPage[];
  middlewareCode: string;
  createdAt: number;
  updatedAt: number;
}

export interface QueryResult {
  query: string;
  llmResponse: string;
  citedUrls: string[];
  yourSiteMentioned: boolean;
  competitorsMentioned: string[];
}

export interface CitationGap {
  query: string;
  competitors: string[];
  missingTopics: string[];
  opportunityScore: number;
}

export interface GeneratedPage {
  id: string;
  title: string;
  content: string;
  targetQuery: string;
  filePath: string;
}

export interface CrawlerResult {
  markdown: string;
  pages: PageInfo[];
  title: string;
  description: string;
}

export interface PageInfo {
  url: string;
  title: string;
  content: string;
}

export interface AgentConfig {
  name: string;
  description: string;
  capabilities: string[];
}
