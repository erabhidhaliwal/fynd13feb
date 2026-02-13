import { AgentMessage, AgentConfig, WorkflowState } from '../types/index.js';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export abstract class BaseAgent {
  protected name: string;
  protected description: string;
  protected capabilities: string[];
  protected messageQueue: AgentMessage[] = [];
  protected emitter: EventEmitter;
  protected workflowState: WorkflowState | null = null;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.capabilities = config.capabilities;
    this.emitter = new EventEmitter();
  }

  abstract processMessage(message: AgentMessage): Promise<AgentMessage | null>;

  async sendMessage(to: string, type: AgentMessage['type'], payload: any): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: uuidv4(),
      from: this.name,
      to,
      type,
      payload,
      timestamp: Date.now()
    };
    
    this.emitter.emit('message', message);
    return message;
  }

  async broadcast(type: AgentMessage['type'], payload: any): Promise<AgentMessage[]> {
    const messages: AgentMessage[] = [];
    const agents = ['CrawlerAgent', 'QueryAgent', 'GapAnalysisAgent', 'PageGeneratorAgent'];
    
    for (const agent of agents) {
      if (agent !== this.name) {
        const msg = await this.sendMessage(agent, type, payload);
        messages.push(msg);
      }
    }
    
    return messages;
  }

  setWorkflowState(state: WorkflowState): void {
    this.workflowState = state;
  }

  getWorkflowState(): WorkflowState | null {
    return this.workflowState;
  }

  getName(): string {
    return this.name;
  }

  canHandle(capability: string): boolean {
    return this.capabilities.includes(capability);
  }
}

export class AgentHub extends EventEmitter {
  private agents: Map<string, BaseAgent> = new Map();
  private workflows: Map<string, WorkflowState> = new Map();

  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.getName(), agent);
    console.log(`[AgentHub] Registered: ${agent.getName()}`);
  }

  async routeMessage(message: AgentMessage): Promise<void> {
    const targetAgent = this.agents.get(message.to);
    
    if (!targetAgent) {
      console.error(`[AgentHub] Unknown agent: ${message.to}`);
      return;
    }

    const response = await targetAgent.processMessage(message);
    
    if (response) {
      this.emit('message', response);
    }
  }

  createWorkflow(url: string): WorkflowState {
    const workflow: WorkflowState = {
      id: uuidv4(),
      websiteUrl: url,
      status: 'pending',
      markdown: '',
      queryResults: [],
      citationsGaps: [],
      generatedPages: [],
      middlewareCode: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.workflows.set(workflow.id, workflow);
    
    for (const agent of this.agents.values()) {
      agent.setWorkflowState(workflow);
    }
    
    return workflow;
  }

  getWorkflow(id: string): WorkflowState | undefined {
    return this.workflows.get(id);
  }

  updateWorkflow(id: string, updates: Partial<WorkflowState>): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      Object.assign(workflow, updates, { updatedAt: Date.now() });
      
      for (const agent of this.agents.values()) {
        agent.setWorkflowState(workflow);
      }
    }
  }

  getAllWorkflows(): WorkflowState[] {
    return Array.from(this.workflows.values());
  }
}
