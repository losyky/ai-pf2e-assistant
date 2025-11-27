interface Game {
  settings: {
    get(module: string, key: string): unknown;
    register(module: string, key: string, data: any): void;
  };
  modules: {
    get(module: string): {
      api: any;
    };
  };
}

interface HooksStatic {
  once(event: string, callback: () => void): void;
  on(event: string, callback: (...args: any[]) => boolean | void): number;
}

interface UI {
  notifications: {
    info(message: string, options?: any): void;
    warn(message: string, options?: any): void;
    error(message: string, options?: any): void;
  };
}

declare global {
  var game: Game;
  var Hooks: HooksStatic;
  var ui: UI;
  var mergeObject: (original: any, other: any, options?: any) => any;
  
  class Application {
    constructor(options?: any);
    static get defaultOptions(): any;
    getData(): any;
    render(force?: boolean, options?: any): Application;
    close(options?: any): Promise<void>;
    activateListeners(html: JQuery): void;
    element: JQuery;
  }
  
  // jQuery 类型
  interface JQuery {
    val(): any;
    val(value: any): JQuery;
    text(): string;
    text(text: string): JQuery;
    prop(propertyName: string, value: any): JQuery;
    find(selector: string): JQuery;
    on(event: string, handler: (event: any) => void): JQuery;
  }
  var $: (selector: string | Element | JQuery) => JQuery;
} 