import { marked } from 'marked';

export const MarkdownValidator = (text) => {
  try {
    const tokens = marked.lexer(text);

    return tokens.some((token) => {
      if (['heading', 'list', 'blockquote', 'code', 'table', 'hr'].includes(token.type)) {
        return true;
      }

      if (token.type === 'paragraph' && token.tokens) {
        const inlineTokens = token.tokens.map((t) => t.type);

        const isFullyMarkdown = inlineTokens.every((t) =>
          ['strong', 'em', 'codespan', 'link', 'text'].includes(t),
        );

        const hasMarkdownInline = inlineTokens.some((t) =>
          ['strong', 'em', 'codespan', 'link'].includes(t),
        );

        return isFullyMarkdown && hasMarkdownInline;
      }

      return false;
    });
  } catch (e) {
    throw new Error('Invalid markdown', { cause: { code: 400 } });
  }
};
