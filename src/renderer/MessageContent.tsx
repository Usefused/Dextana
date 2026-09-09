import { readableResponse } from '../shared/readable-results';
import { A2UIView } from './A2UIView';
import { MarkdownContent } from './MarkdownContent';
import { useCallback } from 'react';
import { QuestionReplyContext, type UIReply } from './A2UIQuestions';

export function MessageContent({
  content,
  streaming = false,
  reply,
}: {
  content: string;
  streaming?: boolean;
  reply?: UIReply;
}) {
  // Keep the Markdown block renderer stable across activity snapshot updates.
  // Reply availability travels through context so live form drafts are not remounted.
  const renderUI = useCallback((source: string) => <A2UIView source={source} streaming={streaming} />, [streaming]);
  const rawUI =
    /^[\s]*[\[{]/.test(content) &&
    /"(?:createSurface|surfaceUpdate|beginRendering)"\s*:/.test(content);
  if (rawUI) return <A2UIView source={content} streaming={streaming} reply={reply} />;
  return (
    <QuestionReplyContext.Provider value={reply}>
    <MarkdownContent
      content={readableResponse(content, streaming)}
      streaming={streaming}
      renderUI={renderUI}
    />
    </QuestionReplyContext.Provider>
  );
}
