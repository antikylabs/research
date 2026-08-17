export function attachCanvasWheelZoom(
  canvas: HTMLCanvasElement,
  zoom: (deltaY: number) => void,
): () => void {
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    zoom(event.deltaY);
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  return () => canvas.removeEventListener('wheel', onWheel);
}
