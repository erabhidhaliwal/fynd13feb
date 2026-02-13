import { BaseAgent } from './base.js';
import { AgentConfig, AgentCapability, CrawlResult, CrawledPage } from '../types/index.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_CAPABILITIES: AgentCapability[] = [
  {
    name: 'crawl',
    description: 'Crawl a website and extract all pages',
    inputSchema: { url: 'string', maxPages: 'number', maxDepth: 'number' },
    outputSchema: { pages: 'array', totalPages: 'number' }
  },
  {
    name: 'extractPage',
    description: 'Extract content from a single page',
    inputSchema: { url: 'string' },
    outputSchema: { content: 'object' }
  },
  {
    name: 'discoverSitemap',
    description: 'Discover and parse sitemap.xml',
    inputSchema: { url: 'string' },
    outputSchema: { urls: 'array' }
  }
];

export class CrawlerAgent extends BaseAgent {
  private maxPages: number = 50;
  private maxDepth: number = 3;
  private visitedUrls: Set<string> = new Set();
  private crawlQueue: string[] = [];
  private baseUrl: string = '';
  private pages: CrawledPage[] = [];

  constructor() {
    const config: AgentConfig = {
      name: 'CrawlerAgent',
      role: 'Crawler',
      description: 'Crawls websites deeply to understand structure and content',
      capabilities: DEFAULT_CAPABILITIES
    };
    super(config);
  }

  async process(input: any): Promise<CrawlResult> {
    const { url, maxPages = 50, maxDepth = 3 } = input;
    
    console.log(`[CrawlerAgent] Starting crawl of: ${url}`);
    console.log(`[CrawlerAgent] Max pages: ${maxPages}, Max depth: ${maxDepth}`);

    this.maxPages = maxPages;
    this.maxDepth = maxDepth;
    this.visitedUrls.clear();
    this.crawlQueue = [];
    this.pages = [];
    
    try {
      const parsedUrl = new URL(url);
      this.baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
      
      const startTime = Date.now();
      
      await this.crawlPage(url, 0);
      
      await this.discoverSitemap();
      
      while (this.crawlQueue.length > 0 && this.visitedUrls.size < this.maxPages) {
        const nextUrl = this.crawlQueue.shift()!;
        if (!this.visitedUrls.has(nextUrl)) {
          await this.crawlPage(nextUrl, 1);
        }
      }

      const duration = Date.now() - startTime;
      
      const result: CrawlResult = {
        url,
        title: this.pages[0]?.title || 'Website',
        description: this.extractDescription(),
        pages: this.pages,
        totalPages: this.visitedUrls.size,
        crawledAt: Date.now(),
        duration
      };

      console.log(`[CrawlerAgent] Crawl complete: ${this.pages.length} pages in ${duration}ms`);
      
      this.setContext('crawlResult', result);
      return result;
      
    } catch (error: any) {
      console.error(`[CrawlerAgent] Crawl error:`, error.message);
      throw error;
    }
  }

  private async crawlPage(url: string, depth: number): Promise<void> {
    if (depth > this.maxDepth) return;
    if (this.visitedUrls.has(url)) return;
    if (!url.startsWith(this.baseUrl)) return;
    
    this.visitedUrls.add(url);
    
    const startTime = Date.now();
    
    try {
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Fynd-AI-Crawler/1.0 (GEO Optimization Bot)'
        },
        maxContentLength: 10 * 1024 * 1024
      });

      const loadTime = Date.now() - startTime;
      const $ = cheerio.load(response.data);
      
      $('script, style, nav, footer, header, aside, .nav, .menu, .sidebar, .ad, .advertisement').remove();
      
      const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';
      const html = $.html();
      const content = $('body').text().trim();
      const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
      
      const page: CrawledPage = {
        url,
        title,
        content: content.substring(0, 50000),
        html,
        status: response.status,
        depth,
        loadTime,
        wordCount
      };
      
      this.pages.push(page);
      
      console.log(`[CrawlerAgent] Crawled: ${url} (${title.substring(0, 40)}) - ${wordCount} words`);
      
      if (this.visitedUrls.size >= this.maxPages) return;
      
      const links: string[] = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          try {
            const absoluteUrl = new URL(href, this.baseUrl).href;
            if (absoluteUrl.startsWith(this.baseUrl) && !this.visitedUrls.has(absoluteUrl)) {
              links.push(absoluteUrl);
            }
          } catch {}
        }
      });
      
      const uniqueLinks = [...new Set(links)].slice(0, 15);
      for (const link of uniqueLinks) {
        if (!this.crawlQueue.includes(link) && this.visitedUrls.size < this.maxPages) {
          this.crawlQueue.push(link);
        }
      }
      
    } catch (error: any) {
      console.log(`[CrawlerAgent] Failed to crawl ${url}: ${error.message}`);
    }
  }

  private async discoverSitemap(): Promise<void> {
    const sitemapUrls = [
      `${this.baseUrl}/sitemap.xml`,
      `${this.baseUrl}/sitemap_index.xml`,
      `${this.baseUrl}/sitemap-index.xml`
    ];
    
    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await axios.get(sitemapUrl, { timeout: 10000 });
        
        if (response.status === 200) {
          const $ = cheerio.load(response.data, { xmlMode: true });
          const urls: string[] = [];
          
          $('loc').each((_, el) => {
            const loc = $(el).text();
            if (loc && loc.startsWith(this.baseUrl)) {
              urls.push(loc);
            }
          });
          
          if (urls.length > 0) {
            console.log(`[CrawlerAgent] Found sitemap with ${urls.length} URLs`);
            
            for (const url of urls.slice(0, this.maxPages - this.visitedUrls.size)) {
              if (!this.visitedUrls.has(url) && !this.crawlQueue.includes(url)) {
                this.crawlQueue.push(url);
              }
            }
            break;
          }
        }
      } catch {}
    }
  }

  private extractDescription(): string {
    const firstPage = this.pages[0];
    if (!firstPage) return 'No description available';
    
    const content = firstPage.content;
    const lines = content.split('\n').filter(l => l.trim().length > 50);
    return lines[0]?.substring(0, 200) || 'No description available';
  }
}
