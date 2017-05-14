let s:save_cpo = &cpo
set cpo&vim

func! tscompletejob#tsclient#create(command)
    let obj = {
                \ "tssCommand": a:command,
                \ "curr_request_id": 0,
                \ "requests" : { },
                \ "status" : function("s:status"),
                \ "ensureStart": function("s:ensureStart"),
                \ "ensureStop": function("s:ensureStop"),
                \ "sendCommand": function("s:sendCommand"),
                \ "waitResponse": function("s:waitResponse"),
                \ "getRequest": function("s:getRequest"),
                \ "requestHasCallback": function("s:requestHasCallback"),
                \ "destroyRequest": function("s:destroyRequest"),
                \ }
    return obj
endfunc

func! s:status() dict
    if (has_key(self, "job"))
        return tscompletejob#jobcompat#status(self.job)
    endif
    return "not started"
endfunc

func! s:ensureStart() dict
    if (self.status() == "run")
        return
    endif

    let self.job = tscompletejob#jobcompat#start(self.tssCommand, self, {
                \ 'out_cb' : function("s:onOut"),
                \ 'close_cb' : function("s:onClose"),
                \ 'err_cb' : function("s:onErr"),
                \ })
    let self.ch = tscompletejob#jobcompat#get_channel(self.job)
endfunc

func! s:clearResponseCache()
    let s:current_content_length = 0
    let s:current_content = ""
endfunc
call s:clearResponseCache()

func! s:onOut(self, job, msg) dict
    let this = a:self
    if a:msg =~ "^No content"
        call s:clearResponseCache()
        return
    elseif a:msg =~ "^Content-Length:"
        call s:clearResponseCache()
        let s:current_content_length = str2nr(a:msg[15:]) - 1 " 1 is termination cr
        return
    endif

    " in nvim, response data may be cut in the middle of json.
    " so we check content length and accumulate content if needed.
    let s:current_content = s:current_content . a:msg

    " in nvim windows(0.2), len() returns different result vim/nvim linux (may
    " be not included cr?)
    let len = len(s:current_content)
    "call tscompletejob#utils#log("content_length = " . s:current_content_length)
    "call tscompletejob#utils#log("len = " . len)
    if s:current_content_length > len
        return
    endif

    try
        let res = json_decode(s:current_content)
        if type(res) == type({})
                    \ && has_key(res, "request_seq")
                    \ && has_key(this.requests, string(res.request_seq))
            let id = string(res.request_seq)
            let req = this.getRequest(id)
            let success = has_key(res, "success") ? res.success : 1
            if (success)
                let response = has_key(res, "body") ? res.body : ""
            else
                let response = has_key(res, "message") ? res.message : ""
            endif

            if this.requestHasCallback(id)
                let Callback = req.callback
                let request_id = req.request_id
                call Callback(request_id, success, response)
                call this.destroyRequest(id)
            else
                let req.received = 1
                let req.success = success
                let req.response = response
            endif
        endif
    catch
        echoerr v:exception
    finally
        call s:clearResponseCache()
    endtry
endfunc

func! s:onClose(this, ch)
    call a:this.ensureStop()
endfunc

func! s:onErr(this, ch, data)
    echoerr string(a:data)
endfunc

func! s:ensureStop() dict
    if (has_key(self, "job"))
        call tscompletejob#jobcompat#stop(self.job)
        unlet self.job
        unlet self.ch
    endif
endfunc

func! s:sendCommand(command, responseHandler, arguments) dict
    call self.ensureStart()
    let id = self.curr_request_id
    let self.curr_request_id += 1
    let com = { "type" : "request",
              \ "command": a:command,
              \ "seq": id,
              \ "arguments": a:arguments,
              \ }

    if type(a:responseHandler) == type({}) " handled by user defined callback with req id
        let self.requests[string(id)] = {
                    \ "callback": a:responseHandler.callback,
                    \ "request_id": a:responseHandler.request_id
                    \ }
    elseif type(a:responseHandler) == type(function("tr")) " handled by user callback
        let self.requests[string(id)] = {
                    \ "callback" : a:responseHandler,
                    \ "request_id" : -1
                    \ }
    elseif a:responseHandler " handled by waitResponse()
        let self.requests[string(id)] = { "received" : 0 }
    endif

    call tscompletejob#jobcompat#send_raw(self.ch, json_encode(com))
    call tscompletejob#jobcompat#send_raw(self.ch, "\r\n")
    return id
endfunc

func! s:waitResponse(req_id, ...) dict
    let request = self.getRequest(a:req_id)
    let do_complete_check = a:0 > 0 ? a:1 : 0
    while !request.received
        sleep 50m
        if complete_check() && do_complete_check
            call self.destroyRequest(a:req_id)
            throw "cancel:"
        endif
    endwhile
    if !request.success
        throw  "error: " . request.response
    endif
    call self.destroyRequest(a:req_id)
    return request.response
endfunc

func! s:getRequest(req_id) dict
    if type(a:req_id) == type(1)
        let key = string(a:req_id)
    else
        let key = a:req_id
    endif

    if has_key(self.requests, key)
        return self.requests[key]
    else
        return v:false
    endif
endfunc

func! s:requestHasCallback(req_id) dict
    return has_key(self.getRequest(a:req_id), "callback")
endfunc

func! s:destroyRequest(req_id) dict
    if type(a:req_id) == type(1)
        unlet self.requests[string(a:req_id)]
    else
        unlet self.requests[a:req_id]
    endif
endfunc

let &cpo = s:save_cpo
unlet s:save_cpo

