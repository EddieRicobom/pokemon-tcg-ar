/// <reference types="vite/client" />

declare module 'mind-ar/src/image-target/controller.js' {
  export class Controller {
    constructor(options: Record<string, unknown>);
  }
}

declare module 'mind-ar/src/image-target/compiler.js' {
  export class Compiler {
    constructor();
  }
}

declare module 'mind-ar/src/image-target/detector/detector.js' {
  export class Detector {
    constructor(width: number, height: number, debugMode?: boolean);
  }
}
