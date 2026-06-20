type BodyStyleSnapshot = {
  overflow: string;
  position: string;
  top: string;
  width: string;
  paddingRight: string;
};

export function lockBodyScroll(scrollY = window.scrollY): () => void {
  const body = document.body;
  const snapshot: BodyStyleSnapshot = {
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
  };

  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.width = "100%";

  return () => {
    body.style.overflow = snapshot.overflow;
    body.style.position = snapshot.position;
    body.style.top = snapshot.top;
    body.style.width = snapshot.width;
    body.style.paddingRight = snapshot.paddingRight;
    window.scrollTo(0, scrollY);
  };
}
