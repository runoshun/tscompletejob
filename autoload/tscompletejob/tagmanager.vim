let s:save_cpo = &cpo
set cpo&vim

func! tscompletejob#tagmanager#create()
    let obj = {
              \ "pushTag": function("s:pushTag"),
              \ "pushTagWithCurrentPos": function("s:pushTagWithCurrentPos"),
              \ "getCurrentIndex": function("s:getCurrentIndex"),
              \ "setCurrentIndex": function("s:setCurrentIndex"),
              \ "followTags": function("s:followTags"),
              \ "getMaxIndex": function("s:getMaxIndex"),
              \ "getTags": function("s:getTags"),
              \ "tags": [],
              \ "tagsHistory": [],
              \ "currentTagIndex": -1,
              \ }
    return obj
endfunc

func! s:push(arr, el)
    call insert(a:arr, a:el, len(a:arr))
endfunc

func! s:createTag(filename, line, col)
    let tag = {
        \ "filename": a:filename,
        \ "line": a:line,
        \ "col": a:col
        \}
    return tag
endfunc

func! s:pushTag(filename, line, col) dict
    let tag = s:createTag(a:filename, a:line, a:col)
    let cur_idx = self.getCurrentIndex()
    if cur_idx == self.getMaxIndex()
        call s:push(self.tags, tag)
        let self.currentTagIndex = cur_idx + 1
    else
        let old = self.tags
        let new = copy(old[:cur_idx - 1])
        call s:push(new, tag)
        let self.currentTagIndex = cur_idx + 1

        let self.tags = new
        call s:push(self.tagsHistory, old)
    endif
endfunc

func! s:pushTagWithCurrentPos() dict
    call self.pushTag(expand('%:p'), line("."), col("."))
endfunc

func! s:getCurrentIndex() dict
    return self.currentTagIndex
endfunc

func! s:setCurrentIndex(idx) dict
    if a:idx < 0 || self.getMaxIndex() < a:idx
        throw "invalid tag index"
    endif

    let tag = self.tags[a:idx]

    let cur_file = expand("%:p")
    if (!tscompletejob#utils#is_same_file(tag.filename, cur_file))
        exec "e " . tag.file
    endif
    call cursor(tag.line, tag.col)

    let self.currentTagIndex = a:idx
endfunc

func! s:followTags(rel_idx) dict
    let cur_idx = self.getCurrentIndex()
    let max_idx = self.getMaxIndex()

    if a:rel_idx == 0
        return
    elseif cur_idx == 0 && a:rel_idx < 0
        echo "Begining of the tag stack"
    elseif cur_idx == max_idx && a:rel_idx > 0
        echo "End of the tag stack"
    endif

    let to_idx = cur_idx + a:rel_idx
    call self.setCurrentIndex(to_idx)
endfunc

func! s:getMaxIndex() dict
    return len(self.tags) - 1
endfunc

func! s:getTags() dict
    return self.tags
endfunc

let &cpo = s:save_cpo
unlet s:save_cpo

