/// <reference types="vite/client" />

declare module "*.ttf?url" {
  const src: string;
  export default src;
}

declare const __APP_VERSION__: {
  version: string;
  buildId: string;
  builtAt: string;
};
