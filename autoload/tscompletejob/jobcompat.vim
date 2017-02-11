
func! s:nvimOnStdout(job, data, event) dict
    if type(a:data) == type([])
        for line in a:data
            if !empty(line) && line != "\r"
                call self.out_cb(self.this, a:job, line)
            endif
        endfor
    else
        call self.out_cb(self.this, a:job, a:data)
    endif
endfunc

func! s:nvimOnExit(job, data, event) dict
    call self.close_cb(self.this, a:job)
endfunc

func! s:nvimOnErr(job, data, event) dict
    call self.err_cb(self.this, a:job, a:data)
endfunc

func! tscompletejob#jobcompat#start(command, this, opts) abort
    if has('nvim')
        let nvim_opts = {
                    \ "this": a:this,
                    \ "on_stdout" : function("s:nvimOnStdout"),
                    \ "on_exit" : function("s:nvimOnExit"),
                    \ "out_cb" : a:opts.out_cb,
                    \ "err_cb" : a:opts.err_cb,
                    \ "close_cb" : a:opts.close_cb,
                    \ }
        return jobstart(a:command, nvim_opts)
    else
        let vim_opts = {
                    \ "out_cb": function(a:opts.out_cb, [a:this]),
                    \ "err_cb": function(a:opts.err_cb, [a:this]),
                    \ "close_cb" : function(a:opts.close_cb, [a:this]),
                    \ }
        return job_start(a:command, vim_opts)
    endif
endfunc

func! tscompletejob#jobcompat#stop(job) abort
    if has('nvim')
        call jobstop(a:job)
    else
        call job_stop(a:job)
    endif
endfunc

func! tscompletejob#jobcompat#send_raw(ch, data) abort
    if has('nvim')
        return jobsend(a:ch, a:data)
    else
        return ch_sendraw(a:ch, a:data)
    endif
endfunc

func! tscompletejob#jobcompat#status(job) abort
    if has('nvim')
        let r = jobwait([a:job], 1)[0]
        if r == -1
            return "run"
        elseif r == -3
            return "dead"
        endif
    else
        return job_status(a:job)
    endif
endfunc

func! tscompletejob#jobcompat#get_channel(job) abort
    if has('nvim')
        return a:job
    else
        return job_getchannel(a:job)
    endif
endfunc

