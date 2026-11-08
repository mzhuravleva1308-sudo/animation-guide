type BodyStyleSnapshot = {
  htmlOverflow: string;
  bodyOverflow: string;
  position: string;
  top: string;
  width: string;
  paddingRight: string;
};

function needsFixedScrollLock(): boolean {
  // Desktop can lock via overflow only. Touch / narrow viewports still need
  // position:fixed to stop background scroll on iOS.
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
  const widthBeforeLock = html.clientWidth;

  html.style.overflow = "hidden";
  body.style.overflow = "hidden";

  // If hiding overflow actually widens the layout (no effective scrollbar-gutter),
  // pad the body so cards/grid don't reflow. When gutter already reserves space,
  // clientWidth stays put and we add nothing.
  const layoutShift = html.clientWidth - widthBeforeLock;
  if (layoutShift > 0) {
    body.style.paddingRight = `${layoutShift}px`;
  }

  if (useFixedLock) {
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
