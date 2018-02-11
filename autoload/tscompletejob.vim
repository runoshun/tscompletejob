let s:save_cpo = &cpo
set cpo&vim

" {{{ script local utils : reload
let s:script_dir = expand("<sfile>:p:h")

func! s:ensureReload(file) abort
    if (!s:bufmgr.isOpened(a:file))
        call tscompletejob#send_command("open", 0, { "file": a:file })
        call s:bufmgr.isOpened(a:file, 1)
    endif
    let l:tmp = s:bufmgr.flushTmpFile(a:file)
    call tscompletejob#send_command("reload", 0, {
                \ "file": a:file,
                \ "tmpfile": l:tmp,
                \ })
endfunc

func! s:reloadAll() abort
    for buf in s:bufmgr.getFileNames()
        call s:ensureReload(buf)
    endfor
endfunc
" }}}

" {{{ script local utils : message
func! s:warn(msg) abort
    call tscompletejob#utils#echo_warn(a:msg)
endfunc
" }}}

" {{{ script local utils : sendCommand
func! s:sendFileLocationCommand(command, handler, ...) abort
    if (a:0 == 0)
        let base = { }
    else
        let base = a:1
    endif

    let base.file = expand("%:p")
    let base.line = line('.')
    let base.offset = col('.')

    call s:ensureReload(base.file)
    let id = tscompletejob#send_command(a:command, a:handler, base)
    return id
endfunc
" }}}

" {{{ script local utils : batch edit
func! s:addEditBatch(batches, line, colStart, colEnd, replace) abort
    if has_key(a:batches, a:line)
        let batch = a:batches[a:line]
    else
        let batch = []
    endif
    call add(batch, { "start": a:colStart, "end": a:colEnd, "replace": a:replace })
    let a:batches[a:line] = batch
endfunc

func! s:compareByStart(e1, e2) abort
    return a:e1.start - a:e2.start
endfunc

func! s:applyEditBatches(batches) abort
    let lines = {}
    for line in sort(keys(a:batches), "N")
        let lineStr = getline(line)
        let lines[line] = []

        let lineParts = []
        let offset = 0
        for edit in sort(a:batches[line], function("s:compareByStart"))
            if edit.start > 1
                call add(lineParts, lineStr[offset:edit.start-2])
            endif

            if edit.replace == "" || edit.replace == nr2char(10)
                call add(lines[line], join(lineParts, ""))
                let lineParts = []
            elseif edit.replace =~# "" || edit.replace =~# nr2char(10)
                for replace in split(edit.replace, "\r\\?\n", 1)
                    call add(lineParts, replace)
                    call add(lines[line], join(lineParts, ""))
                    let lineParts = []
                endfor
            else
                call add(lineParts, edit.replace)
            endif

            let offset = edit.end - 1
        endfor
        call add(lineParts, lineStr[offset:])
        call add(lines[line], join(lineParts, ""))
    endfor

    let lineAdded = 0
    for line in sort(keys(lines), "N")
        let lnum = line + lineAdded
        call setline(lnum, lines[line][0])
        if (len(lines[line]) > 1)
            call append(lnum, lines[line][1:])
        endif
        let lineAdded += len(lines[line]) - 1
    endfor
endfunc

" }}}


" {{{ tss_command
func! tscompletejob#tss_command() abort
    let commands = []

    call add(commands, g:tscompletejob_node_cmd)

    if (has('win32') || has('win64'))
        call add(commands, escape(s:script_dir . "\\tscompletejob\\tsswrapper\\index.js", "\\"))
    else
        call add(commands, s:script_dir . "/tscompletejob/tsswrapper/index.js")
    endif

    if (exists("g:tscompletejob_custom_tsserverlibrary"))
        if (!exists("g:tscompletejob_use_legacy"))
            echoerr "'g:tscompletejob_custom_tsserverlibrary' is deprecated, if you want use typescript 2.3 or higher, " .
                        \ "use 'g:tscompletejob_custom_tsserver' instead. Or, you want use typescript 2.0 - 2.2, " .
                        \ "set 'g:tscompletejob_use_legacy' to 1."
        endif
        call add(commands, "--useLegacy")
        call add(commands, g:tscompletejob_custom_tsserverlibrary)
    elseif (exists("g:tscompletejob_custom_tsserver"))
        call add(commands, g:tscompletejob_custom_tsserver)
    endif

    return commands
endfunc
" }}}

" {{{ common controls
func! s:init_client() abort
    if (exists("s:tsclient"))
        return
    endif
    let s:tsclient = tscompletejob#tsclient#create(tscompletejob#tss_command())
    let s:bufmgr = tscompletejob#bufmanager#create()
    let s:tagmgr = tscompletejob#tagmanager#create()
endfunc

func! tscompletejob#status() abort
    let st = s:tsclient.status()
    return st
endfunc

func! tscompletejob#restart() abort
    if (exists("s:tsclient"))
        call s:tsclient.ensureStop()
        unlet s:tsclient
        unlet s:bufmgr
    endif
    call s:init_client()
endfunc

func! tscompletejob#send_command(command, handler, arguments) abort
    call tscompletejob#utils#log("send: command = " . a:command .
                                    \", handler = " . string(a:handler) .
                                    \", args =" . string(a:arguments))
    return s:tsclient.sendCommand(a:command, a:handler, a:arguments)
endfunc

func! tscompletejob#wait_response(id, ...) abort
    if a:0 == 0
        let do_complete_check = 0
    else
        let do_complete_check = a:1
    endif
    let res = s:tsclient.waitResponse(a:id, do_complete_check)
    call tscompletejob#utils#log("recv: " . string(res))
    return res
endfunc

func! tscompletejob#add_buffer(bufname)
    let key = s:bufmgr.addBuffer(a:bufname)
    if (g:tscompletejob_load_on_buf_open && key >= 0)
        call s:ensureReload(s:bufmgr.getFileName(key))
    endif
endfunc
" }}}


" {{{ complete
func! tscompletejob#complete(findstart, base) abort
    return tscompletejob#complete_with_handler(a:findstart, a:base, 1) " response handled by waitResponse()
endfunc

func! tscompletejob#complete_with_handler(findstart, base, handler) abort
    let l:line_str = getline('.')
    let l:line = line('.')
    let l:offset = col('.')

    if a:findstart
        if a:base != "" " for asynccomplete
            let l:line_str = a:base
            let l:offset = len(a:base) + 1
        endif

        let l:start = l:offset
        while l:start > 0 && l:line_str[l:start-2] =~ "\\k"
            let l:start -= 1
        endwhile
        return l:start
    else
        let l:file = expand("%:p")
        call s:ensureReload(l:file)

        let completions_id = tscompletejob#send_command("completionsForVim", a:handler, {
                    \ "enableDetail" : !g:tscompletejob_complete_disable_detail,
                    \ "maxDetailCount": g:tscompletejob_complete_max_detail_count,
                    \ "file" : l:file,
                    \ "prefix": a:base,
                    \ "line": l:line,
                    \ "offset": l:offset })

        if !s:tsclient.requestHasCallback(completions_id)
            try
                let completions = tscompletejob#wait_response(completions_id, 1)
                return completions
            catch
                call tscompletejob#utils#log("complete error: " . v:exception)
                return []
            endtry
        else
            return []
        endif

    endif
endfunc
" }}}

" {{{ goto_difinition
func! tscompletejob#goto_definition() abort
    let id = s:sendFileLocationCommand("definition", function("s:goto_definition_callback"))
    echo "tscompletejob: locating ..."
    return id
endfunc

func! s:goto_definition_callback(request_id, success, response)
    echo ""
    if !a:success
        return
    endif

    try
        let locales = a:response
        if (len(locales) > 0)
            if g:tscompletejob_enable_tagstack
                call s:tagmgr.pushTagWithCurrentPos()
            endif

            let locale = locales[0]
            let file = expand("%:p")
            if (!tscompletejob#utils#is_same_file(locale.file, file))
                exec "e " . locale.file
            endif
            call cursor(locale.start.line, locale.start.offset)

            if g:tscompletejob_enable_tagstack
                call s:tagmgr.pushTagWithCurrentPos()
            endif
        endif
    catch
        echoerr v:exception
    endtry
endfunc

" simple implementation of tagstack
" TODO: more user friendly error/messages
func! tscompletejob#goto_prev()
    if g:tscompletejob_enable_tagstack
        call s:tagmgr.followTags(-1)
    endif
endfunc

func! tscompletejob#goto_next()
    if g:tscompletejob_enable_tagstack
        call s:tagmgr.followTags(1)
    endif
endfunc

func! tscompletejob#goto_index(idx)
    if g:tscompletejob_enable_tagstack
        call s:tagmgr.setCurrentIndex(a:idx)
    endif
endfunc

func! tscompletejob#tags()
    if !g:tscompletejob_enable_tagstack
        echo "tagstack disabled. to use tagstack, do 'let g:tscompletejob_enable_tagstack = 1'"
    else
        echo "current: " . s:tagmgr.getCurrentIndex()
        for tag in s:tagmgr.getTags()
            echo tag.filename . ", line: " . tag.line . ", col: " tag.col
        endfor
    endif
endfunc
" }}}

" {{{ quickinfo
func! tscompletejob#quickinfo() abort
    return s:sendFileLocationCommand("quickinfo", function("s:quickinfo_callback"))
endfunc

func! s:quickinfo_callback(request_id, success, response)
    if !a:success
        return
    endif
    echo a:response.displayString
    return a:response.displayString
endfunc
" }}}

" {{{ signature_help
let s:signature_help_cache = [0, "x", "x", []]
func! tscompletejob#get_signature_help()
    let prevLnum = s:signature_help_cache[0]
    let curLnum = line(".")

    if (curLnum == prevLnum)
        let curLine = getline(".")
        let curCol = col(".")
        let headCp = substitute(curLine[:(curCol - 2)], "[^,()]", "", "g")
        let tailCp = substitute(curLine[(curCol - 2):], "[^,()]", "", "g")

        call tscompletejob#utils#log("signature_help: headCp = " . headCp . ", tailCp = " . tailCp)

        if headCp == s:signature_help_cache[1] && headCp != ""
        \  && tailCp == s:signature_help_cache[2] && tailCp != ""
            call tscompletejob#utils#log("signature_help using cache")
            return s:signature_help_cache[3]
        else
            let s:signature_help_cache[1] = headCp
            let s:signature_help_cache[2] = tailCp
        endif
    endif

    let headCp = exists("headCp") ? headCp : "x"
    let tailCp = exists("tailCp") ? tailCp : "x"

    try
        let id = s:sendFileLocationCommand("signatureHelpForVim", 1, {
                    \ "disableDocumentation" : g:tscompletejob_signature_help_disable_docs ? v:true : v:false })
        let res = tscompletejob#wait_response(id)
        let s:signature_help_cache = [curLnum, headCp, tailCp, res]
        return res
    catch
        echom v:exception
        " no warning because signature help will called
        " out of function calls.
    endtry
endfunc

func! tscompletejob#signature_help() abort
    let help = tscompletejob#get_signature_help()
    if (type(help) == type([]) && len(help) > 0)
        let saved_cot = &cot
        setlocal cot+=noselect
        call complete(col("."), help)
        let &cot = saved_cot
        unlet saved_cot
        return 1
    else
        call tscompletejob#signature_help_end()
        call complete(col("."), [])
        return 0
    endif
endfunc

func! tscompletejob#signature_help_start() abort
    augroup tscompletejob_signaturehelp
        autocmd!
        autocmd CursorMovedI <buffer> call tscompletejob#signature_help()
        autocmd InsertLeave <buffer> call tscompletejob#signature_help_end()
    augroup END
endfunc

func! tscompletejob#signature_help_end() abort
    augroup tscompletejob_signaturehelp
        autocmd!
    augroup END
endfunc
" }}}

" {{{ get_qfixlist
func! tscompletejob#get_qfixlist() abort
    let file = expand("%:p")
    call s:ensureReload(file)
    let id = tscompletejob#send_command("qfixlistForVim", 1, {
                \ "file": file })
    let qfixlist = tscompletejob#wait_response(id)

    for item in qfixlist
        let item.filename = file
        let item.bufnr = bufnr(file)
    endfor
    return qfixlist
endfunc
" }}}

" {{{ rename
let s:renameGroups = []
func! tscompletejob#rename(findInComment, findInString, ...) abort
    call s:ensureReload(expand("%:p"))
    call s:reloadAll()

    if (a:0 > 0)
        let renamedSymbol = a:1
    endif

    let id = s:sendFileLocationCommand("rename", 1, {
                \ "findInComment": a:findInComment ? v:true : v:false,
                \ "findInString": a:findInString ? v:true : v:false })
    let res = tscompletejob#wait_response(id)
    if res.info.canRename

        if (!exists("renamedSymbol"))
            let prompt = "(" . res.info.kind . ") " . res.info.displayName . " rename to: "
            let renamedSymbol = input(prompt, res.info.displayName)
        endif

        if (renamedSymbol == "")
            call s:warn("rename canceled")
            return
        endif

        let s:renameGroups = res.locs
        for i in range(len(s:renameGroups))
            let file = res.locs[i].file
            let cmd = " +call\\ s:renameInBuffer(".join([i, '"'.renamedSymbol.'"'],",").") "
            let open = tscompletejob#utils#is_buf_exists(file) ? ":buffer" : ":edit"
            exec open . cmd . file
            call s:ensureReload(file)
        endfor
        let s:renameGroups = []
    else
        call s:warn(res.info.localizedErrorMessage)
        return
    endif
endfunc

func! s:renameInBuffer(index, renamedSymbol) abort
    let group = s:renameGroups[a:index]
    let batches = {}
    for loc in group.locs
        if (loc.start.line != loc.end.line)
            throw "multiline rename is not supported."
        endif
        call s:addEditBatch(batches, loc.start.line, loc.start.offset, loc.end.offset, a:renamedSymbol)
    endfor
    call s:applyEditBatches(batches)
endfunc
" }}}

" {{{ format
func! tscompletejob#format() range abort
    call s:formatImpl(a:firstline, a:lastline)
endfunc

func! s:formatImpl(start, end) abort
    call s:configureFormatOptions()

    let file = expand("%:p")
    call s:ensureReload(file)
    let id = tscompletejob#send_command("format", 1, {
                \ "file" : file,
                \ "line" : a:start,
                \ "offset" : 1,
                \ "endLine" : a:end + 1,
                \ "endOffset" : 1
                \ })
    let res = tscompletejob#wait_response(id)
    let batches = {}
    for edit in res
        if (edit.start.line != edit.end.line)
            throw "multiline replace is not supported."
        endif
        call s:addEditBatch(batches, edit.start.line, edit.start.offset, edit.end.offset, edit.newText)
    endfor
    call s:applyEditBatches(batches)
endfunc

func! s:configureFormatOptions()
    let id = tscompletejob#send_command("configure", 1, {
                \ "formatOptions" : g:tscompletejob_format_options
                \})
    call tscompletejob#wait_response(id)
endfunc
" }}}

" {{{ references
func! tscompletejob#references() abort
    call s:reloadAll()
    let id = s:sendFileLocationCommand("referencesForVim", function("s:reference_callback"))
    echo "tscompletejob: search references ..."
    return id
endfunc

func! s:reference_callback(request_id, success, response)
    echo ""
    if !a:success
        return
    endif

    lexpr []
    if (len(a:response) > 0)
        laddexpr a:response
        lopen
        nmap <silent> <buffer> q :lclose<CR>
    endif
endfunc
" }}}

"{{{ codefix
func! tscompletejob#codefix(...) abort
    if a:0 > 0 " for testing
        let force = a:1
    else
        let force = 0
    endif

    call s:ensureReload(expand("%:p"))
    call s:reloadAll()
    let id = tscompletejob#send_command("codeFixAtPositionForVim", 1, {
                \ "startLine": line("."),
                \ "startOffset": col("."),
                \ "file": expand("%:p"),
                \ })
    let res = tscompletejob#wait_response(id)

    if force
        let fix = res[0]
    else
        let fix = s:confirmFix(res)
        if fix == {}
            return
        endif
    endif

    let starts = []
    let ends = []
    for change in fix.changes
        let file = change.fileName
        let batches = { }
        for tc in change.textChanges
            call s:addEditBatch(batches, tc.start.line, tc.start.offset, tc.end.offset, tc.newText)
            call add(starts, tc.start.line)
            call add(ends, tc.end.line + count(split(tc.newText, "\\zs"), "\n"))
        endfor

        let s:codefix_batches = batches
        let cmd = " +call\\ s:applyCodeFix() "
        let open = tscompletejob#utils#is_buf_exists(file) ? ":buffer" : ":edit"
        exec open . cmd . file
        unlet s:codefix_batches
        call s:ensureReload(file)
    endfor

    call s:formatImpl(min(starts), max(ends))

endfunc

func! s:confirmFix(res) abort
    if len(a:res) == 0
        return {}
    elseif len(a:res) == 1
        let fix = a:res[0]
    else
        let idx = s:selectCodeFix(a:res)
        if idx < 0 || len(a:res) < idx
            return {}
        endif
        let fix = a:res[idx]
    endif

    if g:tscompletejob_codefix_comfirm
        let result = input(fix.description . " y/n: ")
        if (result != "y" || result != "Y")
            call s:warn("canceled")
            return {}
        endif
    endif

    return fix
endfunc

func! s:selectCodeFix(res) abort
    let fixes = []
    for i in range(len(a:res))
        call add(fixes, i . ": " . a:res[i].description)
    endfor

    return inputlist(fixes)
endfunc

func! s:applyCodeFix() abort
    call s:applyEditBatches(s:codefix_batches)
endfunc

"}}}

" {{{ plugin initialize
func! s:defineConfg(force, name, ...)
    if a:0 == 1 && (!exists(a:name) || a:force)
        exec "let " . a:name " = " . string(a:1)
    elseif a:0 == 0 && exists(a:name) && a:force
        exec "unlet " . a:name
    endif
endfunc

func! tscompletejob#init_plugin(force)
    call s:defineConfg(a:force, "g:tscompletejob__debug__", 0)
    call s:defineConfg(a:force, "g:tscompletejob__preflog__", 0)

    call s:defineConfg(a:force, "g:tscompletejob_node_cmd", "node")
    call s:defineConfg(a:force, "g:tscompletejob_custom_tsserverlibrary")
    call s:defineConfg(a:force, "g:tscompletejob_use_legacy")
    call s:defineConfg(a:force, "g:tscompletejob_custom_tsserver")
    call s:defineConfg(a:force, "g:tscompletejob_autoload_filetypes", [".ts", ".tsx"])
    call s:defineConfg(a:force, "g:tscompletejob_load_on_buf_open", 1)
    call s:defineConfg(a:force, "g:tscompletejob_ignore_file_patterns", [])

    call s:defineConfg(a:force, "g:tscompletejob_mappings_disable_default", 0)

    call s:defineConfg(a:force, "g:tscompletejob_complete_disable", 0)
    call s:defineConfg(a:force, "g:tscompletejob_complete_disable_detail", 0)
    call s:defineConfg(a:force, "g:tscompletejob_complete_max_detail_count", 50)

    call s:defineConfg(a:force, "g:tscompletejob_enable_tagstack", 0)

    call s:defineConfg(a:force, "g:tscompletejob_signature_help_disable", 0)
    call s:defineConfg(a:force, "g:tscompletejob_signature_help_disable_docs", 0)

    call s:defineConfg(a:force, "g:tscompletejob_format_options", {
                \ "insertSpaceAfterCommaDelimiter": v:true,
                \ "insertSpaceAfterSemicolonInForStatements": v:true,
                \ "insertSpaceBeforeAndAfterBinaryOperators": v:true,
                \ "insertSpaceAfterKeywordsInControlFlowStatements": v:true,
                \ "insertSpaceAfterFunctionKeywordForAnonymousFunctions": v:false,
                \ "insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis": v:false,
                \ "insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets": v:false,
                \ "insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces": v:false,
                \ "insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces": v:false,
                \ "placeOpenBraceOnNewLineForFunctions": v:false,
                \ "placeOpenBraceOnNewLineForControlBlocks": v:false,
                \ })

    call s:defineConfg(a:force, "g:tscompletejob_codefix_comfirm", 0)
endfunc
" }}}

" {{{ for testing
func! tscompletejob#get_plugin_dir()
    return fnamemodify(s:script_dir, ":h")
endfunc

func! tscompletejob#enable_perflog()
    let g:tscompletejob__preflog__ = 1
endfunc

func! tscompletejob#enable_debug()
    let g:tscompletejob__debug__ = 1
endfunc

func! tscompletejob#dump()
    echom tscompletejob#status()
    echom string(s:bufmgr.getFileNames())
    for file in s:bufmgr.getFileNames()
        echom string(s:bufmgr.dumpFileContent(file))
    endfor
endfunc

func! tscompletejob#is_request_done(id) abort
    let r = s:tsclient.getRequest(a:id)
    if type(r) == type({})
        return v:false
    else
        return v:true
    endif
endfunc

func! tscompletejob#get_tagstack() abort
    return s:tagmgr.getTags()
endfunc
"}}}

call tscompletejob#init_plugin(0)
call s:init_client()

let &cpo = s:save_cpo
unlet s:save_cpo

" vim: set foldmethod=marker :
