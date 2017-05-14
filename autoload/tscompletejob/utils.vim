let s:save_cpo = &cpo
set cpo&vim

func! tscompletejob#utils#log(msg) abort
    if (g:tscompletejob__debug__)
        echom "[tsj]: " . a:msg
    endif
endfunc

let s:rel_tags = { }

func! tscompletejob#utils#perf_start(tag) abort
    if (g:tscompletejob__preflog__)
        let s:rel_tags[a:tag] = reltime()
        echom "[tsj] " . a:tag
    endif
endfunc

func! tscompletejob#utils#perf_log(tag, msg) abort
    if (g:tscompletejob__preflog__ && has_key(s:rel_tags, a:tag))
        let id = s:rel_tags[a:tag]
        echom "[tsj] " . reltimestr(reltime(id)) . " " . a:tag . " " . a:msg
    endif
endfunc

func! tscompletejob#utils#perf_clear(tag) abort
    if (g:tscompletejob__preflog__ && has_key(s:rel_tags, a:tag))
        unlet s:rel_tags[a:tag]
    endif
endfunc

func! tscompletejob#utils#is_same_file(f1, f2)
    let f1 = substitute(a:f1, "\\", "/", "g")
    let f2 = substitute(a:f2, "\\", "/", "g")
    return f1 == f2
endfunc

func! tscompletejob#utils#getconfig(name, default)
    return exists(a:name) ? eval(a:name) : a:default
endfunc

let s:pathsep = fnamemodify(".", ":p")[-1:]

func! tscompletejob#utils#join_path(p1,p2)
    return a:p1 . s:pathsep . a:p2
endfunc


if has("win32") || has("win64")
    func! tscompletejob#utils#is_abspath(path)
        return a:path =~? '^[a-z]:[/\\]'
    endfunc
else
    func! tscompletejob#utils#is_abspath(path)
        return a:path[0] ==# "/"
    endfunc
endif

func! tscompletejob#utils#is_remote_file(path)
    if a:path =~# '^\w\+::' || a:path =~# '^\w\+://'
        return 1
    else
        return 0
    endif
endfunc

func! tscompletejob#utils#abspath(path)
    if tscompletejob#utils#is_abspath(a:path) || tscompletejob#utils#is_remote_file(a:path)
        return a:path
    else
        return filereadable(a:path) ?
                    \ fnamemodify(a:path, ":p") :
                    \ tscompletejob#utils#join_path(fnamemodify(getcwd(), ":p"), a:path)
    endif
endfunc

func! tscompletejob#utils#is_buf_exists(path)
    return bufnr(tscompletejob#utils#abspath(a:path)) != -1
endfunc

func! tscompletejob#utils#echo_warn(msg)
    echohl WarningMsg | echo a:msg | echohl None
endfunc


let &cpo = s:save_cpo
unlet s:save_cpo
