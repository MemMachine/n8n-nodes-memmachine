"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTemplate = renderTemplate;
exports.formatAsMarkdownList = formatAsMarkdownList;
exports.formatProfileMemory = formatProfileMemory;
function renderTemplate(template, categorized, profileMemory) {
    let rendered = template;
    rendered = rendered.replace(/\{\{history\}\}/g, formatAsMarkdownList(categorized.history));
    rendered = rendered.replace(/\{\{shortTermMemory\}\}/g, formatAsMarkdownList(categorized.shortTermMemory));
    rendered = rendered.replace(/\{\{longTermMemory\}\}/g, formatAsMarkdownList(categorized.longTermMemory));
    rendered = rendered.replace(/\{\{profileMemory\}\}/g, formatProfileMemory(profileMemory));
    return rendered;
}
function formatAsMarkdownList(items) {
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
function formatProfileMemory(profileMemory) {
    const facts = profileMemory.facts || [];
    if (facts.length === 0) {
        return '*No profile information available*';
    }
    const groupedBySubject = {};
    for (const fact of facts) {
        if (!groupedBySubject[fact.subject]) {
            groupedBySubject[fact.subject] = [];
        }
        groupedBySubject[fact.subject].push({
            predicate: fact.predicate,
            object: fact.object,
        });
    }
    const sections = Object.entries(groupedBySubject).map(([subject, subjectFacts]) => {
        const factLines = subjectFacts
            .map((fact) => `- **${fact.predicate}**: ${fact.object}`)
            .join('\n');
        return `### ${subject}\n${factLines}`;
    });
    return sections.join('\n\n');
}
//# sourceMappingURL=renderTemplate.js.map