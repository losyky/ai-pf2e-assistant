import { MODULE_ID, TERMINOLOGY_DATA_FILE, getModuleFilePath } from '../constants';
import { terminologyTranslator, TerminologyTranslator, TermMatch } from '../pf2e-terminology';

// Foundry VTT全局类型声明
declare global {
  interface Window {
    game: Game;
    $: JQueryStatic;
  }
  
  // Game接口定义
  interface Game {
    // 使用原始类型声明
    modules: {
      get(module: string): { api: any; };
    };
    settings: {
      get(module: string, key: string): unknown;
      register(module: string, key: string, data: any): void;
    };
  }
  
  interface FormApplicationOptions extends ApplicationOptions {
    closeOnSubmit?: boolean;
  }
  
  abstract class FormApplication extends Application {
    constructor(object?: any, options?: FormApplicationOptions);
    getData(options?: any): any;
    activateListeners(html: JQuery): void;
    close(): Promise<void>;
    element: JQuery;
  }
  
  interface ApplicationOptions {
    id?: string;
    title?: string;
    template?: string;
    width?: number;
    height?: number;
    classes?: string[];
    resizable?: boolean;
  }
  
  abstract class Application {
    constructor(options?: ApplicationOptions);
    static get defaultOptions(): ApplicationOptions;
  }
  
  function mergeObject(original: any, other: any): any;
  
  const ui: {
    notifications?: {
      info: (message: string) => void;
      warn: (message: string) => void;
      error: (message: string) => void;
    }
  };
  
  // 基本JQuery类型定义
  interface JQuery {
    find(selector: string): JQuery;
    on(event: string, handler: (event: any) => void): JQuery;
    val(): any;
    val(value: any): JQuery;
    html(content: string): JQuery;
    addClass(className: string): JQuery;
    removeClass(className: string): JQuery;
    empty(): JQuery;
    append(content: string | JQuery): JQuery;
    data(key: string): any;
    prop(name: string): any;
    prop(name: string, value: any): JQuery;
    length: number;
    hide(): JQuery;
    show(): JQuery;
    text(): string;
    text(content: string): JQuery;
    each(callback: (index: number, element: any) => void): JQuery;
    trigger(eventType: string): JQuery;
    [index: number]: HTMLElement;
  }
  
  interface JQueryStatic {
    (selector: string | any): JQuery;
  }
}

// 声明全局类型
type Dict<T> = Record<string, T>;

// 术语条目接口
interface TermEntry {
  original: string;
  translation: string;
  category: string;
  addedTime?: number; // 添加时间戳（毫秒）
}

// 已过滤术语列表
interface FilteredTerms {
  [category: string]: TermEntry[];
}

// 术语导入接口配置
interface TerminologyImporterOptions extends FormApplicationOptions {
  // 定义可选的回调函数，用于导入完成后执行
  importCallback?: (success: boolean) => void;
}

/**
 * PF2e术语导入器
 * 用于管理和导入术语对照表
 */
export class TerminologyImporter extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "ai-pf2e-terminology-importer",
      title: "PF2e术语词典管理工具",
      template: `modules/${MODULE_ID}/templates/terminology-importer.html`,
      width: 600,
      height: 650,
      classes: ["ai-pf2e-dialog"],
      resizable: true,
      closeOnSubmit: false
    });
  }
  
  // 保存所有术语数据
  private terminology: TermEntry[] = [];
  
  // 排序方式：'alpha' 为字母顺序，'time' 为添加时间
  private sortMode: 'alpha' | 'time' = 'alpha';
  
  // 术语时间戳映射（原文 -> 时间戳）
  private termTimestamps: Map<string, number> = new Map();
  
  // 存储键名
  private static readonly STORAGE_KEY = `${MODULE_ID}.terminology`;
  private static readonly TIMESTAMPS_KEY = `${MODULE_ID}.termTimestamps`;
  
  getData(options = {}): any {
    // 获取当前术语数据
    this.loadTerminology();
    
    const game = window.game;
    const autoCollect = game?.settings?.get('ai-pf2e-assistant', 'autoCollectTerminology') ?? true;
    
    return {
      terminology: this.terminology,
      termCount: this.terminology.length,
      sortMode: this.sortMode,
      autoCollect: autoCollect
    };
  }
  
  /**
   * 从Game.settings加载术语数据或初始化术语翻译器
   */
  private loadTerminology(): void {
    try {
      // 先尝试从exportToJson获取当前已加载的术语
      const jsonData = terminologyTranslator.exportToJson();
      const terms = JSON.parse(jsonData);
      
      // 如果当前术语表为空，则尝试从存储加载
      if (Object.keys(terms).length === 0) {
        this.loadTerminologyFromStorage();
      } else {
        // 更新列表
        this.updateTerminologyListFromData(terms);
      }
    } catch (error) {
      console.error(`${MODULE_ID} | 加载术语数据失败:`, error);
      // 如果失败，尝试从存储加载
      this.loadTerminologyFromStorage();
    }
  }
  
  /**
   * 从模块根目录加载术语数据
   */
  private async loadTerminologyFromStorage(): Promise<void> {
    try {
      console.log(`${MODULE_ID} | 开始从存储加载术语数据`);
      
      // 从模块根目录的JSON文件加载
      const response = await fetch(getModuleFilePath(TERMINOLOGY_DATA_FILE));
      
      // 如果文件不存在，使用空数据初始化
      if (!response.ok) {
        console.log(`${MODULE_ID} | 术语数据文件不存在，使用空数据初始化`);
        
        // 尝试从游戏设置加载（用于兼容旧版本）
        try {
          const savedTermsJson = window.game.settings.get(MODULE_ID, 'terminologyData') as string;
          if (savedTermsJson && savedTermsJson !== '{}') {
            console.log(`${MODULE_ID} | 从游戏设置中加载旧的术语数据`);
            const oldTerms = JSON.parse(savedTermsJson);
            
            // 加载旧数据
            terminologyTranslator.loadTerms(oldTerms, true);
            
            // 更新列表
            this.updateTerminologyListFromData(oldTerms);
            
            // 保存到文件系统以便今后使用
            await this.saveTerminologyToStorage();
            
            // 清除游戏设置中的数据
            (window.game.settings as any).set(MODULE_ID, 'terminologyData', '{}');
            
            return;
          }
        } catch (settingsError) {
          console.log(`${MODULE_ID} | 无法从游戏设置加载旧数据:`, settingsError);
        }
        
        // 如果没有旧数据，使用空数据
        terminologyTranslator.loadTerms({}, true);
        this.terminology = [];
        return;
      }
      
      const jsonData = await response.text();
      const savedTerms = JSON.parse(jsonData);
      
      // 加载到术语翻译器
      terminologyTranslator.loadTerms(savedTerms, true);
      
      // 更新本地列表
      this.updateTerminologyListFromData(savedTerms);
      
      console.log(`${MODULE_ID} | 从本地文件加载了${this.terminology.length}个术语`);
    } catch (error) {
      console.error(`${MODULE_ID} | 加载术语数据时出错:`, error);
    }
  }
  
  /**
   * 根据术语数据更新术语列表
   */
  private updateTerminologyListFromData(termsData: Record<string, Record<string, string>>): void {
    // 更新本地列表
    this.terminology = [];
    const currentTime = Date.now();
    
    // 尝试加载已保存的时间戳
    this.loadTimestamps();
    
    // 遍历所有术语分类和术语
    for (const category in termsData) {
      for (const [term, translation] of Object.entries(termsData[category])) {
        // 如果已有时间戳则使用，否则设为当前时间
        const addedTime = this.termTimestamps.get(term) || currentTime;
        
        // 如果没有时间戳记录，添加一个
        if (!this.termTimestamps.has(term)) {
          this.termTimestamps.set(term, currentTime);
        }
        
        this.terminology.push({
          original: term,
          translation: translation as string,
          category: category,
          addedTime: addedTime
        });
      }
    }
    
    // 根据当前排序模式排序
    this.sortTerminology();
  }
  
  /**
   * 根据当前排序模式对术语进行排序
   */
  private sortTerminology(): void {
    if (this.sortMode === 'alpha') {
      // 按字母顺序排序
      this.terminology.sort((a, b) => a.original.localeCompare(b.original));
    } else {
      // 按添加时间排序（最新的在前）
      this.terminology.sort((a, b) => {
        const timeA = a.addedTime || 0;
        const timeB = b.addedTime || 0;
        return timeB - timeA; // 降序，最新的在前
      });
    }
  }
  
  /**
   * 加载时间戳数据
   */
  private loadTimestamps(): void {
    try {
      const game = getGame();
      if (!game) return;
      
      const timestampsData = game.settings.get(MODULE_ID, 'termTimestamps');
      if (timestampsData && typeof timestampsData === 'object') {
        this.termTimestamps = new Map(Object.entries(timestampsData as Record<string, number>));
        console.log(`${MODULE_ID} | 加载了 ${this.termTimestamps.size} 个术语时间戳`);
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | 加载时间戳失败:`, error);
    }
  }
  
  /**
   * 保存时间戳数据
   */
  private async saveTimestamps(): Promise<void> {
    try {
      const game = getGame();
      if (!game) return;
      
      // 将 Map 转换为普通对象
      const timestampsObj: Record<string, number> = {};
      this.termTimestamps.forEach((time, term) => {
        timestampsObj[term] = time;
      });
      
      await game.settings.set(MODULE_ID, 'termTimestamps', timestampsObj);
      console.log(`${MODULE_ID} | 保存了 ${this.termTimestamps.size} 个术语时间戳`);
    } catch (error) {
      console.error(`${MODULE_ID} | 保存时间戳失败:`, error);
    }
  }
  
  /**
   * 保存术语数据到模块根目录
   */
  private async saveTerminologyToStorage(): Promise<void> {
    try {
      console.log(`${MODULE_ID} | 开始保存术语数据`);
      
      // 从术语对照表导出JSON数据
      const termsJson = terminologyTranslator.exportToJson();
      
      // 同时保存时间戳数据
      await this.saveTimestamps();
      
      // 保存到模块根目录
      try {
        // 使用FilePicker API保存文件
        // @ts-ignore - FilePicker类型
        const upload = await FilePicker.upload("data", `modules/${MODULE_ID}`, 
          new File([termsJson], TERMINOLOGY_DATA_FILE, { type: "application/json" }),
          {}, { notify: false }
        );
        
        console.log(`${MODULE_ID} | 术语数据已保存到本地文件:`, upload);
        ui.notifications?.info("术语数据已保存到模块目录");
      } catch (uploadError) {
        console.error(`${MODULE_ID} | 保存术语数据到文件时出错:`, uploadError);
        ui.notifications?.error("无法保存术语数据到文件: " + (uploadError instanceof Error ? uploadError.message : String(uploadError)));
      }
    } catch (error) {
      console.error(`${MODULE_ID} | 保存术语数据时出错:`, error);
      ui.notifications?.error("保存术语数据时出错");
    }
  }
  
  /**
   * 激活事件监听器
   */
  activateListeners(html: JQuery): void {
    super.activateListeners(html);
    
    // 自动收集术语复选框
    const game = window.game;
    const autoCollect = game?.settings?.get('ai-pf2e-assistant', 'autoCollectTerminology') ?? true;
    const checkbox = html.find('#autoCollectTerminology');
    checkbox.prop('checked', autoCollect);
    
    checkbox.on('change', async (event) => {
      const checked = (event.target as HTMLInputElement).checked;
      try {
        await game?.settings?.set('ai-pf2e-assistant', 'autoCollectTerminology', checked);
        if (ui && ui.notifications) {
          ui.notifications.info(`自动收集新术语已${checked ? '启用' : '关闭'}`);
        }
      } catch (error) {
        console.error('Failed to save autoCollectTerminology setting:', error);
      }
    });
    
    // 搜索框
    html.find('input[name="search-term"]').on('input', (event) => {
      const searchText = (event.target as HTMLInputElement).value.toLowerCase();
      this.filterTerminology(searchText);
    });
    
    // 文件选择事件
    html.find('input[name="csv-file"]').on('change', (event) => {
      const fileInput = event.target as HTMLInputElement;
      const importButton = html.find('.import-csv-file');
      const fileNameSpan = html.find('.file-name');
      
      if (fileInput.files && fileInput.files.length > 0) {
        const fileName = fileInput.files[0].name;
        fileNameSpan.text(fileName);
        importButton.prop('disabled', false);
      } else {
        fileNameSpan.text('未选择文件');
        importButton.prop('disabled', true);
      }
    });
    
    // CSV导入按钮
    html.find('.import-csv-file').on('click', () => this.importCsv(html));
    html.find('.import-csv').on('click', () => this.importCsv(html));
    
    // CSV导出按钮
    html.find('.export-csv').on('click', () => this.exportCsv());
    
    // 清空术语库按钮
    html.find('button[name="clear-terminology"]').on('click', () => {
      if (confirm('确定要清空所有术语数据吗？此操作无法撤销！')) {
        try {
          // 使用空对象加replace模式清空术语库
          terminologyTranslator.loadTerms({}, true);
          
          // 保存到本地存储
          this.saveTerminologyToStorage();
          
          // 刷新列表显示
          this.refreshTerminologyList();
          
          // 显示成功消息
          if (ui.notifications) ui.notifications.info('术语库已清空，所有术语数据已删除');
          
          console.log(`${MODULE_ID} | 用户已手动清空术语库`);
        } catch (error) {
          console.error(`${MODULE_ID} | 清空术语库失败:`, error);
          if (ui.notifications) ui.notifications.error(`清空术语库失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });
    
    // 排序切换按钮
    html.find('.toggle-sort').on('click', () => {
      // 切换排序模式
      this.sortMode = this.sortMode === 'alpha' ? 'time' : 'alpha';
      
      // 重新排序和渲染
      this.sortTerminology();
      this.renderTerminologyList();
      
      // 更新按钮图标
      const button = html.find('.toggle-sort');
      if (this.sortMode === 'alpha') {
        button.html('<i class="fas fa-sort-alpha-down"></i>');
        button.attr('title', '当前：字母排序 | 点击切换到时间排序');
      } else {
        button.html('<i class="fas fa-clock"></i>');
        button.attr('title', '当前：时间排序 | 点击切换到字母排序');
      }
      
      if (ui.notifications) {
        ui.notifications.info(this.sortMode === 'alpha' ? '已切换到字母排序' : '已切换到时间排序（最新在前）');
      }
    });
    
    // 关闭按钮
    html.find('button[name="close"]').on('click', () => this.close());
    
    // 编辑术语按钮（使用事件委托，因为按钮是动态生成的）
    html.on('click', '.edit-term', (event) => {
      event.preventDefault();
      const button = event.currentTarget as HTMLButtonElement;
      const original = button.dataset.original;
      const translation = button.dataset.translation;
      const category = button.dataset.category;
      if (original && translation) {
        this.handleTermEdit(original, translation, category || 'other');
      }
    });
    
    // 删除术语按钮（使用事件委托，因为按钮是动态生成的）
    html.on('click', '.delete-term', (event) => {
      event.preventDefault();
      const button = event.currentTarget as HTMLButtonElement;
      const original = button.dataset.original;
      if (original) {
        this.handleTermDelete(original);
      }
    });
    
    // 初始加载术语列表
    this.renderTerminologyList();
  }
  
  /**
   * 过滤术语表
   */
  private filterTerminology(searchText: string): void {
    if (!this.element) return;
    
    const rows = this.element.find('.terminology-list tr');
    
    if (searchText) {
      rows.each((index, row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const original = cells[0].textContent?.toLowerCase() || '';
          const translation = cells[1].textContent?.toLowerCase() || '';
          
          if (original.includes(searchText) || translation.includes(searchText)) {
            row.style.display = '';
          } else {
            row.style.display = 'none';
          }
        }
      });
    } else {
      rows.each((index, row) => {
        row.style.display = '';
      });
    }
  }
  
  /**
   * 渲染术语列表
   */
  private renderTerminologyList(): void {
    if (!this.element) return;
    
    console.log(`${MODULE_ID} | 开始渲染术语列表，共${this.terminology.length}个术语`);
    
    // 更新术语数量
    this.element.find('.term-count').text(this.terminology.length.toString());
    
    // 获取表格容器
    let tableContainer = this.element.find('.terminology-list-wrapper');
    
    // 清空表格容器
    tableContainer.empty();
    
    // 如果有术语数据，创建表格
    if (this.terminology.length > 0) {
      // 构建表格HTML
      const tableHtml = `
        <table class="terminology-table">
          <thead>
            <tr>
              <th>英文术语</th>
              <th>中文翻译</th>
              <th style="width: 100px; text-align: center;">操作</th>
            </tr>
          </thead>
          <tbody class="terminology-list">
            ${this.terminology.map(term => `
              <tr>
                <td>${term.original}</td>
                <td>${term.translation}</td>
                <td style="text-align: center;">
                  <button type="button" class="edit-term" data-original="${term.original}" data-translation="${term.translation}" data-category="${term.category || 'other'}" title="编辑此术语">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button type="button" class="delete-term" data-original="${term.original}" title="删除此术语">
                    <i class="fas fa-trash"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      
      // 渲染表格
      tableContainer.html(tableHtml);
    } else {
      // 显示空状态提示
      tableContainer.html(`
        <div class="empty-message">
          <h3><i class="fas fa-lightbulb"></i>术语列表为空</h3>
          <p>您的术语列表当前没有任何条目。您可以通过以下方式添加术语：</p>
          <ol>
            <li>点击下方的<strong>"<i class="fas fa-file-import"></i> 导入CSV"</strong>按钮上传已有术语表</li>
            <li>在术语管理器中手动添加新术语</li>
            <li>从其他兼容的模组加载术语</li>
          </ol>
          <p>CSV文件格式应为: <code>英文术语,中文翻译,类别(可选)</code></p>
          <div class="flexrow">
            <button type="button" class="import-csv"><i class="fas fa-file-import"></i> 导入CSV</button>
          </div>
        </div>
      `);
      
      // 重新绑定空状态下的导入按钮点击事件
      this.element.find('.import-csv').on('click', () => {
        // 触发文件选择框的点击
        this.element.find('input[name="csv-file"]').trigger('click');
      });
    }
    
    console.log(`${MODULE_ID} | 术语列表渲染完成`);
  }
  
  /**
   * 刷新术语列表
   */
  private refreshTerminologyList(): void {
    console.log(`${MODULE_ID} | 刷新术语列表`);
    // 重新加载术语数据
    this.loadTerminology();
    // 重新渲染列表
    this.renderTerminologyList();
  }
  
  /**
   * 导入CSV文件
   */
  private async importCsv(html: JQuery): Promise<void> {
    console.log(`${MODULE_ID} | 开始导入CSV文件...`);
    
    const fileInputEl = html.find('input[name="csv-file"]')[0] as HTMLInputElement;
    
    // 获取覆盖选项
    const replaceExisting = html.find('input[name="overwrite"]').prop('checked');
    console.log(`${MODULE_ID} | 覆盖现有术语: ${replaceExisting}`);
    
    // 获取编码选项
    const encodingOption = html.find('select[name="encoding"]').val() as string;
    console.log(`${MODULE_ID} | 选择的编码: ${encodingOption}`);
    
    if (!fileInputEl.files || fileInputEl.files.length === 0) {
      if (ui.notifications) ui.notifications.warn('请先选择CSV文件');
      return;
    }
    
    const file = fileInputEl.files[0];
    
    try {
      // 先以二进制方式读取文件
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      
      // 根据用户选择的编码或自动检测编码
      let encoding = 'UTF-8';
      if (encodingOption === 'auto') {
        encoding = this.detectEncoding(new Uint8Array(arrayBuffer));
        console.log(`${MODULE_ID} | 自动检测到文件编码: ${encoding}`);
      } else {
        encoding = encodingOption;
        console.log(`${MODULE_ID} | 使用用户指定的编码: ${encoding}`);
      }
      
      // 显示处理通知
      if (ui.notifications) ui.notifications.info(`正在以 ${encoding} 编码处理文件...`);
      
      // 将二进制内容转换为文本
      const csvContent = await this.decodeArrayBuffer(arrayBuffer, encoding);
      console.log(`${MODULE_ID} | 文件解码完成，内容长度: ${csvContent.length}字节`);
      
      // 解析CSV内容
      const importedTerms = this.parseCsv(csvContent);
      console.log(`${MODULE_ID} | 解析出${importedTerms.length}个术语条目`);
      
      if (importedTerms.length === 0) {
        if (ui.notifications) ui.notifications.warn('CSV文件中未找到有效的术语条目');
        return;
      }
      
      // 导入术语
      if (replaceExisting) {
        console.log(`${MODULE_ID} | 正在清空现有术语...`);
        // 先清空现有术语
        terminologyTranslator.loadTerms({}, true);
      }
      
      // 导入新术语
      console.log(`${MODULE_ID} | 开始导入${importedTerms.length}个术语条目...`);
      const count = terminologyTranslator.addEntries(importedTerms);
      console.log(`${MODULE_ID} | 成功导入${count}个术语条目`);
      
      // 保存到本地存储
      this.saveTerminologyToStorage();
      
      // 刷新列表
      this.refreshTerminologyList();
      
      // 显示导入结果
      if (ui.notifications) ui.notifications.info(`成功导入 ${count} 个术语条目`);
      
      // 重置文件输入
      fileInputEl.value = '';
      html.find('.file-name').text('未选择文件');
      html.find('.import-csv-file').prop('disabled', true);
      
    } catch (error) {
      console.error(`${MODULE_ID} | CSV导入错误:`, error);
      if (ui.notifications) ui.notifications.error(`CSV导入错误: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * 将文件读取为ArrayBuffer
   */
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
  
  /**
   * 检测文件编码
   * 简单的编码检测逻辑，支持UTF-8、GBK和BIG5
   */
  private detectEncoding(bytes: Uint8Array): string {
    // 检查UTF-8 BOM
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return 'UTF-8';
    }
    
    // 检查UTF-16 BOM (LE)
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return 'UTF-16LE';
    }
    
    // 检查UTF-16 BOM (BE)
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return 'UTF-16BE';
    }
    
    // 检查内容是否为UTF-8
    let isUtf8 = true;
    let gbkScore = 0;
    let big5Score = 0;
    let i = 0;
    
    while (i < bytes.length) {
      if (bytes[i] < 0x80) {
        // ASCII字符
        i++;
      } else if ((bytes[i] & 0xE0) === 0xC0) {
        // 2字节UTF-8序列
        if (i + 1 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80) {
          isUtf8 = false;
          break;
        }
        i += 2;
      } else if ((bytes[i] & 0xF0) === 0xE0) {
        // 3字节UTF-8序列
        if (i + 2 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80) {
          isUtf8 = false;
          break;
        }
        i += 3;
      } else if ((bytes[i] & 0xF8) === 0xF0) {
        // 4字节UTF-8序列
        if (i + 3 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80 || 
            (bytes[i + 2] & 0xC0) !== 0x80 || (bytes[i + 3] & 0xC0) !== 0x80) {
          isUtf8 = false;
          break;
        }
        i += 4;
      } else {
        isUtf8 = false;
        break;
      }
    }
    
    // 如果不是UTF-8，检查是否包含汉字（基本判断是否为中文编码）
    if (!isUtf8) {
      // 扫描GBK特征
      for (let i = 0; i < bytes.length - 1; i++) {
        // GBK编码范围
        if (bytes[i] >= 0x81 && bytes[i] <= 0xFE &&
            bytes[i + 1] >= 0x40 && bytes[i + 1] <= 0xFE) {
          gbkScore++;
        }
        
        // BIG5编码范围
        if ((bytes[i] >= 0xA1 && bytes[i] <= 0xF9) &&
            ((bytes[i + 1] >= 0x40 && bytes[i + 1] <= 0x7E) || 
             (bytes[i + 1] >= 0xA1 && bytes[i + 1] <= 0xFE))) {
          big5Score++;
        }
      }
      
      // 简单的编码得分比较
      if (gbkScore > 0 || big5Score > 0) {
        // 有中文特征
        if (gbkScore > big5Score) {
          console.log(`${MODULE_ID} | 检测到GBK编码特征 (得分: GBK=${gbkScore}, BIG5=${big5Score})`);
          return 'GBK';
        } else if (big5Score > gbkScore) {
          console.log(`${MODULE_ID} | 检测到BIG5编码特征 (得分: GBK=${gbkScore}, BIG5=${big5Score})`);
          return 'BIG5';
        } else {
          // 如果得分相同，默认使用GBK（简体中文情况下更常见）
          console.log(`${MODULE_ID} | GBK和BIG5得分相同，默认使用GBK`);
          return 'GBK';
        }
      }
    }
    
    // 默认返回UTF-8
    return 'UTF-8';
  }
  
  /**
   * 解码ArrayBuffer为字符串
   */
  private async decodeArrayBuffer(buffer: ArrayBuffer, encoding: string): Promise<string> {
    // 转换编码名称为标准格式
    encoding = encoding.toUpperCase();
    
    // 统一内部编码名称
    if (encoding === 'GB2312' || encoding === 'GBK' || encoding === 'GB18030') {
      encoding = 'GBK';
    } else if (encoding === 'BIG5-HKSCS' || encoding === 'BIG5') {
      encoding = 'BIG5';
    }
    
    console.log(`${MODULE_ID} | 使用${encoding}编码解码文件...`);
    
    try {
      // 尝试使用浏览器内置的TextDecoder
      try {
        // 对于UTF-8等标准编码，直接使用TextDecoder
        if (encoding === 'UTF-8' || encoding === 'UTF-16LE' || encoding === 'UTF-16BE') {
          const decoder = new TextDecoder(encoding.toLowerCase());
          return decoder.decode(buffer);
        }
        
        // 对于其他编码，尝试使用国际化API（如果浏览器支持）
        // @ts-ignore - 现代浏览器可能支持更多编码
        if (typeof TextDecoder !== 'undefined' && TextDecoder.prototype.constructor.name === 'TextDecoder') {
          try {
            // @ts-ignore
            const decoder = new TextDecoder(encoding);
            return decoder.decode(buffer);
          } catch (e) {
            console.log(`${MODULE_ID} | 浏览器不支持${encoding}编码，将使用内置解码方法`, e);
          }
        }
      } catch (e) {
        console.log(`${MODULE_ID} | TextDecoder错误，将使用备用方法:`, e);
      }
      
      // 备用方法：使用内置的解码函数
      if (encoding === 'GBK') {
        return this.decodeGBK(buffer);
      } else if (encoding === 'BIG5') {
        return this.decodeBIG5(buffer);
      } else {
        // 无法识别的编码，回退到UTF-8
        console.warn(`${MODULE_ID} | 未知编码 ${encoding}，回退到UTF-8`);
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(buffer);
      }
    } catch (error) {
      console.error(`${MODULE_ID} | 解码错误，回退到UTF-8:`, error);
      // 最后的回退方案：UTF-8
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(buffer);
    }
  }
  
  /**
   * 解码GBK编码
   * 这是一个基本的GBK解码函数，用于处理常见的中文字符
   */
  private decodeGBK(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let result = '';
    
    // GBK编码映射表（部分常用字符）
    // 实际应用中应该使用完整的映射表或专业库
    const gbkToUnicode: Record<number, string> = {
      // 常用标点
      0xA1A1: '　', 0xA1A2: '！', 0xA1A3: '＂', 0xA1A4: '＃',
      0xA1A5: '￥', 0xA1A6: '％', 0xA1A7: '＆', 0xA1A8: '＇',
      0xA1A9: '（', 0xA1AA: '）', 0xA1AB: '＊', 0xA1AC: '＋',
      0xA1AD: '，', 0xA1AE: '－', 0xA1AF: '．', 0xA1B0: '／',
      
      // 常用词汇（示例）
      0xB9FA: '国', 0xBBAF: '际', 0xC9CC: '商', 0xC6F3: '企',
      0xD2B5: '业', 0xB7A2: '发', 0xD5B9: '展', 0xBDCC: '教',
      0xD3FD: '育', 0xBFC6: '科', 0xBBC6: '技', 0xCEC4: '文',
      0xBBA1: '管', 0xC0ED: '理', 0xD3D0: '有', 0xCFDE: '限',
      0xB9AB: '公', 0xCBBE: '司', 0xD4B1: '员', 0xB9D2: '挂',
      0xC4A3: '模', 0xBFC9: '可', 0xCFB5: '系', 0xCCEC: '天',
      0xB5D8: '地', 0xCBC4: '纪', 0xC4EA: '年', 0xD4C2: '月',
      0xC8D5: '日', 0xCAB1: '时', 0xBCE4: '间', 0xBCD5: '胜',
      0xC0B4: '来', 0xB7BD: '方', 0xB3CC: '程', 0xC7F8: '区',
      0xB5C4: '的', 0xCAC7: '是', 0xB2BB: '不', 0xBECD: '就',
      
      // 常见PF2e术语（示例）
      0xBEAD: '经', 0xD1E9: '验', 0xBFDA: '口', 0xBEF0: '径',
      0xC8EB: '入', 0xB9E6: '规', 0xD4F2: '则', 0xB6D4: '对',
      0xB4CE: '次', 0xCAD6: '手', 0xB2E1: '册', 0xB7C5: '放',
      0xB4F3: '大', 0xD5BD: '战', 0xBBF7: '击', 0xC9CB: '伤',
      0xCAAE: '十', 0xD2DA: '亿', 0xBBC3: '角', 0xC9BD: '山',
    };
    
    let i = 0;
    while (i < bytes.length) {
      if (bytes[i] < 0x80) {
        // ASCII字符
        result += String.fromCharCode(bytes[i]);
        i++;
      } else {
        // 可能是GBK双字节字符
        if (i + 1 < bytes.length) {
          const charCode = (bytes[i] << 8) | bytes[i + 1];
          
          // 查找映射表
          if (charCode in gbkToUnicode) {
            result += gbkToUnicode[charCode];
          } else {
            // 对于没有映射的字符，使用问号替代
            result += '?';
          }
          i += 2;
        } else {
          // 单个字节在末尾，可能是损坏的数据
          result += '?';
          i++;
        }
      }
    }
    
    return result;
  }
  
  /**
   * 解码BIG5编码
   * 简化版，仅包含常见字符
   */
  private decodeBIG5(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let result = '';
    
    // BIG5编码映射表（简化版）
    // 实际使用时应该使用完整映射或专业库
    const big5ToUnicode: Record<number, string> = {
      // 简化示例，实际需要更完整的映射
      0xA140: '　', 0xA141: '！', 0xA142: '＂', 0xA143: '＃',
      0xA147: '＇', 0xA148: '（', 0xA149: '）', 0xA14A: '＊',
      0xA14B: '＋', 0xA14C: '，', 0xA14D: '－', 0xA14E: '．',
      0xA14F: '／', 0xA150: '０', 0xA151: '１', 0xA152: '２',
      
      // 常用繁体中文字符示例
      0xA4A1: '一', 0xA4A2: '乙', 0xA4A3: '丁', 0xA4A4: '七',
      0xA4A5: '乃', 0xA4A6: '九', 0xA4A7: '了', 0xA4A8: '二',
      0xA4A9: '人', 0xA4AA: '入', 0xA4AB: '八', 0xA4AC: '几',
      0xA4AD: '刀', 0xA4AE: '力', 0xA4AF: '十', 0xA4B0: '又',
      
      // 专业术语示例
      0xA4E5: '中', 0xA4E8: '互', 0xA4FD: '內', 0xA5A1: '冊',
      0xA672: '戰', 0xA6B3: '攻', 0xAAF7: '職', 0xADB0: '設'
    };
    
    let i = 0;
    while (i < bytes.length) {
      if (bytes[i] < 0x80) {
        // ASCII字符
        result += String.fromCharCode(bytes[i]);
        i++;
      } else {
        // 可能是BIG5双字节字符
        if (i + 1 < bytes.length) {
          const charCode = (bytes[i] << 8) | bytes[i + 1];
          
          // 查找映射表
          if (charCode in big5ToUnicode) {
            result += big5ToUnicode[charCode];
          } else {
            // 对于没有映射的字符，使用问号替代
            result += '?';
          }
          i += 2;
        } else {
          // 单个字节在末尾，可能是损坏的数据
          result += '?';
          i++;
        }
      }
    }
    
    return result;
  }
  
  /**
   * 解析CSV内容
   */
  private parseCsv(csvContent: string): Array<{original: string, translation: string}> {
    console.log(`${MODULE_ID} | 开始解析CSV内容...`);
    
    // 按行分割，过滤空行
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    console.log(`${MODULE_ID} | CSV文件包含${lines.length}行非空内容`);
    
    const terms: Array<{original: string, translation: string}> = [];
    
    // 记录无效行
    let invalidLines = 0;
    
    for (const line of lines) {
      // 忽略注释行
      if (line.trim().startsWith('#') || line.trim().startsWith('//')) {
        continue;
      }
      
      // 查找分隔符，支持逗号和制表符
      let parts: string[] = [];
      
      // 先尝试按逗号分割
      if (line.includes(',')) {
        parts = line.split(',').map(part => part.trim());
      } 
      // 再尝试按制表符分割
      else if (line.includes('\t')) {
        parts = line.split('\t').map(part => part.trim());
      } 
      // 最后尝试按分号分割（一些欧洲地区使用分号作为CSV分隔符）
      else if (line.includes(';')) {
        parts = line.split(';').map(part => part.trim());
      }
      // 如果没有明确的分隔符，尝试寻找第一个空白字符
      else {
        const match = line.match(/^(.+?)\s+(.+)$/);
        if (match) {
          parts = [match[1].trim(), match[2].trim()];
        }
      }
      
      // 确保至少有原文和翻译两个部分
      if (parts.length >= 2) {
        const original = parts[0].trim();
        const translation = parts[1].trim();
        
        // 排除空值
        if (original && translation) {
          terms.push({ original, translation });
        } else {
          invalidLines++;
        }
      } else {
        invalidLines++;
      }
    }
    
    console.log(`${MODULE_ID} | 成功解析${terms.length}个有效术语，忽略了${invalidLines}行无效内容`);
    
    return terms;
  }
  
  /**
   * 处理编辑术语
   * @param original 要编辑的英文术语
   * @param translation 当前的中文翻译
   * @param category 当前的类别
   */
  private async handleTermEdit(original: string, translation: string, category: string): Promise<void> {
    try {
      // 获取所有可用的类别
      const categories = [
        { value: 'character', label: '人物 (Character)' },
        { value: 'place', label: '地名 (Place)' },
        { value: 'monster', label: '怪物 (Monster)' },
        { value: 'deity', label: '神祇 (Deity)' },
        { value: 'organization', label: '组织 (Organization)' },
        { value: 'spell', label: '法术 (Spell)' },
        { value: 'skill', label: '技能 (Skill)' },
        { value: 'item', label: '物品 (Item)' },
        { value: 'other', label: '其他 (Other)' },
        { value: 'auto-collected', label: '自动收集 (Auto-collected)' }
      ];

      // 创建编辑对话框
      new Dialog({
        title: '编辑术语',
        content: `
          <form>
            <div class="form-group">
              <label>英文术语：</label>
              <input type="text" id="edit-original" value="${original}" style="width: 100%;" />
            </div>
            <div class="form-group">
              <label>中文翻译：</label>
              <input type="text" id="edit-translation" value="${translation}" style="width: 100%;" />
            </div>
            <div class="form-group">
              <label>类别：</label>
              <select id="edit-category" style="width: 100%;">
                ${categories.map(cat => 
                  `<option value="${cat.value}" ${cat.value === category ? 'selected' : ''}>${cat.label}</option>`
                ).join('')}
              </select>
            </div>
          </form>
        `,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: '保存',
            callback: async (html: JQuery) => {
              const newOriginal = (html.find('#edit-original').val() as string || '').trim();
              const newTranslation = (html.find('#edit-translation').val() as string || '').trim();
              const newCategory = html.find('#edit-category').val() as string || 'other';

              // 验证输入
              if (!newOriginal || !newTranslation) {
                if (ui.notifications) {
                  ui.notifications.error('英文术语和中文翻译不能为空');
                }
                return;
              }

              console.log(`${MODULE_ID} | 准备修改术语: ${original} -> ${newOriginal} (${newTranslation}) [${newCategory}]`);

              // 调用术语翻译器的修改方法
              const success = terminologyTranslator.updateEntry(original, newOriginal, newTranslation, newCategory);

              if (success) {
                // 保存到存储
                await this.saveTerminologyToStorage();

                // 刷新术语列表
                this.refreshTerminologyList();

                // 显示成功消息
                if (ui.notifications) {
                  ui.notifications.info(`术语 "${original}" 已更新为 "${newOriginal}"`);
                }

                console.log(`${MODULE_ID} | 成功修改术语`);
              } else {
                // 显示失败消息
                if (ui.notifications) {
                  ui.notifications.error('修改术语失败: 新术语已存在或原术语不存在');
                }
              }
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: '取消'
          }
        },
        default: 'save'
      }).render(true);
    } catch (error) {
      console.error(`${MODULE_ID} | 编辑术语时出错:`, error);
      if (ui.notifications) {
        ui.notifications.error(`编辑术语时出错: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  /**
   * 处理删除术语
   * @param original 要删除的英文术语
   */
  private async handleTermDelete(original: string): Promise<void> {
    try {
      // 显示确认对话框
      const confirmed = await Dialog.confirm({
        title: '确认删除术语',
        content: `<p>确定要删除术语 "<strong>${original}</strong>" 吗？</p><p>此操作无法撤销。</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false
      });

      if (!confirmed) {
        return;
      }

      console.log(`${MODULE_ID} | 准备删除术语: ${original}`);

      // 调用术语翻译器的删除方法
      const success = terminologyTranslator.removeEntry(original);

      if (success) {
        // 保存到存储
        await this.saveTerminologyToStorage();

        // 刷新术语列表
        this.refreshTerminologyList();

        // 显示成功消息
        if (ui.notifications) {
          ui.notifications.info(`术语 "${original}" 已删除`);
        }

        console.log(`${MODULE_ID} | 成功删除术语: ${original}`);
      } else {
        // 显示失败消息
        if (ui.notifications) {
          ui.notifications.error(`删除术语失败: 术语不存在`);
        }
      }
    } catch (error) {
      console.error(`${MODULE_ID} | 删除术语时出错:`, error);
      if (ui.notifications) {
        ui.notifications.error(`删除术语时出错: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  /**
   * 导出CSV文件
   */
  private exportCsv(): void {
    try {
      // 构建CSV内容
      let csvContent = '';
      
      for (const term of this.terminology) {
        csvContent += `${term.original},${term.translation}\n`;
      }
      
      // 创建Blob和下载链接
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      // 创建下载链接
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pf2e-terminology.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      if (ui.notifications) ui.notifications.info('术语数据已导出为CSV文件');
    } catch (error) {
      console.error(`${MODULE_ID} | 导出CSV错误:`, error);
      if (ui.notifications) ui.notifications.error(`导出CSV错误: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// 导出术语导入器
export const terminologyImporter = new TerminologyImporter({}); 