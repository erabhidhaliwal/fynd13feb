import { BaseAgent } from './base.js';
import { AgentConfig, AgentCapability, ExtractedContent, LinkMap, SitePage } from '../types/index.js';

const DEFAULT_CAPABILITIES: AgentCapability[] = [
  {
    name: 'mapLinks',
    description: 'Map internal and external links across the site',
    inputSchema: { extractedContent: 'array', baseUrl: 'string' },
    outputSchema: { linkMap: 'object' }
  },
  {
    name: 'analyzeStructure',
    description: 'Analyze site structure and hierarchy',
    inputSchema: { pages: 'array', baseUrl: 'string' },
    outputSchema: { structure: 'array' }
  },
  {
    name: 'findOrphanPages',
    description: 'Find pages with no incoming links',
    inputSchema: { linkMap: 'object', allPages: 'array' },
    outputSchema: { orphanPages: 'array' }
  }
];

export class LinkMappingAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      name: 'LinkMappingAgent',
      role: 'Link Mapper',
      description: 'Maps internal and external links to understand site structure',
      capabilities: DEFAULT_CAPABILITIES
    };
    super(config);
  }

  async process(input: any): Promise<LinkMap> {
    const { extractedContent, baseUrl } = input;
    
    console.log(`[LinkMappingAgent] Mapping links across ${extractedContent.length} pages`);

    const internalLinks = new Map<string, string[]>();
    const externalLinks = new Map<string, string[]>();
    const allInternalUrls = new Set<string>();
    const allExternalUrls = new Set<string>();
    const incomingLinks = new Map<string, Set<string>>();

    for (const content of extractedContent) {
      const pageUrl = content.pageUrl;
      
      for (const link of content.links) {
        if (link.isInternal) {
          allInternalUrls.add(link.href);
          
          if (!internalLinks.has(pageUrl)) {
            internalLinks.set(pageUrl, []);
          }
          internalLinks.get(pageUrl)!.push(link.href);
          
          if (!incomingLinks.has(link.href)) {
            incomingLinks.set(link.href, new Set());
          }
          incomingLinks.get(link.href)!.add(pageUrl);
        } else if (link.isExternal) {
          allExternalUrls.add(link.href);
          
          if (!externalLinks.has(pageUrl)) {
            externalLinks.set(pageUrl, []);
          }
          externalLinks.get(pageUrl)!.push(link.href);
        }
      }
    }

    const allPages = extractedContent.map(c => c.pageUrl);
    const orphanPages = this.findOrphanPages(allPages, incomingLinks);
    const brokenLinks = this.findBrokenLinks(internalLinks, allPages);
    const siteStructure = this.analyzeStructure(extractedContent, incomingLinks);

    const linkMap: LinkMap = {
      internalLinks,
      externalLinks,
      sitemaps: this.discoveredSitemaps,
      brokenLinks,
      orphanPages,
      siteStructure
    };

    console.log(`[LinkMappingAgent] Link mapping complete:`);
    console.log(`  - Internal links: ${allInternalUrls.size}`);
    console.log(`  - External links: ${allExternalUrls.size}`);
    console.log(`  - Orphan pages: ${orphanPages.length}`);
    console.log(`  - Broken links: ${brokenLinks.length}`);

    this.setContext('linkMap', linkMap);
    return linkMap;
  }

  private discoveredSitemaps: string[] = [];

  addSitemap(sitemapUrl: string): void {
    if (!this.discoveredSitemaps.includes(sitemapUrl)) {
      this.discoveredSitemaps.push(sitemapUrl);
    }
  }

  private findOrphanPages(allPages: string[], incomingLinks: Map<string, Set<string>>): string[] {
    const orphanPages: string[] = [];
    
    for (const page of allPages) {
      if (!incomingLinks.has(page) || incomingLinks.get(page)!.size === 0) {
        orphanPages.push(page);
      }
    }
    
    return orphanPages;
  }

  private findBrokenLinks(internalLinks: Map<string, string[]>, validPages: string[]): string[] {
    const brokenLinks: string[] = [];
    const validSet = new Set(validPages);
    
    for (const [, targets] of internalLinks) {
      for (const target of targets) {
        if (!validSet.has(target)) {
          brokenLinks.push(target);
        }
      }
    }
    
    return [...new Set(brokenLinks)];
  }

  private analyzeStructure(
    extractedContent: ExtractedContent[], 
    incomingLinks: Map<string, Set<string>>
  ): SitePage[] {
    const structure: SitePage[] = [];
    const urlToPage = new Map<string, ExtractedContent>();
    
    for (const content of extractedContent) {
      urlToPage.set(content.pageUrl, content);
    }

    const sortedPages = extractedContent.sort((a, b) => {
      const aDepth = a.pageUrl.split('/').length;
      const bDepth = b.pageUrl.split('/').length;
      return aDepth - bDepth;
    });

    for (const content of sortedPages) {
      const parentUrl = this.findParentPage(content.pageUrl, extractedContent);
      const children = this.findChildPages(content.pageUrl, extractedContent);
      const incoming = incomingLinks.get(content.pageUrl)?.size || 0;
      
      const depth = content.pageUrl.split('/').filter(p => p.length > 0).length - 1;
      
      structure.push({
        url: content.pageUrl,
        title: content.title,
        depth,
        parent: parentUrl,
        children
      });
    }

    return structure;
  }

  private findParentPage(url: string, pages: ExtractedContent[]): string | undefined {
    const urlParts = url.split('/').filter(p => p.length > 0);
    
    for (let i = urlParts.length - 2; i >= 0; i--) {
      const parentPath = urlParts.slice(0, i + 1).join('/');
      const parentUrl = new URL(url).origin + '/' + parentPath;
      
      for (const page of pages) {
        if (page.pageUrl.includes(parentPath) && page.pageUrl !== url) {
          return page.pageUrl;
        }
      }
    }
    
    return undefined;
  }

  private findChildPages(url: string, pages: ExtractedContent[]): string[] {
    const children: string[] = [];
    const urlBase = url.replace(/\/$/, '');
    
    for (const page of pages) {
      const pageBase = page.pageUrl.replace(/\/$/, '');
      if (pageBase.startsWith(urlBase + '/') && pageBase !== urlBase) {
        children.push(page.pageUrl);
      }
    }
    
    return children;
  }

  getSiteMetrics(): any {
    const linkMap = this.getContext('linkMap');
    if (!linkMap) return null;
    
    const totalInternal = Array.from(linkMap.internalLinks.values()).reduce((sum, arr) => sum + arr.length, 0);
    const totalExternal = Array.from(linkMap.externalLinks.values()).reduce((sum, arr) => sum + arr.length, 0);
    
    return {
      totalInternalLinks: totalInternal,
      totalExternalLinks: totalExternal,
      uniqueInternalUrls: linkMap.internalLinks.size,
      uniqueExternalUrls: linkMap.externalLinks.size,
      orphanPages: linkMap.orphanPages.length,
      brokenLinks: linkMap.brokenLinks.length,
      sitemaps: linkMap.sitemaps.length
    };
  }
}
