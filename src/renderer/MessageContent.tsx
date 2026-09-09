import { readableResponse } from '../shared/readable-results';
import { A2UIView } from './A2UIView';
import { MarkdownContent } from './MarkdownContent';
import { useCallback } from 'react';

export function MessageContent({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const renderUI = useCallback((source: string) => <A2UIView source={source} streaming={streaming} />, [streaming]);
  const rawUI =
    /^[\s]*[\[{]/.test(content) &&
    /"(?:createSurface|surfaceUpdate|beginRendering)"\s*:/.test(content);
  if (rawUI) return <A2UIView source={content} streaming={streaming} />;
  return (
    <MarkdownContent
      content={readableResponse(content, streaming)}
      streaming={streaming}
      renderUI={renderUI}
    />
  );
}
