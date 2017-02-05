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
                \ "requestHasCallback": function("s:requestHasCallback"),
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

func! s:sendCommand(command, responseHandler, arguments) dict
    call self.ensureStart()
    let id = self.curr_request_id
    let self.curr_request_id += 1
    let com = { "type" : "request",
              \ "command": a:command,
              \ "seq": id,
              \ "arguments": a:arguments,
              \ }

    if type(a:responseHandler) == v:t_func " handled by user callback
        let self.requests[string(id)] = { "callback" : a:responseHandler }
    elseif a:responseHandler " handled by waitResponse()
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
        let res = json_decode(a:msg)
        if type(res) == type({})
        \ && has_key(res, "request_seq")
        \ && has_key(self.requests, string(res.request_seq))
            let id = string(res.request_seq)
            let req = self.getRequest(id)
            let success = has_key(res, "success") ? res.success : 1
            if (success)
                let response = has_key(res, "body") ? res.body : ""
            else
                let response = has_key(res, "message") ? res.message : ""
            endif

            if self.requestHasCallback(id)
                let Callback = req.callback
                call Callback(success, response)
                call self.destroyRequest(id)
            else
                let req.received = 1
                let req.success = success
                let req.response = response
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
    if type(a:req_id) == v:t_number
        return self.requests[string(a:req_id)]
    else
        return self.requests[a:req_id]
    endif
endfunc

func! s:requestHasCallback(req_id) dict
    return has_key(self.getRequest(a:req_id), "callback")
endfunc

func! s:destroyRequest(req_id) dict
    if type(a:req_id) == v:t_number
        unlet self.requests[string(a:req_id)]
    else
        unlet self.requests[a:req_id]
    endif
endfunc

let &cpo = s:save_cpo
unlet s:save_cpo

