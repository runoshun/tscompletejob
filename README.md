This repository is no longer maintained.
============================

[![Build Status](https://travis-ci.org/runoshun/tscompletejob.svg?branch=master)](https://travis-ci.org/runoshun/tscompletejob)

tscompletejob-vim
============================
Typescript code complete plugin for Vim : [demo](#demo)

日本語版READMEは[こちら](README-jp.md)

Features
-----------------------------------------------------------------------
- Fast complete/behavior using wrapper of tsserver for Vim
- Supported features are Go to Definition, Quick Info, Signature Help,
  Show Compile Errors, Symbol Rename and Show References.
- Using job, channel features of vim
- Use jobcontrol features of Neovim

Limitations
-----------------------------------------------------------------------
- tscompletejob can't work in cygwin vim (due to file path differ between vim and tsserver). Please use windows native vim.

Requirements
-----------------------------------------------------------------------
- +job/+channel Vim or jobcontrol Neovim
- nodejs (4.x, 6.x)

Install
-----------------------------------------------------------------------
This plugin has no special install requirements, so you can install with
your favorite package manager.

### Setting of node command
Nodejs is required to execute tsserver wrapper. `node` is used by default.
If you need to change it, please set `g:tscompletejob_node_cmd`.
```vim
let g:tscompletejob_node_cmd = "/path/to/node"
```

Basic Functions and Usage
-----------------------------------------------------------------------
### Code Complete
`omnifunc=tscompletejob#complete` is set by default in filetype:`typescript`.
tscompletejob has no ftdetect, please use [typescript-vim](https://github.com/leafgarland/typescript-vim)
etc. or define ftdetect by yourself.


### Goto Definition
It jump to difinition of variable or type.
Move cursor to symbol which you want to find difinition, and execute `:TsCompleteJobGotoDefinition`. By default, the command is mapped to `C-]`.
And you can use simple tagstack like feature by setting `g:tscompletejob_enable_tagstack` to 1. If tagstack is enabled, tscompletejob record history of cursor position when executing `:TsCompleteJobGotoDefinition`, and you can follow history using `:TsCompleteJobGotoPrev` (mapped to `C-t`), `:TsCompleteJobGotoNext`.

### Quick info
It show symbol's quick infomation to command line.
Move cursor to symbol which you want to show info, and execute `:TsCompleteJobQuickInfo`. By default, it is mapped to `<LocalLeader>i`

### Call signature help
It show call signature infomations in popup menu using `complete()`. A bodies('word') of item in popup menu are empty, so no input on selection. If `completeopt` has `preview`, signature/parameter documentations are shown in preview window.
By default, signature help is shown at `CursorHold` event, If help exists at current cursor position.

### Show compile error
"tscompletejob" provides [syntastic](https://github.com/scrooloose/syntastic) checker named `tscompletejob`. If you use it, please add this checker to `g:syntastic_typescript_checkers`. For example,
```vim
let g:syntastic_typescript_checkers = ["tscompletejob"]
```

### Other features
 - Symbol rename `:TsCompleteJobRename`
 - Code formatting `:TsCompleteJobFormat`
 - Show Occurrences `:TsCompleteJobReferences`
 - Quick code fix `:TsCompleteJobCodeFix`
About default key mappings, see [help](doc/tscompletejob.txt).

### Debugging
`:TsCompleteJobStatus` show status of job. If you need restart job, you can use `TsCompleteJobRestart`.


Use another typescript version
-----------------------------------------------------------------------
The typescript version bundled this plugin is currently 2.7.1. If you want use another typescript version, please set `g:tscompletejob_custom_tsserver`.
```vim
let g:tscompletejob_custom_tsserver = "/path/to/tsserver.js"
```

Settings and Customization
-----------------------------------------------------------------------
See [help](doc/tscompletejob.txt).

Demo
-----------------------------------------------------------------------
- Code complete

![complete demo](https://github.com/runoshun/readme-images/blob/master/tscompletejob/complete.gif?raw=true)

- Goto Definition

![goto_definition demo](https://github.com/runoshun/readme-images/blob/master/tscompletejob/goto_definition.gif?raw=true)

- Call signature help

![signature_help demo](https://github.com/runoshun/readme-images/blob/master/tscompletejob/signature_help.gif?raw=true)

Running tests
-----------------------------------------------------------------------
1. Install [Vader](https://github.com/junegunn/vader.vim)
2. Execute `:Vader test/tscompletejob.vader`

