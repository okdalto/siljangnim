/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin that serves scene.html in web deployments (must differ from the app origin). */
  readonly VITE_SCENE_ORIGIN?: string;
}
