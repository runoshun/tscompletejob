if exists('g:loaded_tscompletejob_plugin')
    finish
endif
let g:loaded_tscompletejob_plugin = 1

let s:save_cpo = &cpo
set cpo&vim

if(!exists("g:tscompletejob_autoload_filetypes"))
    let g:tscompletejob_autoload_filetypes = ["ts", "tsx"]
endif

augroup tscompletejob_autoload_buffer
    autocmd!
    for filetype in g:tscompletejob_autoload_filetypes
        exec "autocmd BufRead *." . filetype . " call tscompletejob#add_buffer(expand(\"<afile>\"))"
    endfor
augroup END

let &cpo = s:save_cpo
unlet s:save_cpo
