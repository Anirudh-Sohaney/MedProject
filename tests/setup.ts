import '@testing-library/jest-dom';

// Stub URL object URLs for jsdom environment
if (typeof window !== 'undefined') {
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = () => 'blob:mock-url-' + Math.random().toString(36).substring(2);
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = () => {};
  }
}

// Stub Canvas 2D context in jsdom
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function (contextType: string) {
    if (contextType === '2d') {
      return {
        drawImage: () => {},
        fillRect: () => {},
        getImageData: () => ({
          data: new Uint8ClampedArray(400),
          width: 10,
          height: 10,
        }),
        putImageData: () => {},
        fillStyle: '#000000',
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.toDataURL = function () {
    return 'data:image/jpeg;base64,mockImageData';
  };
}
