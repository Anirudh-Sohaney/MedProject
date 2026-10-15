/// <reference types="vite/client" />

declare module '*.onnx' {
  const src: string;
  export default src;
}
