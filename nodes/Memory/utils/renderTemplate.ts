import type { IDataObject } from 'n8n-workflow';
import type { CategorizedMemories, EpisodicMemoryItem } from './categorizeMemories';

export interface ProfileMemoryFacts extends IDataObject {
  facts?: Array<{
    subject: string;
    predicate: string;
    object: string;
    confidence?: number;
    source?: string;
  }>;
  entities?: Record<string, string>;
}

/**
 * Renders a markdown template by replacing placeholders with formatted memory sections
 * 
 * @param template - Template string with placeholders: {{history}}, {{shortTermMemory}}, {{longTermMemory}}, {{profileMemory}}
 * @param categorized - Categorized memory structure from categorizeMemories()
 * @param profileMemory - Profile memory facts from MemMachine API
 * @returns Rendered markdown string with placeholders replaced
 * 
 * @example
 * const template = "## History\n{{history}}\n\n## Profile\n{{profileMemory}}";
 * const context = renderTemplate(template, categorized, profileFacts);
 */
export function renderTemplate(
  template: string,
  categorized: CategorizedMemories,
  profileMemory: ProfileMemoryFacts,
): string {
  let rendered = template;

  // Replace each placeholder with formatted content
  rendered = rendered.replace(/\{\{history\}\}/g, formatAsMarkdownList(categorized.history));
  rendered = rendered.replace(/\{\{shortTermMemory\}\}/g, formatAsMarkdownList(categorized.shortTermMemory));
  rendered = rendered.replace(/\{\{longTermMemory\}\}/g, formatAsMarkdownList(categorized.longTermMemory));
  rendered = rendered.replace(/\{\{profileMemory\}\}/g, formatProfileMemory(profileMemory));

  return rendered;
}

/**
 * Formats an array of episodic memory items as a markdown bulleted list
 * 
 * @param items - Array of episodic memory items
 * @returns Markdown formatted string (bulleted list or empty message)
 * 
 * @example
 * formatAsMarkdownList([{ producer: "user_1", produced_for: "agent", episode_content: "Hello" }])
 * // Returns: "- **user_1** → agent: Hello"
 */
export function formatAsMarkdownList(items: EpisodicMemoryItem[]): string {
  if (items.length === 0) {
    return '*No memories in this category*';
  }

  return items
    .map((item) => {
      const content = item.episode_content || '';
      const producer = item.producer || 'unknown';
      const producedFor = item.produced_for || 'unknown';
      return `- **${producer}** → ${producedFor}: ${content}`;
    })
    .join('\n');
}

/**
 * Formats profile memory facts as markdown sections grouped by subject
 * 
 * @param profileMemory - Profile memory facts structure
 * @returns Markdown formatted string with subject headings and fact lists
 * 
 * @example
 * formatProfileMemory({ facts: [{ subject: "user_1", predicate: "Name", object: "Alice" }] })
 * // Returns: "### user_1\n- **Name**: Alice"
 */
export function formatProfileMemory(profileMemory: ProfileMemoryFacts): string {
  const facts = profileMemory.facts || [];

  if (facts.length === 0) {
    return '*No profile information available*';
  }

  // Group facts by subject
  const groupedBySubject: Record<string, Array<{ predicate: string; object: string }>> = {};
  
  for (const fact of facts) {
    if (!groupedBySubject[fact.subject]) {
      groupedBySubject[fact.subject] = [];
    }
    groupedBySubject[fact.subject].push({
      predicate: fact.predicate,
      object: fact.object,
    });
  }

  // Format each subject as a section
  const sections = Object.entries(groupedBySubject).map(([subject, subjectFacts]) => {
    const factLines = subjectFacts
      .map((fact) => `- **${fact.predicate}**: ${fact.object}`)
      .join('\n');
    return `### ${subject}\n${factLines}`;
  });

  return sections.join('\n\n');
}
