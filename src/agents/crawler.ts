import { BaseAgent } from './base.js';
import { AgentMessage, CrawlerResult } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

export class CrawlerAgent extends BaseAgent {
  private maxPages: number = 50;
  private visitedUrls: Set<string> = new Set();

  constructor() {
    super({
      name: 'CrawlerAgent',
      description: 'Crawls websites and converts them to Markdown',
      capabilities: ['crawl', 'convertToMarkdown', 'extractContent']
    });
  }

  async processMessage(message: AgentMessage): Promise<AgentMessage | null> {
    switch (message.type) {
      case 'request':
        if (message.payload.action === 'crawl') {
          return await this.crawlWebsite(message.payload.url, message.payload.workflowId);
        }
        break;
      case 'notification':
        if (message.payload.action === 'startWorkflow') {
          return await this.crawlWebsite(message.payload.url, message.payload.workflowId);
        }
        break;
    }
    return null;
  }

  async crawlWebsite(url: string, workflowId: string): Promise<AgentMessage> {
    console.log(`[CrawlerAgent] Starting crawl of: ${url}`);
    
    try {
      const parsedUrl = new URL(url);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
      
      const pages: { url: string; title: string; content: string }[] = [];
      this.visitedUrls.clear();
      
      await this.crawlPage(url, baseUrl, pages, 0);
      
      const combinedMarkdown = this.combinePagesToMarkdown(pages);
      const title = pages[0]?.title || 'Website';
      const description = this.extractDescription(pages[0]?.content || '');
      
      const result: CrawlerResult = {
        markdown: combinedMarkdown,
        pages: pages.map(p => ({ url: p.url, title: p.title, content: p.content })),
        title,
        description
      };

      console.log(`[CrawlerAgent] Crawled ${pages.length} pages, generated ${combinedMarkdown.length} chars of markdown`);
      
      return await this.sendMessage('WorkflowManager', 'response', {
        workflowId,
        action: 'crawlComplete',
        result
      });
      
    } catch (error: any) {
      console.error(`[CrawlerAgent] Error crawling website:`, error.message);
      
      return await this.sendMessage('WorkflowManager', 'error', {
        workflowId,
        action: 'crawlFailed',
        error: error.message
      });
    }
  }

  private async crawlPage(url: string, baseUrl: string, pages: any[], depth: number): Promise<void> {
    if (depth > 3 || this.visitedUrls.has(url)) return;
    if (!url.startsWith(baseUrl)) return;
    
    this.visitedUrls.add(url);
    
    try {
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GEOBot/1.0)'
        },
        maxContentLength: 10 * 1024 * 1024
      });
      
      const $ = cheerio.load(response.data);
      
      $('script, style, nav, footer, header, aside, .nav, .menu, .sidebar, .advertisement, .ad').remove();
      
      const title = $('title').text() || $('h1').first().text() || 'Untitled';
      const htmlContent = $('body').html() || '';
      const markdown = turndownService.turndown(htmlContent);
      
      const content = markdown.substring(0, 50000);
      
      pages.push({ url, title: title.trim(), content });
      
      const links: string[] = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          const absoluteUrl = new URL(href, baseUrl).href;
          if (absoluteUrl.startsWith(baseUrl)) {
            links.push(absoluteUrl);
          }
        }
      });
      
      const limitedLinks = [...new Set(links)].slice(0, 20);
      
      for (const link of limitedLinks) {
        if (this.visitedUrls.size >= this.maxPages) break;
        await this.crawlPage(link, baseUrl, pages, depth + 1);
      }
      
    } catch (error: any) {
      console.log(`[CrawlerAgent] Failed to crawl ${url}: ${error.message}`);
    }
  }

  private combinePagesToMarkdown(pages: { url: string; title: string; content: string }[]): string {
    const sortedPages = pages.sort((a, b) => a.url.localeCompare(b.url));
    
    let markdown = `# Website Content\n\n`;
    markdown += `*Crawled from: ${pages[0]?.url || 'N/A'}*\n\n`;
    markdown += `---\n\n`;
    
    for (const page of sortedPages) {
      markdown += `## ${page.title}\n\n`;
      markdown += `*Source: ${page.url}*\n\n`;
      markdown += page.content;
      markdown += `\n\n---\n\n`;
    }
    
    return markdown;
  }

  private extractDescription(content: string): string {
    const lines = content.split('\n').filter(l => l.trim().length > 50);
    return lines[0]?.substring(0, 200) || 'No description available';
  }
}
