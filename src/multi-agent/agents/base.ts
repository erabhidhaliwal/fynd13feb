import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { AgentMessage, AgentConfig } from '../types/index.js';

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected messageQueue: AgentMessage[] = [];
  protected emitter: EventEmitter;
  protected context: Map<string, any> = new Map();
  protected tools: Map<string, Function> = new Map();

  constructor(config: AgentConfig) {
    this.config = config;
    this.emitter = new EventEmitter();
    this.registerDefaultTools();
  }

  protected registerDefaultTools(): void {
    this.registerTool('sendMessage', async (to: string, type: AgentMessage['type'], payload: any) => {
      return this.sendMessage(to, type, payload);
    });

    this.registerTool('broadcast', async (type: AgentMessage['type'], payload: any) => {
      return this.broadcast(type, payload);
    });

    this.registerTool('log', async (message: string) => {
      console.log(`[${this.config.name}] ${message}`);
      return { success: true };
    });
  }

  protected registerTool(name: string, handler: Function): void {
    this.tools.set(name, handler);
  }

  abstract process(input: any): Promise<any>;

  async executeTool(toolName: string, args: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    return await tool(args);
  }

  protected async sendMessage(to: string, type: AgentMessage['type'], payload: any): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: uuidv4(),
      from: this.config.name,
      to,
      type,
      payload,
      timestamp: Date.now()
    };
    
    this.emitter.emit('message', message);
    return message;
  }

  protected async broadcast(type: AgentMessage['type'], payload: any): Promise<AgentMessage[]> {
    const messages: AgentMessage[] = [];
    return messages;
  }

  getName(): string {
    return this.config.name;
  }

  getRole(): string {
    return this.config.role;
  }

  getCapabilities(): AgentCapability[] {
    return this.config.capabilities;
  }

  setContext(key: string, value: any): void {
    this.context.set(key, value);
  }

  getContext(key: string): any {
    return this.context.get(key);
  }

  clearContext(): void {
    this.context.clear();
  }
}

export class MultiAgentHub extends EventEmitter {
  private agents: Map<string, BaseAgent> = new Map();
  private messageHandlers: Map<string, Function> = new Map();

  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.getName(), agent);
    console.log(`[MultiAgentHub] Registered: ${agent.getName()} (${agent.getRole()})`);
  }

  getAgent(name: string): BaseAgent | undefined {
    return this.agents.get(name);
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  async routeMessage(message: AgentMessage): Promise<void> {
    const targetAgent = this.agents.get(message.to);
    
    if (!targetAgent) {
      console.error(`[MultiAgentHub] Unknown agent: ${message.to}`);
      return;
    }

    try {
      const response = await targetAgent.process(message.payload);
      if (response) {
        this.emit('message', {
          ...message,
          type: 'response',
          payload: response
        });
      }
    } catch (error: any) {
      console.error(`[MultiAgentHub] Error routing message:`, error.message);
      this.emit('error', { message, error: error.message });
    }
  }

  onMessage(handler: Function): void {
    this.on('message', handler);
  }

  onError(handler: Function): void {
    this.on('error', handler);
  }
}
