let s:save_cpo = &cpo
set cpo&vim

let s:instanceCount = 0

func! tscompletejob#bufmanager#create()
    let obj = {
              \ "buffers" : { },
              \ "getFileNames" : function("s:getFileNames"),
              \ "addBuffer" : function("s:addBuffer"),
              \ "getTmpFile" : function("s:getTmpFile"),
              \ "flushTmpFile" : function("s:flushTmpFile"),
              \ "dumpFileContent" : function("s:dumpFileContent"),
              \ "isOpened": function("s:isOpened"),
              \ }
    let s:instanceCount += 1
    return obj
endfunc

func! s:getkey(filename)
    return bufnr(a:filename)
endfunc

func! s:getFileNames() dict
    return map(values(self.buffers), "v:val['filename']")
endfunc

func! s:addBuffer(filename) dict
    let bn = s:getkey(a:filename)
    let filename = tscompletejob#utils#abspath(a:filename)
    if (l:bn == -1)
        throw "invalid buffer"
    elseif (!has_key(self.buffers, string(bn)))
        let self.buffers[string(l:bn)] = {
                    \ "filename" : filename,
                    \ "tmpfile" : tempname(),
                    \ "is_opened" : 0,
                    \ }
    endif
    return bn
endfunc

func! s:getTmpFile(filename) dict
    let l:key = self.addBuffer(a:filename)
    return self.buffers[l:key].tmpfile
endfunc

func! s:isOpened(filename, ...) dict
    let l:key = self.addBuffer(a:filename)
    if a:0 == 0
        return self.buffers[l:key].is_opened
    elseif a:0 == 1
        let self.buffers[l:key].is_opened = a:1
        return a:1
    endif
endfunc

func! s:flushTmpFile(filename) dict
    let l:tmp = self.getTmpFile(a:filename)
    let content = self.dumpFileContent(a:filename)
    call writefile(content, l:tmp)
    return l:tmp
endfunc

func! s:dumpFileContent(filename) dict
    if (tscompletejob#utils#is_buf_exists(a:filename))
        let content = getbufline(bufname(a:filename), 1, "$")
    else
        let content = readfile(a:filename)
    endif
    return content
endfunc

let &cpo = s:save_cpo
unlet s:save_cpo
