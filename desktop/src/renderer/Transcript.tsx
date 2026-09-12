import { Button } from './ui';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function Transcript({ children, followRequest }: { children: ReactNode; followRequest: number }) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const lastScrollTop = useRef(0);
  const [showJump, setShowJump] = useState(false);
  function updateJump() {
    const element = viewport.current;
    if (!element) return;
    const gap = element.scrollHeight - element.scrollTop - element.clientHeight;
    // Keep manual scrolling separate from the prompt, with a buffer to avoid flicker.
    setShowJump(visible => !following.current && gap > (visible ? 64 : 120));
  }
  function pause() {
    following.current = false;
    updateJump();
  }
  function follow() {
    following.current = true;
    setShowJump(false);
    const element = viewport.current;
    if (element) { element.scrollTop = element.scrollHeight; lastScrollTop.current = element.scrollTop; }
  }
  // Every accepted send resumes following, even if the owner was reading older messages.
  useLayoutEffect(follow, [followRequest]);
  // Follow committed response text, not only changes in the thinking panel's size.
  useLayoutEffect(() => {
    if (following.current && viewport.current) {
      viewport.current.scrollTop = viewport.current.scrollHeight;
      lastScrollTop.current = viewport.current.scrollTop;
    }
    updateJump();
  });
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      if (following.current && viewport.current) {
        viewport.current.scrollTop = viewport.current.scrollHeight;
        lastScrollTop.current = viewport.current.scrollTop;
      }
      updateJump();
    });
    observer.observe(content.current!);
    observer.observe(viewport.current!);
    follow();
    return () => observer.disconnect();
  }, []);
  return (
    <div className="transcript-shell">
      <div
        className="transcript"
        ref={viewport}
        tabIndex={0}
        aria-label="Conversation"
        onPointerDown={event => { if (event.target === event.currentTarget) pause(); }}
        onPointerMove={event => { if (event.buttons === 1) pause(); }}
        onWheel={(event) => {
          if (event.deltaY < 0) pause();
        }}
        onTouchMove={pause}
        onKeyDown={(event) => {
          if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) pause();
        }}
        onScroll={() => {
          const element = viewport.current!;
          if (element.scrollTop < lastScrollTop.current && element.scrollHeight - element.scrollTop - element.clientHeight > 2) pause();
          lastScrollTop.current = element.scrollTop;
          if (
            !following.current &&
            element.scrollHeight - element.scrollTop - element.clientHeight <= 2
          )
            follow();
          updateJump();
        }}
      >
        <div className="transcript-content" ref={content}>{children}</div>
      </div>
      {showJump && (
        <Button variant="secondary" className="jump-latest secondary" onClick={follow}>
          Jump to latest ↓
        </Button>
      )}
    </div>
  );
}
