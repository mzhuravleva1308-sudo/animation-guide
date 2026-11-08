type BodyStyleSnapshot = {
  htmlOverflow: string;
  bodyOverflow: string;
  position: string;
  top: string;
  width: string;
  paddingRight: string;
};

function needsFixedScrollLock(): boolean {
  // Desktop with scrollbar-gutter: stable can lock via overflow only.
  // Touch / narrow viewports still need position:fixed to stop background scroll.
  return window.matchMedia("(hover: none), (max-width: 639px)").matches;
}

export function lockBodyScroll(scrollY = window.scrollY): () => void {
  const html = document.documentElement;
  const body = document.body;
  const snapshot: BodyStyleSnapshot = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
  };

  const useFixedLock = needsFixedScrollLock();

  html.style.overflow = "hidden";
  body.style.overflow = "hidden";

  if (useFixedLock) {
    // Do not add paddingRight: html already uses scrollbar-gutter: stable, so
    // compensating again shifts the page when the modal opens.
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
  }

  return () => {
    html.style.overflow = snapshot.htmlOverflow;
    body.style.overflow = snapshot.bodyOverflow;
    body.style.position = snapshot.position;
    body.style.top = snapshot.top;
    body.style.width = snapshot.width;
    body.style.paddingRight = snapshot.paddingRight;

    if (useFixedLock) {
      window.scrollTo(0, scrollY);
    }
  };
}
