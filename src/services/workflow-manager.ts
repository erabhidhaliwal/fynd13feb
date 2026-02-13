import { AgentHub } from '../agents/base.js';
import { CrawlerAgent, QueryAgent, GapAnalysisAgent, PageGeneratorAgent } from '../agents/index.js';
import { WorkflowState, AgentMessage } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export class WorkflowManager {
  private agentHub: AgentHub;
  private crawlerAgent: CrawlerAgent;
  private queryAgent: QueryAgent;
  private gapAnalysisAgent: GapAnalysisAgent;
  private pageGeneratorAgent: PageGeneratorAgent;
  private workflows: Map<string, WorkflowState> = new Map();
  private listeners: Map<string, (event: string, data: any) => void> = new Map();

  constructor() {
    this.agentHub = new AgentHub();
    
    this.crawlerAgent = new CrawlerAgent();
    this.queryAgent = new QueryAgent();
    this.gapAnalysisAgent = new GapAnalysisAgent();
    this.pageGeneratorAgent = new PageGeneratorAgent();
    
    this.agentHub.registerAgent(this.crawlerAgent);
    this.agentHub.registerAgent(this.queryAgent);
    this.agentHub.registerAgent(this.gapAnalysisAgent);
    this.agentHub.registerAgent(this.pageGeneratorAgent);
    
    this.setupMessageRouting();
  }

  setOpenAIApiKey(apiKey: string): void {
    this.queryAgent.setApiKey(apiKey);
    this.pageGeneratorAgent.setApiKey(apiKey);
  }

  setOutputDirectory(dir: string): void {
    this.pageGeneratorAgent.setOutputDir(dir);
  }

  private setupMessageRouting(): void {
    this.agentHub.on('message', async (message: AgentMessage) => {
      console.log(`[WorkflowManager] Received message: ${message.from} -> ${message.to} [${message.type}]`);
      
      await this.agentHub.routeMessage(message);
    });
  }

  async startWorkflow(websiteUrl: string): Promise<string> {
    const workflowId = uuidv4();
    
    const workflow: WorkflowState = {
      id: workflowId,
      websiteUrl,
      status: 'crawling',
      markdown: '',
      queryResults: [],
      citationsGaps: [],
      generatedPages: [],
      middlewareCode: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.workflows.set(workflowId, workflow);
    
    this.notifyListeners(workflowId, 'workflowStarted', { workflowId, url: websiteUrl });
    
    setTimeout(() => this.executeStep1_Crawl(workflowId), 100);
    
    return workflowId;
  }

  private async executeStep1_Crawl(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    
    try {
      this.updateStatus(workflowId, 'crawling');
      
      const message = await this.crawlerAgent.crawlWebsite(workflow.websiteUrl, workflowId);
      
      if (message.type === 'response' && message.payload.result) {
        workflow.markdown = message.payload.result.markdown;
        this.updateStatus(workflowId, 'querying');
        this.notifyListeners(workflowId, 'crawlComplete', {
          pagesCount: message.payload.result.pages?.length || 0,
          contentLength: workflow.markdown.length
        });
        
        setTimeout(() => this.executeStep2_Query(workflowId), 100);
      } else {
        this.updateStatus(workflowId, 'error');
        this.notifyListeners(workflowId, 'error', { error: 'Crawl failed' });
      }
      
    } catch (error: any) {
      console.error(`[WorkflowManager] Step 1 Error:`, error.message);
      this.updateStatus(workflowId, 'error');
      this.notifyListeners(workflowId, 'error', { error: error.message });
    }
  }

  private async executeStep2_Query(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    
    try {
      const message = await this.queryAgent.runQueries(
        workflowId,
        workflow.websiteUrl,
        workflow.markdown,
        []
      );
      
      if (message.type === 'response' && message.payload.results) {
        workflow.queryResults = message.payload.results;
        this.updateStatus(workflowId, 'analyzing');
        this.notifyListeners(workflowId, 'queriesComplete', {
          totalQueries: message.payload.stats.totalQueries,
          mentions: message.payload.stats.mentions,
          percentage: message.payload.stats.percentage
        });
        
        setTimeout(() => this.executeStep3_AnalyzeGaps(workflowId), 100);
      } else {
        this.updateStatus(workflowId, 'error');
        this.notifyListeners(workflowId, 'error', { error: 'Query execution failed' });
      }
      
    } catch (error: any) {
      console.error(`[WorkflowManager] Step 2 Error:`, error.message);
      this.updateStatus(workflowId, 'error');
      this.notifyListeners(workflowId, 'error', { error: error.message });
    }
  }

  private async executeStep3_AnalyzeGaps(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    
    try {
      const message = await this.gapAnalysisAgent.analyzeGaps(
        workflowId,
        workflow.queryResults,
        workflow.websiteUrl
      );
      
      if (message.type === 'response' && message.payload.gaps) {
        workflow.citationsGaps = message.payload.gaps;
        this.updateStatus(workflowId, 'generating');
        this.notifyListeners(workflowId, 'gapsAnalyzed', {
          gapsCount: message.payload.gaps.length,
          summary: message.payload.summary
        });
        
        setTimeout(() => this.executeStep4_GeneratePages(workflowId), 100);
      } else {
        this.updateStatus(workflowId, 'error');
        this.notifyListeners(workflowId, 'error', { error: 'Gap analysis failed' });
      }
      
    } catch (error: any) {
      console.error(`[WorkflowManager] Step 3 Error:`, error.message);
      this.updateStatus(workflowId, 'error');
      this.notifyListeners(workflowId, 'error', { error: error.message });
    }
  }

  private async executeStep4_GeneratePages(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    
    try {
      const siteName = this.extractSiteName(workflow.websiteUrl);
      
      const message = await this.pageGeneratorAgent.generatePages(
        workflowId,
        workflow.websiteUrl,
        workflow.markdown,
        workflow.citationsGaps,
        siteName
      );
      
      if (message.type === 'response') {
        workflow.generatedPages = message.payload.generatedPages;
        workflow.middlewareCode = message.payload.middlewareCode;
        this.updateStatus(workflowId, 'completed');
        this.notifyListeners(workflowId, 'workflowComplete', {
          pagesGenerated: message.payload.stats.pagesGenerated,
          gapsAddressed: message.payload.stats.gapsAddressed,
          middlewarePath: message.payload.middlewarePath
        });
      } else {
        this.updateStatus(workflowId, 'error');
        this.notifyListeners(workflowId, 'error', { error: 'Page generation failed' });
      }
      
    } catch (error: any) {
      console.error(`[WorkflowManager] Step 4 Error:`, error.message);
      this.updateStatus(workflowId, 'error');
      this.notifyListeners(workflowId, 'error', { error: error.message });
    }
  }

  private updateStatus(workflowId: string, status: WorkflowState['status']): void {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.status = status;
      workflow.updatedAt = Date.now();
    }
  }

  private extractSiteName(url: string): string {
    try {
      const hostname = new URL(url).hostname.replace('www.', '');
      return hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
    } catch {
      return 'Website';
    }
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

  async getWorkflowStatus(workflowId: string): Promise<WorkflowState | null> {
    return this.workflows.get(workflowId) || null;
  }
}
