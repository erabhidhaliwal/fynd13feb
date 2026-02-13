import { 
  CrawlerAgent, 
  ContentExtractionAgent, 
  LinkMappingAgent, 
  SchemaAnalysisAgent, 
  KnowledgeBaseGeneratorAgent 
} from '../agents/index.js';
import { 
  WorkflowState, 
  PhaseData, 
  CrawlResult, 
  ExtractedContent, 
  LinkMap, 
  SchemaAnalysis, 
  KnowledgeBase 
} from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export class Phase1Orchestrator {
  private crawlerAgent: CrawlerAgent;
  private contentExtractionAgent: ContentExtractionAgent;
  private linkMappingAgent: LinkMappingAgent;
  private schemaAnalysisAgent: SchemaAnalysisAgent;
  private knowledgeBaseGeneratorAgent: KnowledgeBaseGeneratorAgent;
  private workflows: Map<string, WorkflowState> = new Map();
  private listeners: Map<string, (event: string, data: any) => void> = new Map();

  constructor() {
    this.crawlerAgent = new CrawlerAgent();
    this.contentExtractionAgent = new ContentExtractionAgent();
    this.linkMappingAgent = new LinkMappingAgent();
    this.schemaAnalysisAgent = new SchemaAnalysisAgent();
    this.knowledgeBaseGeneratorAgent = new KnowledgeBaseGeneratorAgent();
  }

  async startCrawl(websiteUrl: string): Promise<string> {
    const workflowId = uuidv4();
    
    const workflow: WorkflowState = {
      id: workflowId,
      websiteUrl,
      phase: 1,
      status: 'running',
      data: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.workflows.set(workflowId, workflow);
    this.notifyListeners(workflowId, 'workflowStarted', { workflowId, url: websiteUrl });
    
    setTimeout(() => this.executeCrawl(workflowId), 100);
    
    return workflowId;
  }

  private async executeCrawl(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    try {
      this.notifyListeners(workflowId, 'step:start', { step: 'crawling', message: 'Starting website crawl...' });

      const crawlResult = await this.crawlerAgent.process({
        url: workflow.websiteUrl,
        maxPages: 50,
        maxDepth: 3
      });

      workflow.data.crawlResult = crawlResult;
      workflow.updatedAt = Date.now();

      this.notifyListeners(workflowId, 'step:complete', { 
        step: 'crawling', 
        message: `Crawled ${crawlResult.totalPages} pages in ${crawlResult.duration}ms`
      });

      setTimeout(() => this.executeContentExtraction(workflowId), 100);

    } catch (error: any) {
      this.handleError(workflowId, error);
    }
  }

  private async executeContentExtraction(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || !workflow.data.crawlResult) return;

    try {
      this.notifyListeners(workflowId, 'step:start', { step: 'extracting', message: 'Extracting structured content...' });

      const extractedContent = await this.contentExtractionAgent.process({
        pages: workflow.data.crawlResult.pages
      });

      workflow.data.extractedContent = extractedContent;
      workflow.updatedAt = Date.now();

      this.notifyListeners(workflowId, 'step:complete', { 
        step: 'extracting', 
        message: `Extracted content from ${extractedContent.length} pages`
      });

      setTimeout(() => this.executeLinkMapping(workflowId), 100);

    } catch (error: any) {
      this.handleError(workflowId, error);
    }
  }

  private async executeLinkMapping(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || !workflow.data.extractedContent) return;

    try {
      this.notifyListeners(workflowId, 'step:start', { step: 'linkMapping', message: 'Mapping internal and external links...' });

      const baseUrl = workflow.websiteUrl;
      const linkMap = await this.linkMappingAgent.process({
        extractedContent: workflow.data.extractedContent,
        baseUrl
      });

      workflow.data.linkMap = linkMap;
      workflow.updatedAt = Date.now();

      this.notifyListeners(workflowId, 'step:complete', { 
        step: 'linkMapping', 
        message: `Mapped ${linkMap.siteStructure?.length || 0} pages in site structure`
      });

      setTimeout(() => this.executeSchemaAnalysis(workflowId), 100);

    } catch (error: any) {
      this.handleError(workflowId, error);
    }
  }

  private async executeSchemaAnalysis(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || !workflow.data.crawlResult || !workflow.data.extractedContent) return;

    try {
      this.notifyListeners(workflowId, 'step:start', { step: 'schemaAnalysis', message: 'Analyzing schema markup...' });

      const schemaAnalysis = await this.schemaAnalysisAgent.process({
        pages: workflow.data.crawlResult.pages,
        extractedContent: workflow.data.extractedContent
      });

      workflow.data.schemaAnalysis = schemaAnalysis;
      workflow.updatedAt = Date.now();

      this.notifyListeners(workflowId, 'step:complete', { 
        step: 'schemaAnalysis', 
        message: `Found ${schemaAnalysis.schemaTypes?.length || 0} schema types, ${schemaAnalysis.gaps?.length || 0} gaps identified`
      });

      setTimeout(() => this.executeKnowledgeBaseGeneration(workflowId), 100);

    } catch (error: any) {
      this.handleError(workflowId, error);
    }
  }

  private async executeKnowledgeBaseGeneration(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow || !workflow.data.extractedContent || !workflow.data.linkMap || !workflow.data.schemaAnalysis) return;

    try {
      this.notifyListeners(workflowId, 'step:start', { step: 'knowledgeBase', message: 'Generating AI-readable knowledge base...' });

      const knowledgeBase = await this.knowledgeBaseGeneratorAgent.process({
        extractedContent: workflow.data.extractedContent,
        linkMap: workflow.data.linkMap,
        schemaAnalysis: workflow.data.schemaAnalysis,
        siteUrl: workflow.websiteUrl
      });

      workflow.data.knowledgeBase = knowledgeBase;
      workflow.status = 'completed';
      workflow.updatedAt = Date.now();

      this.saveKnowledgeBase(workflowId, knowledgeBase);

      this.notifyListeners(workflowId, 'workflowComplete', {
        workflowId,
        message: 'Phase 1 complete! Knowledge base generated.',
        stats: {
          pages: workflow.data.crawlResult?.totalPages,
          topics: knowledgeBase.topics?.length,
          entities: knowledgeBase.entities?.length,
          qaPairs: knowledgeBase.qaPairs?.length,
          schemaTypes: workflow.data.schemaAnalysis?.schemaTypes?.length,
          gaps: workflow.data.schemaAnalysis?.gaps?.length
        }
      });

    } catch (error: any) {
      this.handleError(workflowId, error);
    }
  }

  private handleError(workflowId: string, error: any): void {
    console.error(`[Phase1Orchestrator] Error in workflow ${workflowId}:`, error);
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.status = 'error';
      workflow.updatedAt = Date.now();
    }
    this.notifyListeners(workflowId, 'error', { error: error.message, stack: error.stack });
  }

  private saveKnowledgeBase(workflowId: string, knowledgeBase: KnowledgeBase): void {
    const outputDir = path.join(process.cwd(), 'knowledge-bases', workflowId);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(outputDir, 'knowledge-base.json'),
      JSON.stringify(knowledgeBase, null, 2)
    );

    const summary = {
      siteName: knowledgeBase.siteSummary.name,
      industry: knowledgeBase.siteSummary.industry,
      primaryPurpose: knowledgeBase.siteSummary.primaryPurpose,
      targetAudience: knowledgeBase.siteSummary.targetAudience,
      topicsCount: knowledgeBase.topics.length,
      entitiesCount: knowledgeBase.entities.length,
      qaPairsCount: knowledgeBase.qaPairs.length,
      generatedAt: new Date(knowledgeBase.generatedAt).toISOString()
    };

    fs.writeFileSync(
      path.join(outputDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log(`[Phase1Orchestrator] Knowledge base saved to: ${outputDir}`);
  }

  getWorkflow(workflowId: string): WorkflowState | undefined {
    return this.workflows.get(workflowId);
  }

  getAllWorkflows(): WorkflowState[] {
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
