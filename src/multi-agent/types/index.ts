export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'notification' | 'error';
  payload: any;
  timestamp: number;
}

export interface AgentCapability {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema: any;
}

export interface AgentConfig {
  name: string;
  role: string;
  description: string;
  capabilities: AgentCapability[];
  model?: string;
  maxTokens?: number;
}

export interface WorkflowState {
  id: string;
  websiteUrl: string;
  phase: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  data: PhaseData;
  createdAt: number;
  updatedAt: number;
}

export interface PhaseData {
  crawlResult?: CrawlResult;
  extractedContent?: ExtractedContent[];
  linkMap?: LinkMap;
  schemaAnalysis?: SchemaAnalysis;
  knowledgeBase?: KnowledgeBase;
}

export interface CrawlResult {
  url: string;
  title: string;
  description: string;
  pages: CrawledPage[];
  totalPages: number;
  crawledAt: number;
  duration: number;
}

export interface CrawledPage {
  url: string;
  title: string;
  content: string;
  html: string;
  status: number;
  depth: number;
  loadTime: number;
  wordCount: number;
}

export interface ExtractedContent {
  pageUrl: string;
  title: string;
  headings: Heading[];
  paragraphs: string[];
  lists: string[];
  tables: TableData[];
  images: ImageInfo[];
  codeBlocks: string[];
  links: LinkInfo[];
  metadata: PageMetadata;
}

export interface Heading {
  level: number;
  text: string;
  id?: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface ImageInfo {
  src: string;
  alt: string;
  title?: string;
}

export interface LinkInfo {
  href: string;
  text: string;
  title?: string;
  isInternal: boolean;
  isExternal: boolean;
}

export interface PageMetadata {
  description?: string;
  keywords?: string[];
  author?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: string;
  robots?: string;
}

export interface LinkMap {
  internalLinks: Map<string, string[]>;
  externalLinks: Map<string, string[]>;
  sitemaps: string[];
  brokenLinks: string[];
  orphanPages: string[];
  siteStructure: SitePage[];
}

export interface SitePage {
  url: string;
  title: string;
  depth: number;
  children: string[];
  parent?: string;
}

export interface SchemaAnalysis {
  schemaTypes: SchemaType[];
  missingSchemas: string[];
  richResults: RichResult[];
  gaps: SchemaGap[];
}

export interface SchemaType {
  type: string;
  url: string;
  properties: string[];
}

export interface RichResult {
  type: string;
  detected: boolean;
  valid: boolean;
}

export interface SchemaGap {
  recommended: string;
  importance: 'high' | 'medium' | 'low';
  reason: string;
}

export interface KnowledgeBase {
  siteSummary: SiteSummary;
  topics: Topic[];
  entities: Entity[];
  qaPairs: QAPair[];
  structuredData: any;
  generatedAt: number;
}

export interface SiteSummary {
  name: string;
  description: string;
  industry: string;
  primaryPurpose: string;
  targetAudience: string[];
  keyValueProps: string[];
  brandVoice: string;
}

export interface Topic {
  name: string;
  description: string;
  pages: string[];
  keywords: string[];
  relevance: number;
}

export interface Entity {
  name: string;
  type: string;
  description: string;
  properties: Map<string, string>;
}

export interface QAPair {
  question: string;
  answer: string;
  sourcePage: string;
}
