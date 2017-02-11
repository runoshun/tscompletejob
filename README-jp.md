[![Build Status](https://travis-ci.org/runoshun/tscompletejob.svg?branch=master)](https://travis-ci.org/runoshun/tscompletejob)

tscompletejob-vim
============================
typescript補完 Vimプラグイン : [デモ](#demo)

特徴
-----------------------------------------------------------------------
- tsserver Vim用ラッパーを利用した高速な補完/動作
- tsserverを利用した定義へのジャンプ、変数情報表示、シグネチャ情報、
  コンパイルエラー表示、リネーム、コードフォーマット、参照一覧表示に対応
- Vimのjob/channel機能を利用

制限
-----------------------------------------------------------------------
- cygwin版vimでは動作しません。(ファイルパスの扱いがtsserverと異なってしまうため)。windows nativeのvimを使ってください。

必要なもの
-----------------------------------------------------------------------
- +job/+channel付きのVim or jobcontrol NeoVim
- nodejs(4.x, 6.x)

インストール
-----------------------------------------------------------------------
dein/NeoBundle/VimPlugなど任意のパッケージマネージャでインストールしてください。

### nodeコマンドの設定
同梱のtsserverのラッパーを動作させるためにnodejsが必要です。デフォルトでは`node`を利用します。変更するには`g:tscompletejob_node_cmd`を設定して下さい。
``` vim
let g:tscompletejob_node_cmd = "/path/to/node"
```



基本的な機能・使い方
-----------------------------------------------------------------------
### 補完
Filetype`typescript`に対してデフォルトで`omnifunc=tscompletejob#complete`が設定されます。tscompletejobにはftdetectは含まれていませんので、[typescript-vim](https://github.com/leafgarland/typescript-vim)などを使うか、自分で定義してください。

### 定義へのジャンプ
変数、型などの定義位置にジャンプします。
ジャンプしたいシンボル上にカーソルを移動させ、`:TsCompleteJobGotoDefinition`を実行してください。デフォルトでは`C-]`にマップされます。

### 変数情報表示
変数の定義情報/型などをコマンドラインに表示します。
表示したいシンボル上にカーソルを移動させ、`:TsCompleteJobQuickInfo`を実行してください。デフォルトでは`<LocalLeader>i`にマップされます。

### シグネチャ情報表示
関数シグネチャ情報を`complete()`を利用したポップアップメニューに表示します。補完候補の実体(word)は空文字列のため、候補を選択しても入力はされません。`completeopt`に`preview`が含まれていれば、候補を選択することでシグネチャ/引数のドキュメントが表示されます。
デフォルトでは`CursorHoldI`イベント発行時、カーソル位置にシグネチャ情報の候補があれば表示されます。

### コンパイルエラー表示
[syntastic](https://github.com/scrooloose/syntastic)のチェッカー`tscompletejob`という名前でを提供しています。
利用する場合はチェッカーを`g:syntastic_typescript_checkers`に追加してください。
```vim
let g:syntastic_typescript_checkers = ["tscompletejob"]
```

### その他機能
 - シンボルのリネーム `:TsCompleteJobRename`
 - コードフォーマット `:TsCompleteJobFormat`
 - 参照一覧表示 `:TsCompleteJobReferences`
 - コードフィックス `:TsCompleteJobCodeFix`
デフォルトキーマップは[ヘルプ](doc/tscompletejob.jax)を参照してください


#### その他
`:TsCompleteJobStatus`でtsserverラッパーを実行しているjobのステータスを表示できます。jobを再起動する場合は`:TsCompleteJobRestart`を実行してください。


tsserverラッパーについて
-----------------------------------------------------------------------
プラグイン同梱のラッパーはtsserverlibrary.jsに依存しています。tsserverlibrary.jsはtypescript2.0以上に同梱されています。特定のバージョンのtsserverlibrary.jsを利用する場合は`g:tscompletejob_custom_tsserverlibrary`を設定してください。設定されない場合はプラグイン同梱のtsserverlibrary.jsが使用されます。
```vim
let g:tscompletejob_custom_tsserverlibrary = "/path/to/tsserverlibrary.js"
```

設定・カスタマイズ
-----------------------------------------------------------------------
[ヘルプ](doc/tscompletejob.jax)を参照してください

Demo
-----------------------------------------------------------------------
- 補完

![complete demo](https://github.com/runoshun/readme-images/blob/master/tscompletejob/complete.gif?raw=true)

- 定義へのジャンプ

![goto_definition demo](https://github.com/runoshun/readme-images/blob/master/tscompletejob/goto_definition.gif?raw=true)

- 関数シグネチャ表示

![signature_help demo](https://github.com/runoshun/readme-images/blob/master/tscompletejob/signature_help.gif?raw=true)

テストの実行
-----------------------------------------------------------------------
1. [Vader](https://github.com/junegunn/vader.vim)をインストール
2. `:Vader test/tscompletejob.vader`を実行

