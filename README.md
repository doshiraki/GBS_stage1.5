# 📚 Stage 1.5 (LibAppCore) Technical Reference

**Target:** AI Code Generation & Human Developer

## 1. Server-Side API (`LibAppCore.AppCore`)

Kernel (`Stage 2`) から呼び出すための厳密なインターフェース定義。

### 1.1 Constructor

```js
const appCore = new LibAppCore.AppCore(userAccessor);
```

- **引数:** `userAccessor` (`createTemplate(fileName)` メソッドを実装していること)
	- ※Stage2のファイル読み込み用。
### 1.2 `render(pageName, config)`

HTML出力（初回ブートストラップ）を行うメインメソッド。

- **pageName** `(String)`: アプリ起動後に読み込むメインHTMLのファイル名 (例: `'index'`)。
- **config** `(Object)`:
    - `appTitle` `(String)`: **必須**。ブラウザタブのタイトル。        
    - `version` `(String)`: **必須**。Cache Buster用のバージョン文字列。
    - `dependencies` `(Array<String>)`: 起動前に読み込むライブラリHTML名 (例: `['lib_utils']`)。
        
### 1.3 `run(e, globalThis)`

RPCリクエスト、およびリソース取得リクエストのハンドリング。

- **e** `(EventObject)`: `doGet` や `run` から渡されるイベントオブジェクト。    
- **globalThis** `(Object)`: `Logic.js` 等のグローバル関数を実行するためのスコープオブジェクト。
    

### 1.4 `fetchResource(fileName, compress, data)`

HTMLテンプレートを動的に評価して返す。

- **fileName** `(String)`: ファイル名。
- **compress** `(Boolean)`: `true`ならGzip+Base64化する。通常はクライアントからの要求に従う。 
- **data** `(Object)`: **重要**。テンプレート内の `<?= key ?>` に注入する変数オブジェクト。

### 1.5 `static getModeInfo(e)`

リクエストパラメータのパーサー。

- **戻り値:** 
	modeごとのフォーマット。
	- `{ mode: 'source', file: string, compress: boolean }`
	- `{ mode: 'func', cmd: string, args: [] }`
    
- **用途:** Kernel内でリクエスト内容を判定する際に使用。

---

## 2. Client-Side API (`Loader` & `google.script.run`)

`index.html` や `lib_xxx.html` 内で使用可能な機能。

### 2.1 RPC Call (Async/Await)

`lib_ClientCore` によりハイジャックされた `google.script.run`。

```js
// Server: function getData(id) { ... }
const result = await google.script.run.sync().getData(123);
```

- **注意:** `.sync()` を付けないと従来の `withSuccessHandler` スタイルになる。AI生成コードでは常に `.sync()` を推奨。

### 2.2 Manual Resource Loading

Web Workerや動的生成のために、生のコードを取得する場合に使用。

```js
// loaderはグローバル変数として存在
const rawCode = loader.getSource(await loader.load("lib_worker", false));
```

- `load(fileName, compress, inject)`
	- ライブラリ(html)名。中味は\<style>\</style>で囲われたjsソース。
    - `compress`: 圧縮してダウンロード・キャッシュするか否か。
			    ただし、解凍ツールがないと解凍できないのでlib_pako自体は解凍なし。
   
	- `inject`: `true` ならDOMに即時注入して実行。`false` なら文字列として返す。
        
- `getSource(code)`
	\<style>\</style>で囲われたjsソースから前後のstyleタグのみを消す。

---

## 3. Integration Patterns (Code Recipes)

### Pattern A: Standard Boot (基本形)


```js
run(e) {
  const appCore = new LibAppCore.AppCore(this);
  if (e.type === 'RPC') return appCore.run(e, globalThis);
  
  return appCore.render(this.CONST.PAGE_NAME, {
    appTitle: this.config.appTitle,
    version: this.CONST.VERSION,
    dependencies: this.CONST.DEPENDENCIES
  });
}
```

### Pattern B: Dynamic Injection (サーバーデータ注入)

初回ロード時などに、サーバーサイドの変数をHTMLに焼き込むパターン。

```js
run(e) {
  const appCore = new LibAppCore.AppCore(this);

  if (e.type === 'RPC') {
    // 1. リクエスト解析
    const p = LibAppCore.AppCore.getModeInfo(e);
    
    // 2. メインファイルの要求をフック
    if (p.mode === 'source' && p.file === this.CONST.PAGE_NAME) {
      const templateVars = {
        userStatus: getUserStatus(), // Server Logic
        sysConfig: getSysConfig()
      };
      // 3. データ注入付きでリソース返却
      return appCore.fetchResource(p.file, p.compress, templateVars);
    }
    return appCore.run(e, globalThis);
  }
  // ... render ...
}
```

---

## 4. Contract Constants (定数・規約)

- **DOM IDs:**
    
    - `#gbs-loader`: 起動時のスピナー画面。アプリ起動後に `display: none` になる 。
    - `#app-root`: アプリケーションの描画領域コンテナ 。
        
- **Cache Key:**

    - Prefix: `GBS_CACHE_` 。
        
- **Dependencies:**

    - Stage 2 の `appsscript.json` には必ず `LibAppCore` を追加すること 。
