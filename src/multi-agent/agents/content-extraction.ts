import { BaseAgent } from './base.js';
import { AgentConfig, AgentCapability, CrawledPage, ExtractedContent, Heading, TableData, ImageInfo, LinkInfo, PageMetadata } from '../types/index.js';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*'
});

const DEFAULT_CAPABILITIES: AgentCapability[] = [
  {
    name: 'extractContent',
    description: 'Extract structured content from HTML pages',
    inputSchema: { pages: 'array' },
    outputSchema: { extractedContent: 'array' }
  },
  {
    name: 'convertToMarkdown',
    description: 'Convert HTML to clean Markdown',
    inputSchema: { html: 'string', url: 'string' },
    outputSchema: { markdown: 'string' }
  },
  {
    name: 'extractMetadata',
    description: 'Extract SEO and Open Graph metadata',
    inputSchema: { $: 'cheerio' },
    outputSchema: { metadata: 'object' }
  }
];

export class ContentExtractionAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      name: 'ContentExtractionAgent',
      role: 'Content Extractor',
      description: 'Extracts structured content from HTML and converts to clean Markdown',
      capabilities: DEFAULT_CAPABILITIES
    };
    super(config);
  }

  async process(input: any): Promise<ExtractedContent[]> {
    const { pages } = input;
    
    console.log(`[ContentExtractionAgent] Processing ${pages.length} pages`);

    const extractedContent: ExtractedContent[] = [];

    for (const page of pages) {
      try {
        const extracted = this.extractFromPage(page);
        extractedContent.push(extracted);
        
        if (extractedContent.length % 10 === 0) {
          console.log(`[ContentExtractionAgent] Processed ${extractedContent.length}/${pages.length} pages`);
        }
      } catch (error: any) {
        console.log(`[ContentExtractionAgent] Failed to extract: ${page.url} - ${error.message}`);
      }
    }

    console.log(`[ContentExtractionAgent] Extraction complete: ${extractedContent.length} pages processed`);
    
    this.setContext('extractedContent', extractedContent);
    return extractedContent;
  }

  private extractFromPage(page: CrawledPage): ExtractedContent {
    const $ = cheerio.load(page.html);
    
    $('script, style, nav, footer, header, aside, .nav, .menu, .sidebar, .ad, .advertisement, .cookie, .popup, .modal').remove();
    
    return {
      pageUrl: page.url,
      title: this.extractTitle($),
      headings: this.extractHeadings($),
      paragraphs: this.extractParagraphs($),
      lists: this.extractLists($),
      tables: this.extractTables($),
      images: this.extractImages($),
      codeBlocks: this.extractCodeBlocks($),
      links: this.extractLinks($, page.url),
      metadata: this.extractMetadata($)
    };
  }

  private extractTitle($: cheerio.CheerioAPI): string {
    return $('title').text().trim() || 
           $('h1').first().text().trim() || 
           $('meta[property="og:title"]').attr('content')?.trim() || 
           'Untitled';
  }

  private extractHeadings($: cheerio.CheerioAPI): Heading[] {
    const headings: Heading[] = [];
    let idCounter = 0;
    
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const tag = el.tagName.toLowerCase();
      const level = parseInt(tag.charAt(1));
      const text = $(el).text().trim();
      
      if (text.length > 0) {
        const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        
        headings.push({
          level,
          text,
          id: id || `heading-${idCounter++}`
        });
      }
    });
    
    return headings;
  }

  private extractParagraphs($: cheerio.CheerioAPI): string[] {
    const paragraphs: string[] = [];
    
    $('p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) {
        paragraphs.push(text);
      }
    });
    
    return paragraphs;
  }

  private extractLists($: cheerio.CheerioAPI): string[] {
    const lists: string[] = [];
    
    $('ul, ol').each((_, el) => {
      $(el).find('li').each((_, li) => {
        const text = $(li).text().trim();
        if (text.length > 0) {
          lists.push(text);
        }
      });
    });
    
    return lists;
  }

  private extractTables($: cheerio.CheerioAPI): TableData[] {
    const tables: TableData[] = [];
    
    $('table').each((_, table) => {
      const headers: string[] = [];
      const rows: string[][] = [];
      
      $(table).find('thead th, thead td').each((_, th) => {
        headers.push($(th).text().trim());
      });
      
      $(table).find('tbody tr').each((_, tr) => {
        const row: string[] = [];
        $(tr).find('td').each((_, td) => {
          row.push($(td).text().trim());
        });
        if (row.length > 0) {
          rows.push(row);
        }
      });
      
      if (headers.length > 0 || rows.length > 0) {
        tables.push({ headers, rows });
      }
    });
    
    return tables;
  }

  private extractImages($: cheerio.CheerioAPI): ImageInfo[] {
    const images: ImageInfo[] = [];
    
    $('img').each((_, el) => {
      const src = $(el).attr('src') || '';
      const alt = $(el).attr('alt') || '';
      const title = $(el).attr('title') || undefined;
      
      if (src && !src.startsWith('data:')) {
        images.push({ src, alt, title });
      }
    });
    
    return images;
  }

  private extractCodeBlocks($: cheerio.CheerioAPI): string[] {
    const codeBlocks: string[] = [];
    
    $('pre code, pre').each((_, el) => {
      const code = $(el).text().trim();
      if (code.length > 10) {
        codeBlocks.push(code);
      }
    });
    
    return codeBlocks;
  }

  private extractLinks($: cheerio.CheerioAPI, baseUrl: string): LinkInfo[] {
    const links: LinkInfo[] = [];
    let baseHostname = '';
    
    try {
      baseHostname = new URL(baseUrl).hostname;
    } catch {}
    
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      const title = $(el).attr('title') || undefined;
      
      if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:')) {
        try {
          const absoluteUrl = new URL(href, baseUrl).href;
          let isInternal = false;
          let isExternal = false;
          
          try {
            const linkHostname = new URL(absoluteUrl).hostname;
            isInternal = linkHostname === baseHostname;
            isExternal = !isInternal;
          } catch {}
          
          links.push({
            href: absoluteUrl,
            text,
            title,
            isInternal,
            isExternal
          });
        } catch {}
      }
    });
    
    return links;
  }

  private extractMetadata($: cheerio.CheerioAPI): PageMetadata {
    const getMeta = (selector: string): string | undefined => {
      return $(selector).attr('content') || undefined;
    };
    
    return {
      description: getMeta('meta[name="description"]') || getMeta('meta[property="og:description"]'),
      keywords: this.parseKeywords(getMeta('meta[name="keywords"]')),
      author: getMeta('meta[name="author"]'),
      canonical: getMeta('link[rel="canonical"]'),
      ogTitle: getMeta('meta[property="og:title"]'),
      ogDescription: getMeta('meta[property="og:description"]'),
      ogImage: getMeta('meta[property="og:image"]'),
      twitterCard: getMeta('meta[name="twitter:card"]'),
      robots: getMeta('meta[name="robots"]')
    };
  }

  private parseKeywords(keywords?: string): string[] | undefined {
    if (!keywords) return undefined;
    return keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
  }

  convertToMarkdown(html: string, url: string): string {
    let markdown = turndownService.turndown(html);
    
    markdown = this.cleanMarkdown(markdown);
    
    return markdown;
  }

  private cleanMarkdown(markdown: string): string {
    let cleaned = markdown;
    
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    cleaned = cleaned.replace(/\[([^\]]+)\]\s*\(undefined\)/g, '$1');
    
    cleaned = cleaned.replace(/!\[([^\]]*)\]\s*\(undefined\)/g, '');
    
    return cleaned;
  }
}
