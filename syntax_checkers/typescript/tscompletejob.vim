if exists("g:loaded_syntastic_tscompletejob_syntax_checker")
    finish
endif

let g:loaded_syntastic_tscompletejob_syntax_checker = 1
let s:saved_cpo = &cpo
set cpo&vim

func! SyntaxCheckers_typescript_tscompletejob_IsAvailable() dict abort
    return executable(g:tscompletejob_node_cmd)
endfunc

func! SyntaxCheckers_typescript_tscompletejob_GetLocList() dict abort
    return tscompletejob#get_qfixlist()
endfunc

call g:SyntasticRegistry.CreateAndRegisterChecker({
            \ "filetype" : "typescript",
            \ "name" : "tscompletejob",
            \ })


let &cpo = s:saved_cpo
unlet s:saved_cpo
