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
                \ "onOut": function("s:onOut"),
                \ "waitResponse": function("s:waitResponse"),
                \ "getRequest": function("s:getRequest"),
                \ "destroyRequest": function("s:destroyRequest"),
                \ }
    return obj
endfunc

func! s:status() dict
    if (has_key(self, "job"))
        return job_status(self.job)
    else
        return "not started"
    endif
endfunc

func! s:ensureStart() dict
    if (has_key(self, "job"))
        if (job_status(self.job) == "run")
            return
        endif
    endif

    let self.job = job_start(self.tssCommand, { "callback": self.onOut })
    let self.ch  = job_getchannel(self.job)
endfunc

func! s:ensureStop() dict
    if (has_key(self, "job"))
        call job_stop(self.job)
        unlet self.job
        unlet self.ch
    endif
endfunc

func! s:sendCommand(command, useResponse, arguments) dict
    call self.ensureStart()
    let id = self.curr_request_id
    let self.curr_request_id += 1
    let com = { "type" : "request",
              \ "command": a:command,
              \ "seq": id,
              \ "arguments": a:arguments,
              \ }

    if a:useResponse
        let self.requests[string(id)] = { "received" : 0 }
    endif

    call ch_sendraw(self.ch, json_encode(com))
    call ch_sendraw(self.ch, "\r\n")
    return id
endfunc

func! s:onOut(job, msg) dict
    if a:msg =~ "^Content-Length:" || a:msg =~ "^No content"
        return
    endif

    try
        let l:res = json_decode(a:msg)
        if type(l:res) == type({})
        \ && has_key(l:res, "request_seq")
        \ && has_key(self.requests, string(l:res.request_seq))
            let l:req = self.requests[string(l:res.request_seq)]
            let l:req.received = 1
            let l:req.success = has_key(l:res, "success") ? l:res.success : 1
            if (l:req.success)
                let l:req.response = has_key(l:res, "body") ? l:res.body : ""
            else
                let l:req.response = has_key(l:res, "message") ? l:res.message : ""
            endif
        endif
    catch
        echoerr v:exception
    endtry

endfunc

func! s:waitResponse(req_id, ...) dict
    let request = self.getRequest(a:req_id)
    let do_complete_check = a:0 > 0 ? a:1 : 0
    while !request.received
        sleep 50m
        if complete_check() && do_complete_check
            self.destroyRequest(a:req_id)
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
    return self.requests[string(a:req_id)]
endfunc

func! s:destroyRequest(req_id) dict
    unlet self.requests[string(a:req_id)]
endfunc

let &cpo = s:save_cpo
unlet s:save_cpo

