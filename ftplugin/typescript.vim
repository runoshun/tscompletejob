if (exists("b:loaded_syntastic_tscompletejob_ftplugin_loaded"))
    finish
endif
let g:loaded_syntastic_tscompletejob_ftplugin_loaded = 1

let s:save_cpo = &cpo
set cpo&vim

call tscompletejob#init_plugin(0)

if (!g:tscompletejob_complete_disable)
    setlocal omnifunc=tscompletejob#complete
endif

command! -buffer TsCompleteJobRestart           :call tscompletejob#restart()
command! -buffer TsCompleteJobStatus            :call tscompletejob#status()
command! -buffer TsCompleteJobGotoDefinition    :call tscompletejob#goto_definition()
command! -buffer TsCompleteJobQuickInfo         :call tscompletejob#quickinfo()
command! -buffer TsCompleteJobReferences        :call tscompletejob#references()
command! -buffer TsCompleteJobRename            :call tscompletejob#rename(0,0)
command! -buffer -range=% TsCompleteJobFormat   :<line1>,<line2>call tscompletejob#format()

nnoremap <silent> <buffer> <Plug>(TsCompleteJobGotoDefinition)  :TsCompleteJobGotoDefinition<CR>
nnoremap <silent> <buffer> <Plug>(TsCompleteJobQuickInfo)       :TsCompleteJobQuickInfo<CR>
nnoremap <silent> <buffer> <Plug>(TsCompleteJobReferences)      :TsCompleteJobReferences<CR>
nnoremap <silent> <buffer> <Plug>(TsCompleteJobRename)          :TsCompleteJobRename<CR>
nnoremap <silent> <buffer> <Plug>(TsCompleteJobFormat)          :TsCompleteJobFormat<CR>

vnoremap <silent> <buffer> <Plug>(TsCompleteJobFormat)          :TsCompleteJobFormat<CR>

if (!g:tscompletejob_mappings_disable_default)
    nmap <buffer> <C-]>          <Plug>(TsCompleteJobGotoDefinition)
    nmap <buffer> <LocalLeader>i <Plug>(TsCompleteJobQuickInfo)
    nmap <buffer> <LocalLeader>u <Plug>(TsCompleteJobReferences)
    nmap <buffer> <LocalLeader>r <Plug>(TsCompleteJobRename)
    nmap <buffer> <LocalLeader>f <Plug>(TsCompleteJobFormat)

    vmap <buffer> <LocalLeader>f <Plug>(TsCompleteJobFormat)
endif

if (!g:tscompletejob_signature_help_disable)
    autocmd CursorHoldI <buffer> if (tscompletejob#signature_help())
    autocmd CursorHoldI <buffer>    call tscompletejob#signature_help_start()
    autocmd CursorHoldI <buffer> endif
endif

let &cpo = s:save_cpo
unlet s:save_cpo

