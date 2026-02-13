declare module 'turndown' {
  interface TurndownOptions {
    headingStyle?: 'atx' | 'setext';
    codeBlockStyle?: 'fenced' | 'indented';
    bulletListMarker?: '-' | '*' | '+';
    emDelimiter?: '*' | '_';
    strongDelimiter?: '**' | '__';
    linkStyle?: 'inlined' | 'referenced';
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut';
  }

  class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(html: string): string;
    use(plugin: any): void;
    addRule(name: string, rule: any): void;
  }

  export = TurndownService;
}
