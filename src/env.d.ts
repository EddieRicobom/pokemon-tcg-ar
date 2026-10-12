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
