/**
 * 📦 AppCore (The Virtual OS Layer)
 * リソースの探索、圧縮、HTML生成を一元管理するミドルウェア。
 */
class AppCore_ {

  /**
   * 🏗️ Constructor
   * @param {Object} [userAccessor] - Stage 2 (User) のファイルを読み込むためのアクセサ
   * ※ 引数なしで呼ばれた場合は「システム領域(このライブラリ)」のみを探索対象とする
   */
  constructor(userAccessor) {
    // 1. システム領域 (このライブラリ自身) のアクセサ
    // lib_pako や lib_ClientCore はここから読み込まれる
    const systemAccessor = {
      id: 'System (Lib)',
      createTemplate: (f) => HtmlService.createTemplateFromFile(f)
    };

    // 2. 探索パスの構築
    this.searchPath = [systemAccessor];

    // ユーザーアクセサが渡された場合のみ、探索パスに追加 (Chain of Responsibility)
    if (userAccessor) {
      // インターフェースチェック (Duck Typing)
      if (typeof userAccessor.createTemplate !== 'function') {
        throw new Error('[AppCore] Init Failed: userAccessor must have "createTemplate" method.');
      }
      // ID付与して追加
      userAccessor.id = 'User (Stage2)';
      this.searchPath.push(userAccessor);
    }
  }

  /**
   * 📜 Fetch Resource (Unified Resolver)
   * System -> User の順でリソースを探し、圧縮(または生)で返す。
   * クライアント側(Loader)からの要求に応じて動作する。
   * * @param {string} fileName - ファイル名
   * @param {boolean} [compress=true] - 圧縮するかどうか
   * @return {string|null} - Base64文字列, 生テキスト, または null
   */
  fetchResource(fileName, compress = true) {
    let errs = [];
    // 登録されたパスを順番に探索
    for (const accessor of this.searchPath) {
      try {
        // テンプレート生成を試みる
        const tmpl = accessor.createTemplate(fileName);

        let content = tmpl.getRawContent();
        
        // 圧縮制御
        if (compress) {
          content =  AppCore_.getCompressedSource(content);
        }

        return content; // Raw String

      } catch (e) {
        errs.push('[' + accessor.id + ']' + e.message + '\n' + e.stack);
      }
    }
    
    // どこにもなければ null (呼び出し元で404ハンドリング)
    console.warn(`${fileName}`+errs.join('\n'));
    return null;
  }

  run(e, gt) {
    const p = (e && e.parameter) ? e.parameter : {};

    // ----------------------------------------------------
    // Mode A: リソース配信 (Loaderからの要求)
    // ----------------------------------------------------
    if (p.mode === 'source') {
      const compress = (p.args.compress !== 'false' && p.args.compress !== false);
      
      // AppCore経由で取得 (圧縮or生)
      const content = this.fetchResource(p.args.file, compress);
      
      return (e.type === 'RPC') ? content : ContentService.createTextOutput(content || '');
    }

    // ----------------------------------------------------
    // Mode C: ビジネスロジック実行 (Dispatcher)
    // ----------------------------------------------------
    // クライアント(GBS.run)からの関数実行要求
    // Logic.gs にあるグローバル関数を動的に実行する
    if (p.mode && typeof gt[p.mode] === 'function') {
      try {
        // 💡 ここを変更: applyを使って引数配列を展開して渡す
        // p.args が Proxy から送られてきた引数配列 [arg1, arg2, ...]
        const args = Array.isArray(p.args) ? p.args : [];
        const result = gt[p.mode].apply(gt, args);
        
        return result; 
      } catch (err) {
        console.error(`[MajinOS] RPC Error (${p.mode}):`, err);
        throw new Error(`RPC Error: ${err.message}`);
      }
    }
    return null;
  }

  /**
   * 🖥️ Render UI
   * AppCoreTemplate を使用してブートストラップHTMLを生成する。
   * * @param {string} pageName - 起動後に読み込むメインアプリのファイル名
   * @param {Object} config - 初期設定オブジェクト
   * @return {HtmlOutput}
   */
  render(pageName, config) {
    // テンプレートはライブラリ内の AppCoreTemplate.html を使用
    const template = HtmlService.createTemplateFromFile('AppCoreTemplate');
    
    // Config注入
    template.targetMain = pageName;
    template.version = config.version || 'v1.0';
    template.initialData = config.initialData || {};
    template.appTitle = config.appTitle || 'GBS App';
    
    // 依存関係の結合
    // ユーザー定義の依存ライブラリ (UPNG等) のみをセットする。
    // 重複排除してリスト化
    const userDependencies = config.dependencies || [];
    template.dependencyList = [...new Set(userDependencies)];

    return template.evaluate()
      .setTitle(template.appTitle)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  /**
   * 文字列を Gzip圧縮 -> Base64エンコード する
   * @param {string} raw - 生の文字列
   * @return {string} Base64文字列
   */
  static getCompressedSource(raw) {
    const blob = Utilities.newBlob(raw, 'text/plain');
    const gzip = Utilities.gzip(blob);
    return Utilities.base64Encode(gzip.getBytes());
  }
}
var AppCore = AppCore_;